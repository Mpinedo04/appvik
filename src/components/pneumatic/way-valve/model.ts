import { num, str, type ComponentModel, type ParamDef } from '../../../core/registry';
import { conductanceFromNominalFlow, paToBarGauge } from '../../../core/units';
import { pathOpening, valvePortPos, type WayValveConfig } from './config';

export interface WayValveState {
  /** Posición de la corredera: 0 = reposo (casilla derecha), 1 = accionada (casilla izquierda). */
  spool: number;
  /** Pulsador o pedal presionado ahora mismo. */
  pressed: boolean;
  /** Palanca con enclavamiento en posición accionada. */
  latched: boolean;
  /** Apertura actual de cada conexión, en el orden de `paths` de la configuración. */
  openings: number[];
  /** Presión relativa en cada puerto [bar] (para colorear el símbolo y el modelo 3D). */
  portBar: Record<string, number>;
}

interface Handles {
  orifices: { from: string; to: string; pos: 0 | 1; index: number }[];
  ports: { id: string; node: number }[];
}

/** Tiempo de conmutación de la corredera [s]. */
const SWITCH_TIME = 0.015;

export const LEFT_ACTUATORS = [
  { value: 'pushbutton', label: 'Pulsador' },
  { value: 'lever', label: 'Palanca con enclavamiento' },
  { value: 'pedal', label: 'Pedal' },
];

export const RIGHT_ACTUATORS = [
  { value: 'spring', label: 'Muelle de retorno' },
  { value: 'none', label: 'Ninguno' },
];

const ACT_NAMES: Record<string, string> = {
  pushbutton: 'el pulsador',
  lever: 'la palanca',
  pedal: 'el pedal',
};

/** Lista plana de conexiones de las dos posiciones. */
export function allPaths(cfg: WayValveConfig) {
  return cfg.positions.flatMap((pos, i) =>
    pos.paths.map(([from, to]) => ({ from, to, pos: i as 0 | 1 })),
  );
}

export function makeWayValveModel(cfg: WayValveConfig): ComponentModel<WayValveState, Handles> {
  const paths = allPaths(cfg);
  const params: ParamDef[] = [
    {
      key: 'actLeft',
      label: 'Accionamiento',
      type: 'select',
      default: 'pushbutton',
      options: LEFT_ACTUATORS,
    },
    {
      key: 'actRight',
      label: 'Retorno',
      type: 'select',
      default: 'spring',
      options: RIGHT_ACTUATORS,
    },
    {
      key: 'qn',
      label: 'Caudal nominal',
      unit: 'l/min',
      type: 'number',
      default: 300,
      min: 10,
      max: 5000,
      step: 10,
    },
  ];

  const leftActive = (s: WayValveState, actLeft: string) =>
    actLeft === 'lever' ? s.latched : s.pressed;

  return {
    type: cfg.type,
    category: 'directional',
    name: cfg.name,
    description: cfg.description,
    autoLabel: (n) => `1V${n}`,
    params,
    ports: () =>
      cfg.ports.map((pc) => ({
        id: pc.id,
        medium: 'pneu' as const,
        ...valvePortPos(cfg, pc),
        dir: pc.side === 'top' ? ('up' as const) : ('down' as const),
        label: `${pc.id} (${pc.role})`,
        exhaust: pc.exhaust,
      })),
    bbox: () => ({ x0: -cfg.boxW - 25, y0: -30, x1: cfg.boxW + 25, y1: 30 }),
    interactive: () => true,
    initState: () => ({
      spool: 0,
      pressed: false,
      latched: false,
      openings: paths.map((p) => (p.pos === 1 ? 1 : 0)),
      portBar: Object.fromEntries(cfg.ports.map((pc) => [pc.id, 0])),
    }),
    build(b, p) {
      const C = conductanceFromNominalFlow(num(p, 'qn'));
      return {
        orifices: paths.map((path) => ({
          ...path,
          index: b.addOrifice(b.port(path.from), b.port(path.to), {
            C,
            name: `${cfg.short} ${path.from}→${path.to}`,
          }),
        })),
        ports: cfg.ports.map((pc) => ({ id: pc.id, node: b.port(pc.id) })),
      };
    },
    update(ctx, s, h, p, dt) {
      let target = s.spool;
      if (leftActive(s, str(p, 'actLeft'))) target = 1;
      else if (str(p, 'actRight') === 'spring') target = 0;
      const maxStep = dt / SWITCH_TIME;
      s.spool += Math.max(-maxStep, Math.min(maxStep, target - s.spool));
      h.orifices.forEach((o, i) => {
        const f = pathOpening(s.spool, o.pos);
        s.openings[i] = f;
        ctx.setOpening(o.index, f);
      });
      for (const pt of h.ports) s.portBar[pt.id] = paToBarGauge(ctx.p(pt.node));
    },
    onUserAction(s, p, action) {
      if (action === 'press') {
        s.pressed = true;
        if (str(p, 'actLeft') === 'lever') s.latched = !s.latched;
      } else {
        s.pressed = false;
      }
    },
    explain(s, p, ctx) {
      const act = str(p, 'actLeft');
      const lines: string[] = [];
      if (s.spool > 0.95)
        lines.push(
          `Corredera desplazada: ${ACT_NAMES[act]} la mantiene en la posición accionada (casilla izquierda).`,
        );
      else if (s.spool < 0.05)
        lines.push(
          str(p, 'actRight') === 'spring'
            ? 'Corredera en reposo: el muelle la mantiene en la posición normal (casilla derecha).'
            : 'Corredera en la posición de la casilla derecha.',
        );
      else
        lines.push(
          `La corredera se está desplazando (${(s.spool * 100).toFixed(0)} %): durante el cruce todas las vías quedan cerradas un instante.`,
        );

      const bar = (port: string) => `${paToBarGauge(ctx.p(port)).toFixed(1)} bar`;
      const role = (id: string) => cfg.ports.find((x) => x.id === id)?.role ?? '';
      paths.forEach((path, i) => {
        if (s.openings[i] > 0.01)
          lines.push(
            `Vía ${path.from}→${path.to} abierta: ${role(path.from)} (${bar(path.from)}) comunica con ${role(path.to)} ${path.to} (${bar(path.to)}).`,
          );
      });
      const active = s.spool > 0.5 ? cfg.positions[0] : cfg.positions[1];
      if (active.blocked.length) lines.push(`Vía bloqueada: ${active.blocked.join(', ')}.`);
      return lines;
    },
  };
}

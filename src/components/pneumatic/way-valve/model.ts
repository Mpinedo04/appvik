import type { Params } from '../../../core/model/types';
import {
  num,
  str,
  type CategoryId,
  type ComponentModel,
  type ParamDef,
  type PortDef,
} from '../../../core/registry';
import {
  cm3,
  conductanceFromNominalFlow,
  oilKFromNominalFlow,
  paToBarGauge,
} from '../../../core/units';
import {
  ACT_NAME,
  actuationParams,
  initActuation,
  isManual,
  onUserPress,
  sideActive,
  targetBox,
  type ActuationState,
  type ActuatorType,
} from '../actuation';
import { boxesExtent, pathOpening, valvePortPos, type WayValveConfig } from './config';

export interface WayValveState extends ActuationState {
  /** Índice continuo de la casilla que está bajo los puertos (reposo = cfg.rest). */
  pos: number;
  /** Apertura actual de cada vía, en el orden de `allPaths(cfg)`. */
  openings: number[];
  /** Caudal másico por cada vía [kg/s] (positivo en el sentido desde → hacia). */
  flows: number[];
  /** Presión relativa en cada puerto [bar] (para colorear el símbolo y el modelo 3D). */
  portBar: Record<string, number>;
}

interface Handles {
  orifices: { from: string; to: string; box: number; index: number }[];
  ports: { id: string; node: number }[];
  pilotLeft: number | null;
  pilotRight: number | null;
  supply: number | null;
}

/** Tiempo que tarda la corredera en recorrer una casilla [s]: las válvulas pequeñas son más rápidas. */
const switchTime = (cfg: WayValveConfig) => (cfg.boxW <= 40 ? 0.006 : 0.012);
const PILOT_VOLUME = cm3(0.3);

/** Lista plana de las vías de todas las casillas. */
export function allPaths(cfg: WayValveConfig) {
  return cfg.positions.flatMap((pos, box) => pos.paths.map(([from, to]) => ({ from, to, box })));
}

export const hasPilot = (p: Params, side: 'left' | 'right') =>
  str(p, side === 'left' ? 'actLeft' : 'actRight') === 'pilot';

/** Puertos de pilotaje (14/12…) a los lados del símbolo. */
export function pilotPorts(cfg: WayValveConfig, p: Params): PortDef[] {
  const { left, right } = boxesExtent(cfg);
  const out: PortDef[] = [];
  const medium = cfg.medium ?? 'pneu';
  if (hasPilot(p, 'left'))
    out.push({
      id: cfg.pilots.left,
      medium,
      x: left - 30,
      y: 0,
      dir: 'left',
      label: `${cfg.pilots.left} (pilotaje)`,
    });
  if (hasPilot(p, 'right'))
    out.push({
      id: cfg.pilots.right,
      medium,
      x: right + 30,
      y: 0,
      dir: 'right',
      label: `${cfg.pilots.right} (pilotaje)`,
    });
  return out;
}

/** Variante preconfigurada de una válvula (final de carrera, 5/2 pilotada, de secuencia…). */
export interface ValvePreset {
  category?: CategoryId;
  autoLabel?: (n: number) => string;
  /** Valores por defecto distintos de los genéricos. */
  defaults?: Params;
}

export function makeWayValveModel(
  cfg: WayValveConfig,
  preset: ValvePreset = {},
): ComponentModel<WayValveState, Handles> {
  const paths = allPaths(cfg);
  const n = cfg.positions.length;
  const hyd = cfg.medium === 'hyd';
  const params: ParamDef[] = [
    ...actuationParams(
      n >= 3
        ? { left: 'pushbutton', right: 'pushbutton' }
        : { left: 'pushbutton', right: 'spring' },
    ),
    {
      key: 'qn',
      label: hyd ? 'Caudal nominal (a 5 bar)' : 'Caudal nominal',
      unit: 'l/min',
      type: 'number',
      default: hyd ? 40 : 300,
      min: hyd ? 1 : 10,
      max: 5000,
      step: hyd ? 1 : 10,
    },
  ];
  // En las de 3 posiciones los muelles centran la corredera además del accionamiento de cada lado.
  if (n >= 3)
    params.push({ key: 'springs', label: 'Centrado por muelles', type: 'boolean', default: true });
  for (const d of params) {
    const v = preset.defaults?.[d.key];
    if (v !== undefined) (d as { default: unknown }).default = v;
  }
  const springReturn = (p: Params) =>
    (n >= 3 && Boolean(p.springs)) ||
    str(p, 'actLeft') === 'spring' ||
    str(p, 'actRight') === 'spring';

  return {
    type: cfg.type,
    category: preset.category ?? 'directional',
    name: cfg.name,
    description: cfg.description,
    autoLabel: preset.autoLabel ?? ((k) => `1V${k}`),
    params,
    ports: (p) => [
      ...cfg.ports.map((pc) => ({
        id: pc.id,
        medium: cfg.medium ?? ('pneu' as const),
        ...valvePortPos(cfg, pc),
        dir: pc.side === 'top' ? ('up' as const) : ('down' as const),
        label: `${pc.id} (${pc.role})`,
        exhaust: pc.exhaust,
      })),
      ...pilotPorts(cfg, p),
    ],
    bbox: (p) => {
      const { left, right } = boxesExtent(cfg);
      return {
        x0: left - (hasPilot(p, 'left') ? 30 : 25),
        y0: -30,
        x1: right + (hasPilot(p, 'right') ? 30 : 25),
        y1: 30,
      };
    },
    interactive: (p) => isManual(str(p, 'actLeft')) || isManual(str(p, 'actRight')),
    initState: () => ({
      ...initActuation(),
      pos: cfg.rest,
      openings: paths.map((pt) => (pt.box === cfg.rest ? 1 : 0)),
      flows: paths.map(() => 0),
      portBar: Object.fromEntries(cfg.ports.map((pc) => [pc.id, 0])),
    }),
    build(b, p) {
      const flow = hyd
        ? { K: oilKFromNominalFlow(num(p, 'qn')) }
        : { C: conductanceFromNominalFlow(num(p, 'qn')) };
      const pilot = (side: 'left' | 'right') => {
        if (!hasPilot(p, side)) return null;
        const node = b.port(side === 'left' ? cfg.pilots.left : cfg.pilots.right);
        b.addBaseVolume(node, PILOT_VOLUME);
        return node;
      };
      return {
        orifices: paths.map((path) => ({
          ...path,
          index: b.addOrifice(b.port(path.from), b.port(path.to), {
            ...flow,
            name: `${cfg.short} ${path.from}→${path.to}`,
          }),
        })),
        ports: [...cfg.ports, ...pilotPorts(cfg, p)].map((pc) => ({
          id: pc.id,
          node: b.port(pc.id),
        })),
        pilotLeft: pilot('left'),
        pilotRight: pilot('right'),
        supply: cfg.ports.some((pc) => pc.id === (hyd ? 'P' : '1'))
          ? b.port(hyd ? 'P' : '1')
          : null,
      };
    },
    update(ctx, s, h, p, dt) {
      const io = {
        pilotBar: (side: 'left' | 'right') => {
          const node = side === 'left' ? h.pilotLeft : h.pilotRight;
          return node === null ? 0 : paToBarGauge(ctx.p(node));
        },
        supplyBar: () => (h.supply === null ? 0 : paToBarGauge(ctx.p(h.supply))),
        sensor: (label: string) => ({
          on: ctx.signal(label) > 0,
          dir: Math.sign(ctx.signal(`${label}:dir`)),
        }),
      };
      s.leftOn = sideActive('left', s, p, io);
      s.rightOn = sideActive('right', s, p, io);
      if (s.leftOn && !s.rightOn) s.memory = 'left';
      else if (s.rightOn && !s.leftOn) s.memory = 'right';
      const target = targetBox(s.pos, n, cfg.rest, s.leftOn, s.rightOn, p, s.memory);
      const maxStep = dt / switchTime(cfg);
      s.pos += Math.max(-maxStep, Math.min(maxStep, target - s.pos));
      h.orifices.forEach((o, i) => {
        const f = pathOpening(s.pos, o.box);
        s.openings[i] = f;
        s.flows[i] = ctx.massFlow(o.index);
        ctx.setOpening(o.index, f);
      });
      for (const pt of h.ports) s.portBar[pt.id] = paToBarGauge(ctx.p(pt.node));
    },
    onUserAction(s, p, action, side) {
      onUserPress(s, p, action, side);
    },
    explain(s, p, ctx) {
      const lines: string[] = [];
      const box = Math.round(s.pos);
      const boxName = (i: number) =>
        n === 2
          ? i === 0
            ? 'casilla izquierda'
            : 'casilla derecha'
          : ['casilla izquierda', 'casilla central', 'casilla derecha'][i];
      const who = s.leftOn
        ? (str(p, 'actLeft') as ActuatorType)
        : s.rightOn
          ? (str(p, 'actRight') as ActuatorType)
          : null;
      if (Math.abs(s.pos - box) > 0.05)
        lines.push(
          `La corredera se está desplazando: durante el cruce todas las vías quedan cerradas un instante.`,
        );
      else if (who) lines.push(`Corredera en la ${boxName(box)}: la mantiene ${ACT_NAME[who]}.`);
      else if (box === cfg.rest && springReturn(p))
        lines.push(
          `Corredera en reposo (${boxName(box)}): la sujeta${n >= 3 ? 'n los muelles' : ' el muelle'}.`,
        );
      else
        lines.push(
          `Corredera en la ${boxName(box)} (sin accionamiento: se queda donde está, efecto memoria).`,
        );

      const bar = (port: string) => `${paToBarGauge(ctx.p(port)).toFixed(1)} bar`;
      const role = (id: string) => cfg.ports.find((x) => x.id === id)?.role ?? '';
      paths.forEach((path, i) => {
        if (s.openings[i] > 0.01)
          lines.push(
            `Vía ${path.from}→${path.to} abierta: ${role(path.from)} (${bar(path.from)}) comunica con ${role(path.to)} ${path.to} (${bar(path.to)}).`,
          );
      });
      const blocked = cfg.positions[box]?.blocked ?? [];
      if (blocked.length) lines.push(`Vías bloqueadas: ${blocked.join(', ')}.`);
      for (const side of ['left', 'right'] as const) {
        if (hasPilot(p, side)) {
          const port = side === 'left' ? cfg.pilots.left : cfg.pilots.right;
          lines.push(
            `Pilotaje ${port}: ${bar(port)} (${paToBarGauge(ctx.p(port)) >= num(p, 'pilotBar') ? 'suficiente para empujar la corredera' : `por debajo de ${num(p, 'pilotBar')} bar`}).`,
          );
        }
      }
      return lines;
    },
  };
}

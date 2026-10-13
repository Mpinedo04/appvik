/** Válvulas de caudal y de presión. */
import { num, type ComponentModel } from '../../../core/registry';
import { conductanceFromNominalFlow, paToBarGauge, RHO_ANR } from '../../../core/units';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lmin = (mdot: number) => (mdot / RHO_ANR) * 60_000;

const inlinePorts = (in1 = '1 (entrada)', out2 = '2 (salida)') => [
  { id: '1', medium: 'pneu' as const, x: 0, y: 30, dir: 'down' as const, label: in1 },
  { id: '2', medium: 'pneu' as const, x: 0, y: -30, dir: 'up' as const, label: out2 },
];

// ---------------------------------------------------------------- Estranguladora
export interface ThrottleState {
  flowLmin: number;
  /** Caudal por la antirretorno en paralelo (sólo la unidireccional) */
  freeLmin: number;
}

interface ThrottleHandles {
  thr: number;
  check: number | null;
  n1: number;
  n2: number;
}

function throttle(oneWay: boolean): ComponentModel<ThrottleState, ThrottleHandles> {
  return {
    type: oneWay ? 'pneu-throttle-oneway' : 'pneu-throttle',
    category: 'flowpressure',
    name: oneWay ? 'Estranguladora antirretorno' : 'Válvula estranguladora',
    description: oneWay
      ? 'Estrangula el paso de 2 a 1 y deja paso libre de 1 a 2. Montada en el escape del cilindro regula su velocidad.'
      : 'Reduce la sección de paso con un tornillo de aguja: limita el caudal en ambos sentidos.',
    autoLabel: (n) => `1V${n}`,
    params: [
      {
        key: 'pct',
        label: 'Apertura del estrangulador',
        unit: '%',
        type: 'number',
        default: 30,
        min: 0,
        max: 100,
        step: 1,
      },
      {
        key: 'qn',
        label: 'Caudal nominal (100 %)',
        unit: 'l/min',
        type: 'number',
        default: 300,
        min: 10,
        max: 5000,
        step: 10,
      },
    ],
    ports: () =>
      oneWay
        ? inlinePorts('1 (paso libre hacia 2)', '2 (estrangulado hacia 1)')
        : inlinePorts('1', '2'),
    bbox: () => ({ x0: oneWay ? -30 : -15, y0: -30, x1: 15, y1: 30 }),
    initState: () => ({ flowLmin: 0, freeLmin: 0 }),
    build(b, p) {
      const C = conductanceFromNominalFlow(num(p, 'qn'));
      const n1 = b.port('1');
      const n2 = b.port('2');
      return {
        thr: b.addOrifice(n1, n2, { C: (C * num(p, 'pct')) / 100 }),
        check: oneWay ? b.addOrifice(n1, n2, { C: C * 1.5 }) : null,
        n1,
        n2,
      };
    },
    update(ctx, s, h) {
      if (h.check !== null) {
        const dp = paToBarGauge(ctx.p(h.n1)) - paToBarGauge(ctx.p(h.n2));
        ctx.setOpening(h.check, clamp01((dp - 0.05) / 0.1));
        s.freeLmin = lmin(ctx.massFlow(h.check));
      }
      s.flowLmin = lmin(ctx.massFlow(h.thr));
    },
    explain(s, p) {
      const lines = [`Aguja abierta al ${num(p, 'pct')} %.`];
      if (oneWay && s.freeLmin > 1)
        lines.push(
          `El aire va de 1 a 2: levanta la antirretorno y pasa libremente (${s.freeLmin.toFixed(0)} l/min).`,
        );
      else if (Math.abs(s.flowLmin) > 1)
        lines.push(
          `Pasan ${Math.abs(s.flowLmin).toFixed(0)} l/min de ${s.flowLmin > 0 ? '1 a 2' : '2 a 1'} por el estrangulador${oneWay ? ' (la antirretorno está cerrada)' : ''}.`,
        );
      else lines.push('No circula aire.');
      return lines;
    },
  };
}

export const throttleModel = throttle(false);
export const throttleOneWayModel = throttle(true);

// ---------------------------------------------------------------- Limitadora de presión
export interface ReliefState {
  open: number;
  p1: number;
  flowLmin: number;
}

export const reliefModel: ComponentModel<ReliefState, { o: number; n1: number }> = {
  type: 'pneu-relief',
  category: 'flowpressure',
  name: 'Válvula limitadora de presión',
  description:
    'Protege la instalación: si la presión en 1 supera el tarado del muelle, el obturador se levanta y descarga el aire a la atmósfera.',
  autoLabel: (n) => `0V${n}`,
  params: [
    {
      key: 'pset',
      label: 'Presión de tarado',
      unit: 'bar',
      type: 'number',
      default: 5,
      min: 0.2,
      max: 12,
      step: 0.1,
    },
    {
      key: 'qn',
      label: 'Caudal nominal',
      unit: 'l/min',
      type: 'number',
      default: 600,
      min: 10,
      max: 5000,
      step: 10,
    },
  ],
  ports: () => [
    { id: '1', medium: 'pneu', x: 0, y: 30, dir: 'down', label: '1 (presión)' },
    { id: '3', medium: 'pneu', x: 0, y: -30, dir: 'up', label: '3 (escape)', exhaust: true },
  ],
  bbox: () => ({ x0: -15, y0: -30, x1: 25, y1: 30 }),
  initState: () => ({ open: 0, p1: 0, flowLmin: 0 }),
  build: (b, p) => {
    const n1 = b.port('1');
    return {
      o: b.addOrifice(n1, b.port('3'), { C: conductanceFromNominalFlow(num(p, 'qn')) }),
      n1,
    };
  },
  update(ctx, s, h, p) {
    s.p1 = paToBarGauge(ctx.p(h.n1));
    s.open = clamp01((s.p1 - num(p, 'pset')) / 0.3);
    ctx.setOpening(h.o, s.open);
    s.flowLmin = lmin(ctx.massFlow(h.o));
  },
  explain: (s, p) =>
    s.open > 0.01
      ? [
          `La presión (${s.p1.toFixed(2)} bar) supera el tarado de ${num(p, 'pset')} bar: el obturador vence al muelle y descarga ${s.flowLmin.toFixed(0)} l/min.`,
        ]
      : [`Cerrada: ${s.p1.toFixed(2)} bar está por debajo del tarado de ${num(p, 'pset')} bar.`],
};

// ---------------------------------------------------------------- Reguladora de presión
export interface RegulatorState {
  open: number;
  relief: number;
  p1: number;
  p2: number;
}

export const regulatorModel: ComponentModel<
  RegulatorState,
  { o: number; r: number; n1: number; n2: number }
> = {
  type: 'pneu-regulator',
  category: 'flowpressure',
  name: 'Válvula reguladora de presión',
  description:
    'Mantiene constante la presión de salida 2 aunque varíe la de entrada. Si la salida sube por encima del valor ajustado, descarga el exceso por 3.',
  autoLabel: (n) => `0V${n}`,
  params: [
    {
      key: 'pset',
      label: 'Presión de salida',
      unit: 'bar',
      type: 'number',
      default: 4,
      min: 0,
      max: 12,
      step: 0.1,
    },
    {
      key: 'qn',
      label: 'Caudal nominal',
      unit: 'l/min',
      type: 'number',
      default: 800,
      min: 10,
      max: 5000,
      step: 10,
    },
  ],
  ports: () => [
    ...inlinePorts('1 (entrada)', '2 (salida regulada)'),
    { id: '3', medium: 'pneu', x: 30, y: 0, dir: 'right', label: '3 (escape)', exhaust: true },
  ],
  bbox: () => ({ x0: -20, y0: -30, x1: 30, y1: 30 }),
  initState: () => ({ open: 0, relief: 0, p1: 0, p2: 0 }),
  build: (b, p) => {
    const C = conductanceFromNominalFlow(num(p, 'qn'));
    const n1 = b.port('1');
    const n2 = b.port('2');
    return {
      o: b.addOrifice(n1, n2, { C }),
      r: b.addOrifice(n2, b.port('3'), { C: C * 0.3 }),
      n1,
      n2,
    };
  },
  update(ctx, s, h, p) {
    s.p1 = paToBarGauge(ctx.p(h.n1));
    s.p2 = paToBarGauge(ctx.p(h.n2));
    const set = num(p, 'pset');
    s.open = clamp01((set - s.p2) / 0.25);
    s.relief = clamp01((s.p2 - set - 0.1) / 0.25);
    ctx.setOpening(h.o, s.open);
    ctx.setOpening(h.r, s.relief);
  },
  explain(s, p) {
    const lines = [
      `Entrada ${s.p1.toFixed(2)} bar → salida ${s.p2.toFixed(2)} bar (ajuste: ${num(p, 'pset')} bar).`,
    ];
    if (s.relief > 0.01)
      lines.push('La salida supera el ajuste: la membrana sube y abre el escape secundario 3.');
    else if (s.open > 0.98)
      lines.push(
        'La salida está por debajo del ajuste: el muelle mantiene la válvula totalmente abierta.',
      );
    else if (s.open > 0.01)
      lines.push(
        'La membrana equilibra el muelle: la válvula se abre lo justo para mantener la presión.',
      );
    else lines.push('Salida a la presión ajustada: la válvula está cerrada (no hay consumo).');
    return lines;
  },
};

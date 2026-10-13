/** Válvulas de bloqueo y lógicas: antirretorno, selectora (O), simultaneidad (Y), escape rápido. */
import { num, type ComponentModel } from '../../../core/registry';
import { conductanceFromNominalFlow, paToBarGauge } from '../../../core/units';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** Histéresis para que bolas y discos no oscilen con presiones casi iguales [bar]. */
const HYST = 0.05;

// ---------------------------------------------------------------- Antirretorno
export interface CheckState {
  /** Elevación de la bola (0 = asentada, 1 = totalmente abierta). */
  lift: number;
  dp: number;
}

export const checkValveModel: ComponentModel<CheckState, { o: number; n1: number; n2: number }> = {
  type: 'pneu-check',
  category: 'logic',
  name: 'Válvula antirretorno',
  description:
    'Deja pasar el aire de 1 a 2 y lo bloquea de 2 a 1: la presión empuja una bola contra su asiento.',
  autoLabel: (n) => `1V${n}`,
  params: [
    {
      key: 'crack',
      label: 'Presión de apertura',
      unit: 'bar',
      type: 'number',
      default: 0.1,
      min: 0,
      max: 5,
      step: 0.05,
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
    { id: '1', medium: 'pneu', x: 0, y: 30, dir: 'down', label: '1 (entrada)' },
    { id: '2', medium: 'pneu', x: 0, y: -30, dir: 'up', label: '2 (salida)' },
  ],
  bbox: () => ({ x0: -15, y0: -30, x1: 15, y1: 30 }),
  initState: () => ({ lift: 0, dp: 0 }),
  build: (b, p) => {
    const n1 = b.port('1');
    const n2 = b.port('2');
    return { o: b.addOrifice(n1, n2, { C: conductanceFromNominalFlow(num(p, 'qn')) }), n1, n2 };
  },
  update(ctx, s, h, p) {
    s.dp = paToBarGauge(ctx.p(h.n1)) - paToBarGauge(ctx.p(h.n2));
    s.lift = clamp01((s.dp - num(p, 'crack')) / 0.1);
    ctx.setOpening(h.o, s.lift);
  },
  explain: (s) =>
    s.lift > 0.02
      ? [
          `La presión en 1 supera a la de 2 en ${s.dp.toFixed(2)} bar: levanta la bola y el aire pasa de 1 a 2.`,
        ]
      : [
          s.dp < 0
            ? `La presión en 2 es mayor (${(-s.dp).toFixed(2)} bar): aprieta la bola contra el asiento y bloquea el paso de 2 a 1.`
            : 'La bola está asentada: no hay diferencia de presión suficiente para abrirla.',
        ],
};

// ------------------------------------------------------- Selectora (O) / Simultaneidad (Y)
export interface ShuttleState {
  /** −1: obturador bloqueando la entrada 1a; +1: bloqueando 1b. */
  ball: number;
  p1a: number;
  p1b: number;
  p2: number;
}

interface ShuttleHandles {
  a: number;
  b: number;
  na: number;
  nb: number;
  n2: number;
}

function shuttle(kind: 'or' | 'and'): ComponentModel<ShuttleState, ShuttleHandles> {
  const or = kind === 'or';
  return {
    type: or ? 'pneu-shuttle-or' : 'pneu-shuttle-and',
    category: 'logic',
    name: or ? 'Válvula selectora (O)' : 'Válvula de simultaneidad (Y)',
    description: or
      ? 'Función lógica O: hay salida en 2 si llega aire por 1a, por 1b o por ambas. Una bola tapa la entrada sin presión.'
      : 'Función lógica Y: sólo hay salida en 2 si llega aire por 1a y por 1b a la vez. Sale la presión menor.',
    autoLabel: (n) => `1V${n}`,
    params: [
      {
        key: 'qn',
        label: 'Caudal nominal',
        unit: 'l/min',
        type: 'number',
        default: 500,
        min: 10,
        max: 5000,
        step: 10,
      },
    ],
    ports: () => [
      { id: '1a', medium: 'pneu', x: -30, y: 0, dir: 'left', label: '1 (entrada izquierda)' },
      { id: '1b', medium: 'pneu', x: 30, y: 0, dir: 'right', label: '1 (entrada derecha)' },
      { id: '2', medium: 'pneu', x: 0, y: -20, dir: 'up', label: '2 (salida)' },
    ],
    bbox: () => ({ x0: -30, y0: -20, x1: 30, y1: 10 }),
    initState: () => ({ ball: or ? -1 : 1, p1a: 0, p1b: 0, p2: 0 }),
    build: (b, p) => {
      const C = conductanceFromNominalFlow(num(p, 'qn'));
      const na = b.port('1a');
      const nb = b.port('1b');
      const n2 = b.port('2');
      return { a: b.addOrifice(na, n2, { C }), b: b.addOrifice(nb, n2, { C }), na, nb, n2 };
    },
    update(ctx, s, h) {
      s.p1a = paToBarGauge(ctx.p(h.na));
      s.p1b = paToBarGauge(ctx.p(h.nb));
      s.p2 = paToBarGauge(ctx.p(h.n2));
      // O: la entrada con más presión empuja la bola contra la otra.
      // Y: la entrada con más presión se bloquea a sí misma y pasa la de menos presión.
      const aWins = s.p1a > s.p1b + HYST;
      const bWins = s.p1b > s.p1a + HYST;
      if (aWins) s.ball = or ? 1 : -1;
      else if (bWins) s.ball = or ? -1 : 1;
      ctx.setOpening(h.a, s.ball > 0 ? 1 : 0);
      ctx.setOpening(h.b, s.ball < 0 ? 1 : 0);
    },
    explain(s) {
      const blocked = s.ball > 0 ? '1b (derecha)' : '1a (izquierda)';
      const open = s.ball > 0 ? '1a' : '1b';
      return [
        `Entradas: 1a = ${s.p1a.toFixed(1)} bar, 1b = ${s.p1b.toFixed(1)} bar → salida 2 = ${s.p2.toFixed(1)} bar.`,
        or
          ? `La bola tapa la entrada ${blocked}; la salida se comunica con ${open}, la de mayor presión.`
          : `El obturador tapa la entrada ${blocked} (la de mayor presión); a la salida sólo llega lo que entra por ${open}, la de menor presión.`,
        s.p2 > 0.5 ? 'Hay señal en la salida.' : 'No hay señal en la salida.',
      ];
    },
  };
}

export const shuttleOrModel = shuttle('or');
export const shuttleAndModel = shuttle('and');

// ---------------------------------------------------------------- Escape rápido
export interface QuickExhaustState {
  /** true: 1→2 abierto (llenado); false: 2→3 abierto (escape). */
  filling: boolean;
  p1: number;
  p2: number;
}

export const quickExhaustModel: ComponentModel<
  QuickExhaustState,
  { in: number; out: number; n1: number; n2: number }
> = {
  type: 'pneu-quick-exhaust',
  category: 'logic',
  name: 'Válvula de escape rápido',
  description:
    'Se monta junto al cilindro: al descargar, el aire sale directamente por el escape 3 sin volver por la tubería y la válvula, y el cilindro va más rápido.',
  autoLabel: (n) => `1V${n}`,
  params: [
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
    { id: '1', medium: 'pneu', x: 0, y: 30, dir: 'down', label: '1 (desde la válvula)' },
    { id: '2', medium: 'pneu', x: 0, y: -30, dir: 'up', label: '2 (hacia el cilindro)' },
    { id: '3', medium: 'pneu', x: 30, y: 0, dir: 'right', label: '3 (escape)', exhaust: true },
  ],
  bbox: () => ({ x0: -15, y0: -30, x1: 30, y1: 30 }),
  initState: () => ({ filling: true, p1: 0, p2: 0 }),
  build: (b, p) => {
    const C = conductanceFromNominalFlow(num(p, 'qn'));
    const n1 = b.port('1');
    const n2 = b.port('2');
    return { in: b.addOrifice(n1, n2, { C }), out: b.addOrifice(n2, b.port('3'), { C }), n1, n2 };
  },
  update(ctx, s, h) {
    s.p1 = paToBarGauge(ctx.p(h.n1));
    s.p2 = paToBarGauge(ctx.p(h.n2));
    if (s.p1 > s.p2 + HYST) s.filling = true;
    else if (s.p2 > s.p1 + HYST) s.filling = false;
    ctx.setOpening(h.in, s.filling ? 1 : 0);
    ctx.setOpening(h.out, s.filling ? 0 : 1);
  },
  explain: (s) =>
    s.filling
      ? [
          `El disco cierra el escape: el aire pasa de 1 (${s.p1.toFixed(1)} bar) a 2 (${s.p2.toFixed(1)} bar).`,
        ]
      : [
          `La presión en 2 (${s.p2.toFixed(1)} bar) supera a la de 1: el disco cierra 1 y el aire escapa directamente por 3.`,
        ],
};

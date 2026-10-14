/**
 * Componentes hidráulicos. Usan la misma red de fluidos que la neumática, con nodos y orificios
 * de aceite (ver src/core/sim/fluid/network.ts): presión por compresibilidad, caudal turbulento
 * q = K·√Δp, bombas como fuentes de caudal y acumuladores con gas precargado.
 */
import type { Params } from '../../core/model/types';
import {
  num,
  type ComponentModel,
  type ParamDef,
  type PortDef,
  type StepCtx,
} from '../../core/registry';
import {
  barGaugeToPa,
  cm3,
  oilKFromNominalFlow,
  paToBarGauge,
  RHO_OIL,
  toLmin,
} from '../../core/units';
import {
  areaOf,
  buildCyl,
  commonCylParams,
  explainCyl,
  initCyl,
  marksParam,
  parseMarks,
  updateCyl,
  type CylHandles,
  type CylState,
} from '../pneumatic/cylinder-core';
import { gaugeModel } from '../pneumatic/gauge/model';

const H = (id: string, x: number, y: number, dir: PortDef['dir'], label?: string): PortDef => ({
  id,
  medium: 'hyd',
  x,
  y,
  dir,
  label: label ?? id,
});

const bar = (ctx: StepCtx, node: number) => paToBarGauge(ctx.p(node));
/** Caudal [l/min] de un orificio de aceite. */
const lmin = (ctx: StepCtx, o: number) => toLmin(ctx.massFlow(o) / RHO_OIL);
/** Primer orden: la pieza (asiento, corredera) no se mueve instantáneamente. */
const follow = (cur: number, target: number, dt: number, tau = 0.003) =>
  dt <= 0 ? target : cur + (target - cur) * Math.min(1, dt / tau);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Apertura de una limitadora de presión: empieza a abrir en el tarado. */
function reliefTarget(pBar: number, pset: number) {
  const band = Math.max(1, 0.04 * pset);
  return clamp01((pBar - pset) / band);
}

/* ───────────── Alimentación ───────────── */

interface PowerUnitState {
  on: boolean;
  pBar: number;
  /** Caudal de la bomba y por la limitadora [l/min]. */
  q: number;
  qRelief: number;
  relief: number;
  /** Ángulo del eje del motor (para el 3D). */
  angle: number;
}

export const powerUnitModel: ComponentModel<
  PowerUnitState,
  { P: number; pump: number; relief: number }
> = {
  type: 'hyd-power-unit',
  category: 'hydraulic',
  name: 'Grupo hidráulico',
  description:
    'Motor eléctrico + bomba de cilindrada fija + depósito + limitadora de presión. Envía un caudal constante por P y recibe el retorno por T. Haz clic para arrancarlo o pararlo.',
  autoLabel: (n) => `0Z${n}`,
  params: [
    {
      key: 'flow',
      label: 'Caudal de la bomba',
      unit: 'l/min',
      type: 'number',
      default: 8,
      min: 0.5,
      max: 200,
      step: 0.5,
    },
    {
      key: 'pset',
      label: 'Tarado de la limitadora',
      unit: 'bar',
      type: 'number',
      default: 60,
      min: 5,
      max: 350,
      step: 5,
    },
    {
      key: 'autostart',
      label: 'Arrancar al iniciar la simulación',
      type: 'boolean',
      default: true,
    },
  ],
  ports: () => [
    H('P', -10, -40, 'up', 'P (presión)'),
    H('T', 10, -40, 'up', 'T (retorno al depósito)'),
  ],
  bbox: () => ({ x0: -40, y0: -40, x1: 40, y1: 30 }),
  interactive: () => true,
  initState: (p) => ({ on: Boolean(p.autostart), pBar: 0, q: 0, qRelief: 0, relief: 0, angle: 0 }),
  build(b, p) {
    const P = b.port('P');
    b.addOrifice(b.port('T'), b.atmosphere, { K: oilKFromNominalFlow(400) });
    return {
      P,
      pump: b.addSource(b.atmosphere, P),
      relief: b.addOrifice(P, b.atmosphere, { K: oilKFromNominalFlow(num(p, 'flow') * 3) }),
    };
  },
  update(ctx, s, h, p, dt) {
    s.pBar = bar(ctx, h.P);
    const pset = num(p, 'pset');
    // La bomba se «ahoga» muy por encima del tarado (protección si la limitadora no basta).
    const pmax = pset * 1.5 + 20;
    const stall = clamp01((pmax - s.pBar) / (0.05 * pmax));
    s.q = s.on ? num(p, 'flow') * stall : 0;
    ctx.setSource(h.pump, (s.q / 60_000) * RHO_OIL);
    s.relief = follow(s.relief, reliefTarget(s.pBar, pset), dt);
    ctx.setOpening(h.relief, s.relief);
    s.qRelief = lmin(ctx, h.relief);
    if (s.on) s.angle += ((1450 * 2 * Math.PI) / 60) * dt;
  },
  onUserAction(s, _p, action) {
    if (action === 'press') s.on = !s.on;
  },
  explain(s, p) {
    const lines = [
      s.on
        ? `Motor en marcha: la bomba aspira del depósito y envía ${s.q.toFixed(1)} l/min por P.`
        : 'Motor parado: la bomba no da caudal. Haz clic para arrancarlo.',
      `Presión en P: ${s.pBar.toFixed(1)} bar.`,
    ];
    if (s.relief > 0.01)
      lines.push(
        `La limitadora (tarada a ${num(p, 'pset')} bar) está abierta y devuelve ${Math.max(0, s.qRelief).toFixed(1)} l/min al depósito: el resto del circuito no puede tomar más aceite.`,
      );
    return lines;
  },
};

export const pumpModel: ComponentModel<
  { q: number; pBar: number; angle: number },
  { src: number; P: number; S: number }
> = {
  type: 'hyd-pump',
  category: 'hydraulic',
  name: 'Bomba hidráulica',
  description:
    'Bomba de cilindrada fija: aspira por S (del depósito) y da un caudal constante por P.',
  autoLabel: (n) => `0P${n}`,
  params: [
    {
      key: 'flow',
      label: 'Caudal',
      unit: 'l/min',
      type: 'number',
      default: 8,
      min: 0.5,
      max: 200,
      step: 0.5,
    },
    {
      key: 'pmax',
      label: 'Presión máxima',
      unit: 'bar',
      type: 'number',
      default: 250,
      min: 10,
      max: 400,
      step: 10,
    },
  ],
  ports: () => [H('P', 0, -30, 'up', 'P (presión)'), H('S', 0, 30, 'down', 'S (aspiración)')],
  bbox: () => ({ x0: -18, y0: -30, x1: 18, y1: 30 }),
  initState: () => ({ q: 0, pBar: 0, angle: 0 }),
  build: (b) => ({ P: b.port('P'), S: b.port('S'), src: b.addSource(b.port('S'), b.port('P')) }),
  update(ctx, s, h, p, dt) {
    s.pBar = bar(ctx, h.P);
    const pmax = num(p, 'pmax');
    s.q = num(p, 'flow') * clamp01((pmax - s.pBar) / (0.05 * pmax));
    ctx.setSource(h.src, (s.q / 60_000) * RHO_OIL);
    s.angle += ((1450 * 2 * Math.PI) / 60) * dt;
  },
  explain: (s) => [
    `Envía ${s.q.toFixed(1)} l/min a ${s.pBar.toFixed(1)} bar.`,
    'Una bomba de cilindrada fija da siempre el mismo caudal: la presión la impone la carga (o la limitadora).',
  ],
};

export const tankModel: ComponentModel<object, null> = {
  type: 'hyd-tank',
  category: 'hydraulic',
  name: 'Depósito (retorno)',
  description:
    'Retorno al depósito a presión atmosférica. Como en los esquemas hidráulicos, se dibuja uno en cada punto que descarga.',
  autoLabel: () => 'T',
  sharedLabel: true,
  hideLabel: true,
  params: [],
  ports: () => [H('1', 0, -20, 'up', 'retorno')],
  bbox: () => ({ x0: -14, y0: -20, x1: 14, y1: 8 }),
  initState: () => ({}),
  build(b) {
    b.addOrifice(b.port('1'), b.atmosphere, { K: oilKFromNominalFlow(400) });
    return null;
  },
  update() {},
  explain: () => ['El aceite vuelve al depósito sin presión.'],
};

/* ───────────── Válvulas de presión, caudal y bloqueo ───────────── */

interface ValveState {
  open: number;
  q: number;
  p1: number;
  p2: number;
  pX: number;
}
const initValve = (): ValveState => ({ open: 0, q: 0, p1: 0, p2: 0, pX: 0 });

const qnParam = (def: number): ParamDef => ({
  key: 'qn',
  label: 'Caudal nominal (a 5 bar)',
  unit: 'l/min',
  type: 'number',
  default: def,
  min: 1,
  max: 1000,
  step: 1,
});

export const reliefModel: ComponentModel<ValveState, { P: number; o: number }> = {
  type: 'hyd-relief',
  category: 'hyd-valves',
  name: 'Limitadora de presión',
  description:
    'Mantiene cerrado el paso de P a T hasta que la presión en P llega al tarado; entonces abre y devuelve al depósito el caudal sobrante, limitando la presión del circuito.',
  autoLabel: (n) => `0V${n}`,
  params: [
    {
      key: 'pset',
      label: 'Tarado',
      unit: 'bar',
      type: 'number',
      default: 50,
      min: 2,
      max: 350,
      step: 1,
    },
    qnParam(40),
  ],
  ports: () => [H('P', -30, 0, 'left', 'P'), H('T', 0, 30, 'down', 'T')],
  bbox: () => ({ x0: -30, y0: -24, x1: 16, y1: 30 }),
  initState: initValve,
  build: (b, p) => ({
    P: b.port('P'),
    o: b.addOrifice(b.port('P'), b.port('T'), { K: oilKFromNominalFlow(num(p, 'qn')) }),
  }),
  update(ctx, s, h, p, dt) {
    s.p1 = bar(ctx, h.P);
    s.open = follow(s.open, reliefTarget(s.p1, num(p, 'pset')), dt);
    ctx.setOpening(h.o, s.open);
    s.q = lmin(ctx, h.o);
  },
  explain: (s, p) => [
    `Presión en P: ${s.p1.toFixed(1)} bar (tarado ${num(p, 'pset')} bar).`,
    s.open > 0.01
      ? `El asiento está levantado (${(s.open * 100).toFixed(0)} %): pasan ${Math.max(0, s.q).toFixed(1)} l/min al depósito.`
      : 'El muelle mantiene el asiento cerrado: no pasa aceite.',
  ],
};

export const filterModel: ComponentModel<ValveState, { o: number; n1: number; n2: number }> = {
  type: 'hyd-filter',
  category: 'hyd-valves',
  name: 'Filtro',
  description: 'Retiene las partículas del aceite. Cuanto más colmatado, más pérdida de carga.',
  autoLabel: (n) => `0Z${n + 10}`,
  params: [
    qnParam(150),
    {
      key: 'clog',
      label: 'Colmatación',
      unit: '%',
      type: 'number',
      default: 0,
      min: 0,
      max: 95,
      step: 5,
    },
  ],
  ports: () => [H('1', -30, 0, 'left'), H('2', 30, 0, 'right')],
  bbox: () => ({ x0: -30, y0: -16, x1: 30, y1: 16 }),
  initState: initValve,
  build: (b, p) => ({
    n1: b.port('1'),
    n2: b.port('2'),
    o: b.addOrifice(b.port('1'), b.port('2'), {
      K: oilKFromNominalFlow(num(p, 'qn') * (1 - num(p, 'clog') / 100)),
    }),
  }),
  update(ctx, s, h) {
    s.p1 = bar(ctx, h.n1);
    s.p2 = bar(ctx, h.n2);
    s.q = lmin(ctx, h.o);
  },
  explain: (s, p) => [
    `Caudal ${Math.abs(s.q).toFixed(1)} l/min con una pérdida de carga de ${Math.abs(s.p1 - s.p2).toFixed(2)} bar.`,
    num(p, 'clog') > 50
      ? 'El filtro está muy sucio: conviene cambiar el cartucho.'
      : 'Filtro limpio.',
  ],
};

export const checkModel: ComponentModel<ValveState, { n1: number; n2: number; o: number }> = {
  type: 'hyd-check',
  category: 'hyd-valves',
  name: 'Antirretorno',
  description: 'Deja pasar el aceite de 1 a 2 y lo bloquea de 2 a 1.',
  autoLabel: (n) => `0V${n}`,
  params: [
    {
      key: 'crack',
      label: 'Presión de apertura',
      unit: 'bar',
      type: 'number',
      default: 0.5,
      min: 0,
      max: 10,
      step: 0.1,
    },
    qnParam(40),
  ],
  ports: () => [H('1', -30, 0, 'left', '1 (entrada)'), H('2', 30, 0, 'right', '2 (salida)')],
  bbox: () => ({ x0: -30, y0: -14, x1: 30, y1: 14 }),
  initState: initValve,
  build: (b, p) => ({
    n1: b.port('1'),
    n2: b.port('2'),
    o: b.addOrifice(b.port('1'), b.port('2'), { K: oilKFromNominalFlow(num(p, 'qn')) }),
  }),
  update(ctx, s, h, p, dt) {
    s.p1 = bar(ctx, h.n1);
    s.p2 = bar(ctx, h.n2);
    s.open = follow(s.open, clamp01(s.p1 - s.p2 - num(p, 'crack')), dt, 0.002);
    ctx.setOpening(h.o, s.open);
    s.q = lmin(ctx, h.o);
  },
  explain: (s) => [
    s.open > 0.01
      ? `La bola está separada del asiento: pasan ${s.q.toFixed(1)} l/min de 1 a 2.`
      : `La bola cierra el paso (1: ${s.p1.toFixed(1)} bar, 2: ${s.p2.toFixed(1)} bar).`,
  ],
};

export const pilotCheckModel: ComponentModel<
  ValveState,
  { n1: number; n2: number; x: number; o: number }
> = {
  type: 'hyd-pilot-check',
  category: 'hyd-valves',
  name: 'Antirretorno desbloqueable',
  description:
    'Antirretorno que deja pasar de 1 a 2 y bloquea de 2 a 1, salvo cuando llega presión al pilotaje X: entonces el émbolo de pilotaje levanta la bola y el aceite puede volver. Sirve para sostener cargas sin que bajen.',
  autoLabel: (n) => `0V${n}`,
  params: [
    {
      key: 'ratio',
      label: 'Relación de áreas del pilotaje',
      type: 'number',
      default: 3,
      min: 1,
      max: 10,
      step: 0.5,
    },
    qnParam(40),
  ],
  ports: () => [
    H('1', -30, 0, 'left', '1'),
    H('2', 30, 0, 'right', '2 (carga)'),
    H('X', 0, 30, 'down', 'X (pilotaje)'),
  ],
  bbox: () => ({ x0: -30, y0: -16, x1: 30, y1: 30 }),
  initState: initValve,
  build: (b, p) => {
    const x = b.port('X');
    b.addBaseVolume(x, cm3(0.5));
    return {
      n1: b.port('1'),
      n2: b.port('2'),
      x,
      o: b.addOrifice(b.port('1'), b.port('2'), { K: oilKFromNominalFlow(num(p, 'qn')) }),
    };
  },
  update(ctx, s, h, p, dt) {
    s.p1 = bar(ctx, h.n1);
    s.p2 = bar(ctx, h.n2);
    s.pX = bar(ctx, h.x);
    const forward = clamp01(s.p1 - s.p2 - 0.5);
    // El émbolo de pilotaje vence la presión que aprieta la bola contra el asiento.
    const pilot = clamp01((s.pX * num(p, 'ratio') - (s.p2 - s.p1) - 2) / 3);
    s.open = follow(s.open, Math.max(forward, pilot), dt, 0.002);
    ctx.setOpening(h.o, s.open);
    s.q = lmin(ctx, h.o);
  },
  explain: (s) => {
    const lines = [
      `1: ${s.p1.toFixed(1)} bar · 2: ${s.p2.toFixed(1)} bar · X: ${s.pX.toFixed(1)} bar.`,
    ];
    if (s.open < 0.01)
      lines.push('Bola cerrada: la carga queda sostenida (no puede volver aceite de 2 a 1).');
    else if (s.q >= 0) lines.push(`Paso libre de 1 a 2: ${s.q.toFixed(1)} l/min.`);
    else
      lines.push(
        `El pilotaje X ha levantado la bola: vuelven ${(-s.q).toFixed(1)} l/min de 2 a 1.`,
      );
    return lines;
  },
};

export const throttleModel: ComponentModel<ValveState, { n1: number; n2: number; o: number }> = {
  type: 'hyd-throttle',
  category: 'hyd-valves',
  name: 'Estranguladora',
  description:
    'Reduce la sección de paso: el caudal depende de la apertura y de la diferencia de presión.',
  autoLabel: (n) => `0V${n}`,
  params: [
    {
      key: 'pct',
      label: 'Apertura',
      unit: '%',
      type: 'number',
      default: 30,
      min: 1,
      max: 100,
      step: 1,
    },
    qnParam(40),
  ],
  ports: () => [H('1', -30, 0, 'left'), H('2', 30, 0, 'right')],
  bbox: () => ({ x0: -30, y0: -16, x1: 30, y1: 16 }),
  initState: initValve,
  build: (b, p) => ({
    n1: b.port('1'),
    n2: b.port('2'),
    o: b.addOrifice(b.port('1'), b.port('2'), {
      K: oilKFromNominalFlow((num(p, 'qn') * num(p, 'pct')) / 100),
    }),
  }),
  update(ctx, s, h) {
    s.p1 = bar(ctx, h.n1);
    s.p2 = bar(ctx, h.n2);
    s.q = lmin(ctx, h.o);
  },
  explain: (s) => [
    `Pasan ${Math.abs(s.q).toFixed(1)} l/min con ${Math.abs(s.p1 - s.p2).toFixed(1)} bar de diferencia: si cambia la carga, cambia el caudal.`,
  ],
};

export const flowControlModel: ComponentModel<ValveState, { n1: number; n2: number; o: number }> = {
  type: 'hyd-flow-control',
  category: 'hyd-valves',
  name: 'Reguladora de caudal compensada',
  description:
    'Mantiene el caudal ajustado de 1 a 2 aunque cambie la presión (una balanza de presión ajusta la sección). De 2 a 1 pasa libre por el antirretorno.',
  autoLabel: (n) => `0V${n}`,
  params: [
    {
      key: 'qset',
      label: 'Caudal ajustado',
      unit: 'l/min',
      type: 'number',
      default: 3,
      min: 0.1,
      max: 200,
      step: 0.1,
    },
    qnParam(40),
  ],
  ports: () => [H('1', -30, 0, 'left', '1 (entrada)'), H('2', 30, 0, 'right', '2 (salida)')],
  bbox: () => ({ x0: -30, y0: -20, x1: 30, y1: 20 }),
  initState: initValve,
  build: (b, p) => ({
    n1: b.port('1'),
    n2: b.port('2'),
    o: b.addOrifice(b.port('1'), b.port('2'), { K: oilKFromNominalFlow(num(p, 'qn')) }),
  }),
  update(ctx, s, h, p, dt) {
    s.p1 = bar(ctx, h.n1);
    s.p2 = bar(ctx, h.n2);
    const dp = (s.p1 - s.p2) * 1e5;
    let target = 1;
    if (dp > 0) {
      // Sección necesaria para el caudal ajustado con el salto actual (balanza de presión).
      const full = toLmin(oilKFromNominalFlow(num(p, 'qn')) * Math.sqrt(Math.max(dp, 1e3)));
      target = Math.min(1, num(p, 'qset') / Math.max(full, 1e-6));
    }
    s.open = follow(s.open, target, dt, 0.004);
    ctx.setOpening(h.o, s.open);
    s.q = lmin(ctx, h.o);
  },
  explain: (s, p) => [
    s.q >= 0
      ? `Regula a ${num(p, 'qset')} l/min: pasan ${s.q.toFixed(2)} l/min con ${(s.p1 - s.p2).toFixed(1)} bar de diferencia.`
      : `Paso libre de 2 a 1 por el antirretorno: ${(-s.q).toFixed(1)} l/min.`,
  ],
};

/* ───────────── Acumulador ───────────── */

export const accumulatorModel: ComponentModel<
  { pBar: number; fill: number },
  { node: number; V0: number }
> = {
  type: 'hyd-accumulator',
  category: 'hydraulic',
  name: 'Acumulador de vejiga',
  description:
    'Una vejiga con nitrógeno precargado se comprime cuando entra aceite: almacena energía y la devuelve cuando la presión del circuito baja.',
  autoLabel: (n) => `0Z${n + 20}`,
  params: [
    {
      key: 'V0',
      label: 'Volumen de gas',
      unit: 'l',
      type: 'number',
      default: 1,
      min: 0.1,
      max: 50,
      step: 0.1,
    },
    {
      key: 'p0',
      label: 'Presión de precarga',
      unit: 'bar',
      type: 'number',
      default: 30,
      min: 1,
      max: 250,
      step: 1,
    },
  ],
  ports: () => [H('1', 0, 30, 'down')],
  bbox: () => ({ x0: -16, y0: -30, x1: 16, y1: 30 }),
  initState: () => ({ pBar: 0, fill: 0 }),
  build(b, p) {
    const V0 = num(p, 'V0') / 1000;
    const node = b.addNode({
      kind: 'accumulator',
      volume: cm3(5),
      gasVolume: V0,
      precharge: barGaugeToPa(num(p, 'p0')),
    });
    b.addOrifice(b.port('1'), node, { K: oilKFromNominalFlow(100) });
    return { node, V0 };
  },
  update(ctx, s, h) {
    s.pBar = bar(ctx, h.node);
    s.fill = clamp01(ctx.storedOil(h.node) / h.V0);
  },
  explain: (s, p) => [
    `Presión ${s.pBar.toFixed(1)} bar (precarga ${num(p, 'p0')} bar).`,
    s.fill > 0.005
      ? `Contiene ${(s.fill * num(p, 'V0')).toFixed(2)} l de aceite: el gas está comprimido al ${((1 - s.fill) * 100).toFixed(0)} % de su volumen.`
      : 'Vacío: la presión del circuito no supera la precarga del gas.',
  ],
};

/* ───────────── Actuadores ───────────── */

const HYD_DEAD = cm3(10);
const hydNames = {
  cap: 'Cámara del émbolo (A)',
  rod: 'Cámara anular (B)',
  plus: 'El vástago SALE: el aceite entra por A y sale por B',
  minus: 'El vástago ENTRA: el aceite entra por B y sale por A',
  endPlus: 'Vástago totalmente fuera.',
  endMinus: 'Vástago totalmente dentro.',
  force: 'Fuerza hidráulica neta',
};

const [hBore, hStroke, hMass, hLoad, hStart] = commonCylParams({ bore: 40, stroke: 200, mass: 20 });

export const hydCylinderModel: ComponentModel<CylState, CylHandles> = {
  type: 'hyd-cyl-double',
  category: 'hydraulic',
  name: 'Cilindro hidráulico de doble efecto',
  description:
    'El aceite empuja el émbolo en los dos sentidos. Como el aceite apenas se comprime, la velocidad la fija el caudal y la fuerza máxima, la presión.',
  autoLabel: (n) => `${n}A`,
  params: [
    hBore,
    {
      key: 'rod',
      label: 'Diámetro del vástago',
      unit: 'mm',
      type: 'number',
      default: 22,
      min: 4,
      max: 200,
      step: 1,
    },
    hStroke,
    hMass,
    hLoad,
    hStart,
    marksParam,
  ],
  ports: () => [
    H('A', -50, 30, 'down', 'A (lado émbolo)'),
    H('B', 30, 30, 'down', 'B (lado vástago)'),
  ],
  bbox: () => ({ x0: -60, y0: -15, x1: 140, y1: 30 }),
  initState: initCyl,
  build: (b, p) => buildCyl(b, p, 'A', 'B'),
  update(ctx, s, h, p, dt) {
    const aCap = areaOf(num(p, 'bore'));
    updateCyl(ctx, s, h, p, dt, aCap, Math.min(areaOf(num(p, 'rod')), aCap * 0.95), HYD_DEAD);
  },
  explain: (s, p) => explainCyl(s, p, hydNames),
};

export const hydCylinderSingleModel: ComponentModel<CylState, CylHandles> = {
  type: 'hyd-cyl-single',
  category: 'hydraulic',
  name: 'Cilindro hidráulico de simple efecto',
  description:
    'El aceite sólo empuja para sacar el vástago; vuelve por la carga (su peso). La cámara del vástago respira al exterior.',
  autoLabel: (n) => `${n}A`,
  params: [hBore, hStroke, hMass, { ...hLoad, default: 300 } as ParamDef, hStart, marksParam],
  ports: () => [H('A', -50, 30, 'down', 'A')],
  bbox: () => ({ x0: -60, y0: -15, x1: 140, y1: 30 }),
  initState: initCyl,
  build(b, p: Params) {
    const port = b.port('A');
    const atm = { port: b.atmosphere, chamber: b.atmosphere, main: null, throttle: null };
    return {
      cap: { port, chamber: port, main: null, throttle: null },
      rod: atm,
      marks: parseMarks(String(p.marks ?? '')),
    };
  },
  update(ctx, s, h, p, dt) {
    const aCap = areaOf(num(p, 'bore'));
    updateCyl(ctx, s, h, p, dt, aCap, aCap * 0.5, HYD_DEAD);
  },
  explain: (s, p) =>
    explainCyl(s, p, {
      ...hydNames,
      minus: 'El vástago ENTRA empujado por la carga: el aceite vuelve por A',
    }),
};

interface MotorState {
  omega: number;
  rpm: number;
  angle: number;
  torque: number;
  pA: number;
  pB: number;
}

export const hydMotorModel: ComponentModel<MotorState, { A: number; B: number; src: number }> = {
  type: 'hyd-motor',
  category: 'hydraulic',
  name: 'Motor hidráulico',
  description:
    'Convierte el caudal en giro y la presión en par: la velocidad es caudal / cilindrada y el par, cilindrada × Δp / 2π.',
  autoLabel: (n) => `${n}M`,
  params: [
    {
      key: 'disp',
      label: 'Cilindrada',
      unit: 'cm³/vuelta',
      type: 'number',
      default: 8,
      min: 0.5,
      max: 500,
      step: 0.5,
    },
    {
      key: 'loadT',
      label: 'Par resistente',
      unit: 'N·m',
      type: 'number',
      default: 2,
      min: 0,
      max: 2000,
      step: 0.5,
    },
    {
      key: 'inertia',
      label: 'Inercia',
      unit: 'kg·m²',
      type: 'number',
      default: 0.005,
      min: 0.0001,
      max: 10,
      step: 0.001,
    },
  ],
  ports: () => [H('A', -10, 30, 'down', 'A'), H('B', 10, 30, 'down', 'B')],
  bbox: () => ({ x0: -22, y0: -22, x1: 30, y1: 30 }),
  initState: () => ({ omega: 0, rpm: 0, angle: 0, torque: 0, pA: 0, pB: 0 }),
  build(b, p) {
    const A = b.port('A');
    const B = b.port('B');
    // Fuga interna pequeña (rendimiento volumétrico).
    b.addOrifice(A, B, { K: oilKFromNominalFlow(num(p, 'disp') * 0.02) });
    return { A, B, src: b.addSource(A, B) };
  },
  update(ctx, s, h, p, dt) {
    const Vr = cm3(num(p, 'disp')) / (2 * Math.PI); // m³/rad
    const pA = ctx.p(h.A);
    const pB = ctx.p(h.B);
    s.pA = paToBarGauge(pA);
    s.pB = paToBarGauge(pB);
    s.torque = Vr * (pA - pB);
    const J = num(p, 'inertia');
    const load = num(p, 'loadT');
    if (dt > 0) {
      const moving = Math.abs(s.omega) > 1e-3;
      const dir = moving ? Math.sign(s.omega) : Math.sign(s.torque);
      if (!moving && Math.abs(s.torque) <= load) s.omega = 0;
      else {
        const k = Vr * Vr * (ctx.dpdV(h.A) + ctx.dpdV(h.B));
        const a = (s.torque - dir * load - 0.002 * s.omega) / J;
        let w = (s.omega + a * dt) / (1 + (k * dt * dt) / J);
        if (moving && Math.sign(w) !== Math.sign(s.omega)) w = 0;
        s.omega = w;
      }
    }
    ctx.setSource(h.src, Vr * s.omega * RHO_OIL);
    s.rpm = (s.omega * 60) / (2 * Math.PI);
    s.angle += s.omega * dt;
  },
  explain: (s, p) => [
    `A: ${s.pA.toFixed(1)} bar · B: ${s.pB.toFixed(1)} bar → par motor ${s.torque.toFixed(1)} N·m (resistente ${num(p, 'loadT')} N·m).`,
    Math.abs(s.rpm) > 1
      ? `Gira a ${Math.abs(s.rpm).toFixed(0)} rpm ${s.rpm > 0 ? '(A → B)' : '(B → A)'}: consume ${Math.abs((s.rpm * num(p, 'disp')) / 1000).toFixed(2)} l/min.`
      : 'Parado.',
  ],
};

export const hydGaugeModel: ComponentModel = {
  ...gaugeModel,
  type: 'hyd-gauge',
  category: 'instruments',
  name: 'Manómetro hidráulico',
  params: gaugeModel.params.map((d) =>
    d.key === 'range' ? { ...d, default: 160 } : d,
  ) as ParamDef[],
  ports: () => [H('1', 0, 30, 'down', '1')],
};

export const HYDRAULIC_MODELS: ComponentModel[] = [
  powerUnitModel,
  pumpModel,
  tankModel,
  accumulatorModel,
  hydCylinderModel,
  hydCylinderSingleModel,
  hydMotorModel,
  reliefModel,
  filterModel,
  checkModel,
  pilotCheckModel,
  throttleModel,
  flowControlModel,
];

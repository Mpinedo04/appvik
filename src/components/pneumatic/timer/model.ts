/**
 * Temporizador neumático (retardo a la conexión, normalmente cerrado): el aire de la señal 12
 * llena un pequeño depósito a través de un estrangulador; cuando el depósito alcanza la
 * presión de conmutación, una válvula 3/2 abre 1→2. Al quitar la señal, una antirretorno vacía
 * el depósito de golpe y el temporizador se rearma.
 */
import { num, type ComponentModel } from '../../../core/registry';
import {
  P_ATM,
  RHO_ANR,
  RT,
  barGaugeToPa,
  cm3,
  conductanceFromNominalFlow,
  paToBarGauge,
} from '../../../core/units';
import { initActuation } from '../actuation';
import {
  VALVE_32NC,
  boxesExtent,
  pathOpening,
  valvePortPos,
  type WayValveConfig,
} from '../way-valve/config';
import { allPaths, type WayValveState } from '../way-valve/model';

export const TIMER_CFG: WayValveConfig = {
  ...VALVE_32NC,
  type: 'pneu-timer',
  name: 'Temporizador neumático',
  short: 'Temporizador',
  description:
    'Retardo a la conexión: cuando llega señal a 12, tarda el tiempo ajustado en abrir 1→2. Dentro hay un estrangulador, un depósito y una válvula 3/2.',
};

/** Posición del puerto de señal (más a la izquierda que un pilotaje normal: deja sitio al depósito). */
export const TIMER_SIGNAL_X = boxesExtent(TIMER_CFG).left - 70;
const RES_VOLUME = cm3(20);
const P_SWITCH = 3; // bar relativos
const SWITCH_TIME = 0.015;

export interface TimerState extends WayValveState {
  /** Presión del depósito [bar] */
  pRes: number;
  /** Tiempo desde que llegó la señal [s] (−1 si no hay señal) */
  elapsed: number;
}

interface Handles {
  orifices: { from: string; to: string; box: number; index: number }[];
  ports: { id: string; node: number }[];
  res: number;
  sig: number;
  thr: number;
  check: number;
}

/** Conductancia del estrangulador para conseguir aprox. el retardo pedido con 6 bar de señal. */
function throttleFor(delay: number) {
  const dm = (barGaugeToPa(P_SWITCH) - P_ATM) * (RES_VOLUME / RT);
  return dm / (Math.max(0.05, delay) * barGaugeToPa(6) * RHO_ANR * 0.85);
}

export const timerModel: ComponentModel<TimerState, Handles> = {
  type: TIMER_CFG.type,
  category: 'flowpressure',
  name: TIMER_CFG.name,
  description: TIMER_CFG.description,
  autoLabel: (n) => `1V${n}`,
  params: [
    {
      key: 'delay',
      label: 'Retardo (con 6 bar de señal)',
      unit: 's',
      type: 'number',
      default: 2,
      min: 0.1,
      max: 60,
      step: 0.1,
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
  ],
  ports: () => [
    ...TIMER_CFG.ports.map((pc) => ({
      id: pc.id,
      medium: 'pneu' as const,
      ...valvePortPos(TIMER_CFG, pc),
      dir: pc.side === 'top' ? ('up' as const) : ('down' as const),
      label: `${pc.id} (${pc.role})`,
      exhaust: pc.exhaust,
    })),
    { id: '12', medium: 'pneu', x: TIMER_SIGNAL_X, y: 0, dir: 'left', label: '12 (señal)' },
  ],
  bbox: () => ({ x0: TIMER_SIGNAL_X, y0: -30, x1: boxesExtent(TIMER_CFG).right + 25, y1: 30 }),
  initState: () => ({
    ...initActuation(),
    pos: TIMER_CFG.rest,
    openings: allPaths(TIMER_CFG).map((pt) => (pt.box === TIMER_CFG.rest ? 1 : 0)),
    flows: allPaths(TIMER_CFG).map(() => 0),
    portBar: { '1': 0, '2': 0, '3': 0, '12': 0 },
    pRes: 0,
    elapsed: -1,
  }),
  build(b, p) {
    const C = conductanceFromNominalFlow(num(p, 'qn'));
    const sig = b.port('12');
    const res = b.addNode({ name: 'depósito del temporizador', volume: RES_VOLUME });
    return {
      orifices: allPaths(TIMER_CFG).map((path) => ({
        ...path,
        index: b.addOrifice(b.port(path.from), b.port(path.to), { C }),
      })),
      ports: ['1', '2', '3', '12'].map((id) => ({ id, node: b.port(id) })),
      res,
      sig,
      thr: b.addOrifice(sig, res, { C: throttleFor(num(p, 'delay')) }),
      check: b.addOrifice(res, sig, { C: 2e-8 }),
    };
  },
  update(ctx, s, h, _p, dt) {
    const pSig = paToBarGauge(ctx.p(h.sig));
    s.pRes = paToBarGauge(ctx.p(h.res));
    // Antirretorno de vaciado rápido: abre cuando el depósito tiene más presión que la señal.
    ctx.setOpening(h.check, Math.min(1, Math.max(0, (s.pRes - pSig - 0.05) / 0.1)));
    if (pSig > 0.5) s.elapsed = s.elapsed < 0 ? 0 : s.elapsed + dt;
    else s.elapsed = -1;
    // Con histéresis para que no oscile alrededor del punto de conmutación.
    if (s.pRes >= P_SWITCH) s.leftOn = true;
    else if (s.pRes < P_SWITCH - 0.3) s.leftOn = false;
    const target = s.leftOn ? 0 : TIMER_CFG.rest;
    const maxStep = dt / SWITCH_TIME;
    s.pos += Math.max(-maxStep, Math.min(maxStep, target - s.pos));
    h.orifices.forEach((o, i) => {
      const f = pathOpening(s.pos, o.box);
      s.openings[i] = f;
      s.flows[i] = ctx.massFlow(o.index);
      ctx.setOpening(o.index, f);
    });
    for (const pt of h.ports) s.portBar[pt.id] = paToBarGauge(ctx.p(pt.node));
  },
  explain(s, p) {
    const lines = [`Depósito interno: ${s.pRes.toFixed(2)} bar (conmuta a ${P_SWITCH} bar).`];
    if (s.leftOn)
      lines.push(
        'El depósito ha alcanzado la presión de conmutación: la válvula 3/2 está abierta (1→2).',
      );
    else if (s.elapsed >= 0)
      lines.push(
        `Hay señal en 12 desde hace ${s.elapsed.toFixed(2)} s: el aire entra al depósito poco a poco por el estrangulador (retardo ajustado ≈ ${num(p, 'delay')} s).`,
      );
    else
      lines.push(
        'Sin señal: la antirretorno ha vaciado el depósito y la salida 2 está a escape por 3.',
      );
    return lines;
  },
};

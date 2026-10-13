import { bool, num, type ComponentModel } from '../../../core/registry';
import {
  RHO_ANR,
  barGaugeToPa,
  conductanceFromNominalFlow,
  paToBarGauge,
} from '../../../core/units';

export interface CompressorState {
  running: boolean;
  pTank: number;
  /** Ángulo del cigüeñal (para animar) */
  crank: number;
  flowLmin: number;
}

interface Handles {
  pump: number;
  out: number;
  tank: number;
}

/** Presión interna del compresor (lo que «empuja» al depósito). */
const PUMP_PRESSURE = barGaugeToPa(14);

/**
 * Compresor de pistón con depósito y presostato: arranca cuando el depósito baja de la presión
 * de conexión y para al llegar a la de desconexión.
 */
export const compressorModel: ComponentModel<CompressorState, Handles> = {
  type: 'pneu-compressor',
  category: 'supply',
  name: 'Compresor con depósito',
  description:
    'Produce el aire comprimido. Un presostato lo pone en marcha cuando la presión del depósito baja y lo para cuando llega al máximo.',
  autoLabel: (n) => `0Z${n}`,
  params: [
    {
      key: 'pOn',
      label: 'Presión de conexión',
      unit: 'bar',
      type: 'number',
      default: 6,
      min: 0.5,
      max: 12,
      step: 0.1,
    },
    {
      key: 'pOff',
      label: 'Presión de desconexión',
      unit: 'bar',
      type: 'number',
      default: 8,
      min: 1,
      max: 14,
      step: 0.1,
    },
    {
      key: 'q',
      label: 'Caudal del compresor',
      unit: 'l/min',
      type: 'number',
      default: 250,
      min: 10,
      max: 5000,
      step: 10,
    },
    {
      key: 'liters',
      label: 'Volumen del depósito',
      unit: 'l',
      type: 'number',
      default: 5,
      min: 0.5,
      max: 500,
      step: 0.5,
    },
    { key: 'startFull', label: 'Empezar con el depósito lleno', type: 'boolean', default: true },
  ],
  ports: () => [{ id: '1', medium: 'pneu', x: 0, y: -30, dir: 'up', label: '1 (salida)' }],
  bbox: () => ({ x0: -40, y0: -30, x1: 40, y1: 25 }),
  initState: () => ({ running: false, pTank: 0, crank: 0, flowLmin: 0 }),
  build(b, p) {
    const tank = b.addNode({
      name: 'depósito',
      volume: num(p, 'liters') / 1000,
      initialPressure: bool(p, 'startFull') ? barGaugeToPa(num(p, 'pOff')) : undefined,
    });
    const src = b.addNode({ name: 'compresor', fixedPressure: PUMP_PRESSURE });
    // Con 14 bar internos y el depósito a ~7 bar el caudal es aproximadamente el nominal.
    const C = conductanceFromNominalFlow(num(p, 'q')) * 0.75;
    return {
      pump: b.addOrifice(src, tank, { C }),
      out: b.addOrifice(tank, b.port('1'), { C: 6e-8 }),
      tank,
    };
  },
  update(ctx, s, h, p, dt) {
    s.pTank = paToBarGauge(ctx.p(h.tank));
    if (s.pTank < num(p, 'pOn')) s.running = true;
    if (s.pTank >= num(p, 'pOff')) s.running = false;
    ctx.setOpening(h.pump, s.running ? 1 : 0);
    if (s.running) s.crank = (s.crank + dt * 2 * Math.PI * 20) % (2 * Math.PI);
    s.flowLmin = (ctx.massFlow(h.out) / RHO_ANR) * 60_000;
  },
  explain: (s, p) => [
    `Depósito a ${s.pTank.toFixed(2)} bar (conecta a ${num(p, 'pOn')} bar, desconecta a ${num(p, 'pOff')} bar).`,
    s.running
      ? 'El motor está en marcha: el pistón aspira aire y lo comprime dentro del depósito.'
      : 'Compresor parado por el presostato: el circuito consume del aire acumulado en el depósito.',
    s.flowLmin > 1
      ? `Consumo actual del circuito: ${s.flowLmin.toFixed(0)} l/min.`
      : 'Sin consumo.',
  ],
};

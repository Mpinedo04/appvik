import { num, type ComponentModel } from '../../../core/registry';
import { RHO_ANR, conductanceFromNominalFlow, paToBarGauge } from '../../../core/units';

export interface MotorState {
  /** Velocidad [rpm] (positiva = sentido horario) */
  rpm: number;
  /** Ángulo del eje [rad] (para animar) */
  angle: number;
  /** Caudal de aire que atraviesa el motor [l/min] */
  flowLmin: number;
  p1: number;
  p2: number;
}

/**
 * Motor neumático de paletas reversible: el aire que pasa de una conexión a la otra hace girar
 * el rotor. La velocidad es proporcional al caudal (cilindrada por vuelta).
 */
export const motorModel: ComponentModel<MotorState, { orifice: number; n1: number; n2: number }> = {
  type: 'pneu-motor',
  category: 'actuators',
  name: 'Motor neumático',
  description:
    'Gira de forma continua mientras pasa aire por él; el sentido depende de por qué conexión entra.',
  autoLabel: (n) => `${n}M`,
  params: [
    {
      key: 'disp',
      label: 'Consumo por vuelta',
      unit: 'l/vuelta',
      type: 'number',
      default: 0.15,
      min: 0.01,
      max: 10,
      step: 0.01,
    },
    {
      key: 'qn',
      label: 'Caudal nominal',
      unit: 'l/min',
      type: 'number',
      default: 200,
      min: 10,
      max: 5000,
      step: 10,
    },
  ],
  ports: () => [
    { id: '1', medium: 'pneu', x: -10, y: 30, dir: 'down', label: 'Entrada (giro horario)' },
    { id: '2', medium: 'pneu', x: 10, y: 30, dir: 'down', label: 'Entrada (giro antihorario)' },
  ],
  bbox: () => ({ x0: -25, y0: -30, x1: 25, y1: 30 }),
  initState: () => ({ rpm: 0, angle: 0, flowLmin: 0, p1: 0, p2: 0 }),
  build: (b, p) => {
    const n1 = b.port('1');
    const n2 = b.port('2');
    return {
      orifice: b.addOrifice(n1, n2, { C: conductanceFromNominalFlow(num(p, 'qn')) }),
      n1,
      n2,
    };
  },
  update(ctx, s, h, p, dt) {
    const qLmin = (ctx.massFlow(h.orifice) / RHO_ANR) * 60_000;
    s.flowLmin = qLmin;
    const target = qLmin / num(p, 'disp');
    // Inercia del rotor: primer orden con τ = 50 ms.
    s.rpm += (target - s.rpm) * Math.min(1, dt / 0.05);
    s.angle = (s.angle + (s.rpm / 60) * 2 * Math.PI * dt) % (2 * Math.PI);
    s.p1 = paToBarGauge(ctx.p(h.n1));
    s.p2 = paToBarGauge(ctx.p(h.n2));
  },
  explain(s) {
    if (Math.abs(s.rpm) < 1) return ['Parado: no circula aire a través de las paletas.'];
    return [
      `Gira en sentido ${s.rpm > 0 ? 'horario' : 'antihorario'} a ${Math.abs(s.rpm).toFixed(0)} rpm.`,
      `El aire entra a ${Math.max(s.p1, s.p2).toFixed(1)} bar, empuja las paletas del rotor y sale por la otra conexión (${Math.abs(s.flowLmin).toFixed(0)} l/min).`,
    ];
  },
};

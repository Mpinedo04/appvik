import { num, type ComponentModel } from '../../../core/registry';
import { barGaugeToPa, conductanceFromNominalFlow, paToBarGauge } from '../../../core/units';

interface State {
  /** Caudal entregado [l/min ANR] */
  flowLmin: number;
}

interface Handles {
  orifice: number;
}

export const supplyModel: ComponentModel<State, Handles> = {
  type: 'pneu-supply',
  category: 'supply',
  name: 'Fuente de aire comprimido',
  description: 'Suministra aire a una presión constante, como la red de aire de un taller.',
  autoLabel: (n) => `0Z${n}`,
  params: [
    {
      key: 'pressure',
      label: 'Presión de trabajo',
      unit: 'bar',
      type: 'number',
      default: 6,
      min: 0,
      max: 12,
      step: 0.1,
    },
    {
      key: 'qn',
      label: 'Caudal máximo',
      unit: 'l/min',
      type: 'number',
      default: 1500,
      min: 10,
      max: 10000,
      step: 10,
    },
  ],
  ports: () => [{ id: '1', medium: 'pneu', x: 0, y: -20, dir: 'up', label: '1' }],
  bbox: () => ({ x0: -15, y0: -20, x1: 15, y1: 15 }),
  initState: () => ({ flowLmin: 0 }),
  build(b, p) {
    const source = b.addNode({
      name: 'red de aire',
      fixedPressure: barGaugeToPa(num(p, 'pressure')),
    });
    return {
      orifice: b.addOrifice(source, b.port('1'), { C: conductanceFromNominalFlow(num(p, 'qn')) }),
    };
  },
  update(ctx, s, h) {
    s.flowLmin = (ctx.massFlow(h.orifice) / 1.185) * 60_000;
  },
  explain(s, p, ctx) {
    const out = paToBarGauge(ctx.p('1'));
    return [
      `La red mantiene ${num(p, 'pressure').toFixed(1)} bar. En la salida 1 hay ${out.toFixed(2)} bar.`,
      s.flowLmin > 1
        ? `Está entregando ${s.flowLmin.toFixed(0)} l/min de aire al circuito.`
        : 'No hay consumo: el circuito conectado está lleno a presión o cerrado.',
    ];
  },
};

import { num, type ComponentModel } from '../../../core/registry';
import { conductanceFromNominalFlow, paToBarGauge } from '../../../core/units';

interface State {
  flowLmin: number;
}

export const exhaustModel: ComponentModel<State, { orifice: number }> = {
  type: 'pneu-silencer',
  category: 'supply',
  name: 'Silenciador',
  description:
    'Descarga el aire a la atmósfera atenuando el ruido. Un puerto de escape sin conectar descarga igual, pero sin silenciador.',
  autoLabel: (n) => `0Z${n}`,
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
  ports: () => [{ id: '1', medium: 'pneu', x: 0, y: -20, dir: 'up', label: '1' }],
  bbox: () => ({ x0: -10, y0: -20, x1: 10, y1: 10 }),
  initState: () => ({ flowLmin: 0 }),
  build(b, p) {
    return {
      orifice: b.addOrifice(b.port('1'), b.atmosphere, {
        C: conductanceFromNominalFlow(num(p, 'qn')),
      }),
    };
  },
  update(ctx, s, h) {
    s.flowLmin = (ctx.massFlow(h.orifice) / 1.185) * 60_000;
  },
  explain(s, _p, ctx) {
    return s.flowLmin > 1
      ? [
          `Sale aire a la atmósfera: ${s.flowLmin.toFixed(0)} l/min (entrada a ${paToBarGauge(ctx.p('1')).toFixed(2)} bar).`,
        ]
      : ['No circula aire por el silenciador.'];
  },
};

import { num, type ComponentModel } from '../../../core/registry';
import { cm3, paToBarGauge } from '../../../core/units';

interface State {
  /** Presión medida [bar relativos] (con la inercia de la aguja) */
  bar: number;
}

export const gaugeModel: ComponentModel<State, { node: number }> = {
  type: 'pneu-gauge',
  category: 'instruments',
  name: 'Manómetro',
  description: 'Indica la presión relativa en el punto del circuito al que se conecta.',
  autoLabel: (n) => `P${n}`,
  params: [
    {
      key: 'range',
      label: 'Fondo de escala',
      unit: 'bar',
      type: 'number',
      default: 10,
      min: 1,
      max: 400,
      step: 1,
    },
  ],
  ports: () => [{ id: '1', medium: 'pneu', x: 0, y: 30, dir: 'down', label: '1' }],
  bbox: () => ({ x0: -20, y0: -20, x1: 20, y1: 30 }),
  initState: () => ({ bar: 0 }),
  build(b) {
    const node = b.port('1');
    b.addBaseVolume(node, cm3(0.5));
    return { node };
  },
  update(ctx, s, h, _p, dt) {
    // Filtro de primer orden (τ = 20 ms) que imita la inercia de la aguja.
    const target = paToBarGauge(ctx.p(h.node));
    s.bar = dt === 0 ? target : s.bar + (target - s.bar) * Math.min(1, dt / 0.02);
  },
  explain(s, p) {
    const pct = (s.bar / num(p, 'range')) * 100;
    return [
      `El tubo de Bourdon interior se deforma con la presión y mueve la aguja: ${s.bar.toFixed(2)} bar.`,
      pct > 100
        ? '¡Presión por encima del fondo de escala!'
        : `La aguja está al ${pct.toFixed(0)} % de la escala.`,
    ];
  },
};

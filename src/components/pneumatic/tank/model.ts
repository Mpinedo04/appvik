import { num, type ComponentModel } from '../../../core/registry';
import { paToBarGauge } from '../../../core/units';

export interface TankState {
  bar: number;
}

/** Depósito de aire: acumula volumen (amortigua picos de consumo o sirve de retardo). */
export const tankModel: ComponentModel<TankState, { node: number }> = {
  type: 'pneu-tank',
  category: 'supply',
  name: 'Depósito',
  description: 'Volumen de aire comprimido. Cuanto mayor es, más tarda en llenarse y vaciarse.',
  autoLabel: (n) => `0Z${n}`,
  params: [
    {
      key: 'liters',
      label: 'Volumen',
      unit: 'l',
      type: 'number',
      default: 1,
      min: 0.01,
      max: 1000,
      step: 0.1,
    },
  ],
  ports: () => [
    { id: '1', medium: 'pneu', x: -40, y: 0, dir: 'left', label: '1' },
    { id: '2', medium: 'pneu', x: 40, y: 0, dir: 'right', label: '2' },
  ],
  bbox: () => ({ x0: -40, y0: -20, x1: 40, y1: 20 }),
  initState: () => ({ bar: 0 }),
  build(b, p) {
    // Las dos conexiones dan al mismo volumen: se unen sin restricción.
    const n1 = b.port('1');
    const n2 = b.port('2');
    b.addBaseVolume(n1, num(p, 'liters') / 1000);
    b.addOrifice(n1, n2, { C: 1e-7 });
    return { node: n1 };
  },
  update(ctx, s, h) {
    s.bar = paToBarGauge(ctx.p(h.node));
  },
  explain: (s, p) => [`Depósito de ${num(p, 'liters')} l a ${s.bar.toFixed(2)} bar.`],
};

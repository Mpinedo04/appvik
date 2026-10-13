import { num, type ComponentModel } from '../../../core/registry';
import { RHO_ANR } from '../../../core/units';

export interface FlowmeterState {
  /** Caudal [l/min ANR], positivo de 1 a 2 */
  lmin: number;
}

/** Caudalímetro en línea (prácticamente sin pérdida de carga). */
export const flowmeterModel: ComponentModel<FlowmeterState, { o: number }> = {
  type: 'pneu-flowmeter',
  category: 'instruments',
  name: 'Caudalímetro',
  description:
    'Mide el caudal de aire que lo atraviesa, en litros por minuto (en condiciones normales).',
  autoLabel: (n) => `F${n}`,
  params: [
    {
      key: 'range',
      label: 'Fondo de escala',
      unit: 'l/min',
      type: 'number',
      default: 500,
      min: 10,
      max: 20000,
      step: 10,
    },
  ],
  ports: () => [
    { id: '1', medium: 'pneu', x: 0, y: 30, dir: 'down', label: '1' },
    { id: '2', medium: 'pneu', x: 0, y: -30, dir: 'up', label: '2' },
  ],
  bbox: () => ({ x0: -20, y0: -30, x1: 20, y1: 30 }),
  initState: () => ({ lmin: 0 }),
  build: (b) => ({ o: b.addOrifice(b.port('1'), b.port('2'), { C: 8e-8 }) }),
  update(ctx, s, h, _p, dt) {
    const target = (ctx.massFlow(h.o) / RHO_ANR) * 60_000;
    s.lmin = dt === 0 ? target : s.lmin + (target - s.lmin) * Math.min(1, dt / 0.03);
  },
  explain: (s, p) => [
    Math.abs(s.lmin) < 1
      ? 'No circula aire.'
      : `Circulan ${Math.abs(s.lmin).toFixed(0)} l/min de ${s.lmin > 0 ? '1 a 2' : '2 a 1'} (${((Math.abs(s.lmin) / num(p, 'range')) * 100).toFixed(0)} % de la escala).`,
  ],
};

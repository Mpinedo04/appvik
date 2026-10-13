import { num, type ComponentModel } from '../../../core/registry';
import { RHO_ANR, conductanceFromNominalFlow, paToBarGauge } from '../../../core/units';

export interface FrlState {
  p1: number;
  p2: number;
  open: number;
  flowLmin: number;
}

/**
 * Unidad de mantenimiento (filtro + regulador con manómetro + lubricador). En la simulación
 * actúa como reguladora de presión; el filtro y el lubricador se muestran pero no restan presión.
 */
export const frlModel: ComponentModel<FrlState, { o: number; r: number; n1: number; n2: number }> =
  {
    type: 'pneu-frl',
    category: 'supply',
    name: 'Unidad de mantenimiento',
    description:
      'Filtra el aire, ajusta la presión de trabajo (con su manómetro) y añade niebla de aceite. Se coloca a la entrada de la instalación.',
    autoLabel: (n) => `0Z${n}`,
    params: [
      {
        key: 'pset',
        label: 'Presión de trabajo ajustada',
        unit: 'bar',
        type: 'number',
        default: 6,
        min: 0,
        max: 12,
        step: 0.1,
      },
      {
        key: 'qn',
        label: 'Caudal nominal',
        unit: 'l/min',
        type: 'number',
        default: 1500,
        min: 10,
        max: 10000,
        step: 10,
      },
    ],
    ports: () => [
      { id: '1', medium: 'pneu', x: -50, y: 0, dir: 'left', label: '1 (entrada)' },
      { id: '2', medium: 'pneu', x: 50, y: 0, dir: 'right', label: '2 (salida)' },
    ],
    bbox: () => ({ x0: -50, y0: -30, x1: 50, y1: 25 }),
    initState: () => ({ p1: 0, p2: 0, open: 0, flowLmin: 0 }),
    build(b, p) {
      const C = conductanceFromNominalFlow(num(p, 'qn'));
      const n1 = b.port('1');
      const n2 = b.port('2');
      return {
        o: b.addOrifice(n1, n2, { C }),
        r: b.addOrifice(n2, b.atmosphere, { C: C * 0.2 }),
        n1,
        n2,
      };
    },
    update(ctx, s, h, p) {
      s.p1 = paToBarGauge(ctx.p(h.n1));
      s.p2 = paToBarGauge(ctx.p(h.n2));
      const set = num(p, 'pset');
      s.open = Math.min(1, Math.max(0, (set - s.p2) / 0.25));
      ctx.setOpening(h.o, s.open);
      ctx.setOpening(h.r, Math.min(1, Math.max(0, (s.p2 - set - 0.1) / 0.25)));
      s.flowLmin = (ctx.massFlow(h.o) / RHO_ANR) * 60_000;
    },
    explain: (s, p) => [
      `Entrada ${s.p1.toFixed(2)} bar → salida regulada ${s.p2.toFixed(2)} bar (ajuste ${num(p, 'pset')} bar).`,
      s.flowLmin > 1
        ? `Pasan ${s.flowLmin.toFixed(0)} l/min: el aire atraviesa el filtro, la membrana del regulador abre lo justo y el lubricador añade aceite.`
        : 'Sin consumo: el regulador mantiene la salida a la presión ajustada.',
    ],
  };

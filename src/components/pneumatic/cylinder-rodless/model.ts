import { num, type ComponentModel } from '../../../core/registry';
import {
  areaOf,
  buildCyl,
  commonCylParams,
  cushionParams,
  explainCyl,
  initCyl,
  marksParam,
  updateCyl,
  type CylHandles,
  type CylState,
} from '../cylinder-core';

const [bore, stroke, mass, load, startPos] = commonCylParams({ bore: 25, stroke: 200, mass: 1.5 });

/** Cilindro sin vástago: un carro exterior se mueve a lo largo del tubo (áreas iguales). */
export const cylinderRodlessModel: ComponentModel<CylState, CylHandles> = {
  type: 'pneu-cyl-rodless',
  category: 'actuators',
  name: 'Cilindro sin vástago',
  description:
    'El émbolo arrastra un carro por fuera del tubo. Ocupa poco más que su carrera y empuja igual en los dos sentidos.',
  autoLabel: (n) => `${n}A`,
  params: [bore, stroke, mass, load, startPos, ...cushionParams, marksParam],
  ports: () => [
    { id: '1', medium: 'pneu', x: -80, y: 20, dir: 'down', label: 'Cámara izquierda' },
    { id: '2', medium: 'pneu', x: 80, y: 20, dir: 'down', label: 'Cámara derecha' },
  ],
  bbox: () => ({ x0: -90, y0: -20, x1: 90, y1: 20 }),
  initState: initCyl,
  build: (b, p) => buildCyl(b, p),
  update(ctx, s, h, p, dt) {
    updateCyl(ctx, s, h, p, dt, areaOf(num(p, 'bore')), 0);
  },
  explain: (s, p) =>
    explainCyl(s, p, {
      cap: 'Cámara izquierda',
      rod: 'Cámara derecha',
      plus: 'El carro se mueve a la DERECHA',
      minus: 'El carro se mueve a la IZQUIERDA',
      endPlus: 'Carro en el extremo derecho.',
      endMinus: 'Carro en el extremo izquierdo.',
    }),
};

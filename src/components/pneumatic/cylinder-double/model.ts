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

export type CylinderState = CylState;

const [bore, stroke, mass, load, startPos] = commonCylParams({ bore: 20, stroke: 100 });

export const cylinderDoubleModel: ComponentModel<CylState, CylHandles> = {
  type: 'pneu-cyl-double',
  category: 'actuators',
  name: 'Cilindro de doble efecto',
  description:
    'El aire empuja el émbolo en ambos sentidos: por la cámara trasera para avanzar y por la delantera para retroceder.',
  autoLabel: (n) => `${n}A`,
  params: [
    bore,
    {
      key: 'rod',
      label: 'Diámetro del vástago',
      unit: 'mm',
      type: 'number',
      default: 8,
      min: 2,
      max: 100,
      step: 1,
    },
    stroke,
    mass,
    load,
    startPos,
    ...cushionParams,
    marksParam,
  ],
  ports: () => [
    { id: '1', medium: 'pneu', x: -50, y: 30, dir: 'down', label: 'Cámara trasera' },
    { id: '2', medium: 'pneu', x: 30, y: 30, dir: 'down', label: 'Cámara delantera' },
  ],
  bbox: () => ({ x0: -60, y0: -15, x1: 140, y1: 30 }),
  initState: initCyl,
  build: (b, p) => buildCyl(b, p),
  update(ctx, s, h, p, dt) {
    const aCap = areaOf(num(p, 'bore'));
    updateCyl(ctx, s, h, p, dt, aCap, Math.min(areaOf(num(p, 'rod')), aCap * 0.95));
  },
  explain: (s, p) =>
    explainCyl(s, p, {
      cap: 'Cámara trasera',
      rod: 'Cámara delantera',
      plus: 'El émbolo AVANZA: el aire entra por detrás y sale por la cámara delantera',
      minus: 'El émbolo RETROCEDE: el aire entra por delante y sale por la cámara trasera',
      endPlus: 'Vástago totalmente fuera (posición final delantera).',
      endMinus: 'Vástago totalmente dentro (posición final trasera).',
    }),
};

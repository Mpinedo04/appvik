import { num, type ComponentModel } from '../../../core/registry';
import {
  areaOf,
  buildCyl,
  explainCyl,
  initCyl,
  updateCyl,
  type CylHandles,
  type CylState,
} from '../cylinder-core';

/** Pinza paralela de doble efecto: un émbolo cierra o abre las dos mordazas. */
export const gripperModel: ComponentModel<CylState, CylHandles> = {
  type: 'pneu-gripper',
  category: 'actuators',
  name: 'Pinza neumática',
  description: 'Dos mordazas que se cierran con aire por la conexión 1 y se abren por la 2.',
  autoLabel: (n) => `${n}A`,
  params: [
    {
      key: 'bore',
      label: 'Diámetro del émbolo',
      unit: 'mm',
      type: 'number',
      default: 16,
      min: 6,
      max: 63,
      step: 1,
    },
    {
      key: 'stroke',
      label: 'Recorrido de cada mordaza',
      unit: 'mm',
      type: 'number',
      default: 10,
      min: 2,
      max: 50,
      step: 1,
    },
    {
      key: 'mass',
      label: 'Masa en movimiento',
      unit: 'kg',
      type: 'number',
      default: 0.1,
      min: 0.01,
      max: 10,
      step: 0.01,
    },
    {
      key: 'load',
      label: 'Fuerza de la pieza (opuesta al cierre)',
      unit: 'N',
      type: 'number',
      default: 0,
      min: 0,
      max: 2000,
      step: 1,
    },
  ],
  ports: () => [
    { id: '1', medium: 'pneu', x: -10, y: 30, dir: 'down', label: 'Cerrar' },
    { id: '2', medium: 'pneu', x: 10, y: 30, dir: 'down', label: 'Abrir' },
  ],
  bbox: () => ({ x0: -25, y0: -40, x1: 25, y1: 30 }),
  initState: initCyl,
  build: (b, p) => buildCyl(b, p),
  update(ctx, s, h, p, dt) {
    updateCyl(ctx, s, h, p, dt, areaOf(num(p, 'bore')), 0);
  },
  explain: (s, p) =>
    explainCyl(s, p, {
      cap: 'Cámara de cierre',
      rod: 'Cámara de apertura',
      plus: 'Las mordazas se CIERRAN',
      minus: 'Las mordazas se ABREN',
      endPlus: 'Pinza cerrada.',
      endMinus: 'Pinza abierta.',
    }),
};

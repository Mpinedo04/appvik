import { num, type ComponentModel } from '../../../core/registry';
import {
  areaOf,
  buildCyl,
  explainCyl,
  initCyl,
  marksParam,
  updateCyl,
  type CylHandles,
  type CylState,
} from '../cylinder-core';

/**
 * Actuador de giro de piñón y cremallera: un émbolo doble mueve una cremallera que hace girar
 * el eje. Se simula como un cilindro de áreas iguales cuya carrera equivale al ángulo.
 */
export const rotaryModel: ComponentModel<CylState, CylHandles> = {
  type: 'pneu-rotary',
  category: 'actuators',
  name: 'Actuador de giro',
  description:
    'Gira su eje un ángulo fijo (p. ej. 180°) en un sentido u otro según la conexión que reciba aire.',
  autoLabel: (n) => `${n}A`,
  params: [
    {
      key: 'bore',
      label: 'Diámetro del émbolo',
      unit: 'mm',
      type: 'number',
      default: 25,
      min: 8,
      max: 100,
      step: 1,
    },
    {
      key: 'angle',
      label: 'Ángulo de giro',
      unit: '°',
      type: 'number',
      default: 180,
      min: 15,
      max: 360,
      step: 15,
    },
    {
      key: 'stroke',
      label: 'Carrera de la cremallera',
      unit: 'mm',
      type: 'number',
      default: 30,
      min: 5,
      max: 200,
      step: 1,
    },
    {
      key: 'mass',
      label: 'Inercia equivalente',
      unit: 'kg',
      type: 'number',
      default: 0.5,
      min: 0.05,
      max: 100,
      step: 0.05,
    },
    {
      key: 'load',
      label: 'Par resistente equivalente',
      unit: 'N',
      type: 'number',
      default: 0,
      min: -5000,
      max: 5000,
      step: 1,
    },
    marksParam,
  ],
  ports: () => [
    { id: '1', medium: 'pneu', x: -20, y: 30, dir: 'down', label: 'Giro horario' },
    { id: '2', medium: 'pneu', x: 20, y: 30, dir: 'down', label: 'Giro antihorario' },
  ],
  bbox: () => ({ x0: -30, y0: -30, x1: 30, y1: 30 }),
  initState: initCyl,
  build: (b, p) => buildCyl(b, p),
  update(ctx, s, h, p, dt) {
    updateCyl(ctx, s, h, p, dt, areaOf(num(p, 'bore')), 0);
  },
  explain(s, p) {
    const lines = explainCyl(s, p, {
      cap: 'Cámara de giro horario',
      rod: 'Cámara de giro antihorario',
      plus: 'GIRA en sentido horario',
      minus: 'GIRA en sentido antihorario',
      endPlus: 'Giro completo en sentido horario.',
      endMinus: 'En la posición inicial.',
    });
    lines.splice(2, 0, `Ángulo actual: ${(s.pos * num(p, 'angle')).toFixed(0)}°.`);
    return lines;
  },
};

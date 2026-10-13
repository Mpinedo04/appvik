/**
 * Válvulas preconfiguradas que aparecen como elementos propios en la biblioteca (igual que en
 * un simulador clásico). Son las mismas válvulas de vías con otros valores por defecto.
 */
import { VALVE_32NC, VALVE_52, type WayValveConfig } from './config';
import type { ValvePreset } from './model';

export const VALVE_PRESETS: { cfg: WayValveConfig; preset: ValvePreset }[] = [
  {
    cfg: {
      ...VALVE_32NC,
      type: 'pneu-limit-32',
      name: 'Final de carrera (3/2 con rodillo)',
      short: '3/2 rodillo',
      description:
        'Válvula 3/2 NC accionada por rodillo. Se acciona cuando la leva del cilindro pasa por la marca con su misma etiqueta (p. ej. 1S2).',
    },
    preset: {
      category: 'sensors',
      autoLabel: (n) => `1S${n}`,
      defaults: { actLeft: 'roller', sensor: '1S1' },
    },
  },
  {
    cfg: {
      ...VALVE_52,
      type: 'pneu-valve-52-pilot',
      name: 'Válvula 5/2 pilotada (monoestable)',
      short: '5/2 pilotada',
      description:
        'Válvula 5/2 accionada por presión en 14 y retorno por muelle. Para el mando indirecto de cilindros.',
    },
    preset: { defaults: { actLeft: 'pilot', actRight: 'spring' } },
  },
  {
    cfg: {
      ...VALVE_52,
      type: 'pneu-valve-52-memory',
      name: 'Válvula 5/2 biestable (memoria)',
      short: '5/2 memoria',
      description:
        'Válvula 5/2 con pilotaje en ambos lados y sin muelle: recuerda la última orden recibida (14 o 12) aunque desaparezca la señal.',
    },
    preset: { defaults: { actLeft: 'pilot', actRight: 'pilot' } },
  },
  {
    cfg: {
      ...VALVE_52,
      type: 'pneu-valve-52-sol',
      name: 'Electroválvula 5/2 monoestable',
      short: '5/2 electro',
      description:
        'Válvula 5/2 accionada por el electroimán Y1 y con retorno por muelle: conmuta mientras la bobina Y1 recibe 24 V.',
    },
    preset: { defaults: { actLeft: 'solenoid', actRight: 'spring' } },
  },
  {
    cfg: {
      ...VALVE_52,
      type: 'pneu-valve-52-sol2',
      name: 'Electroválvula 5/2 biestable',
      short: '5/2 electro biest.',
      description:
        'Válvula 5/2 con dos electroimanes (Y1 y Y2) y sin muelle: un impulso en Y1 o en Y2 la cambia de posición y se queda así.',
    },
    preset: { defaults: { actLeft: 'solenoid', actRight: 'solenoid' } },
  },
  {
    cfg: {
      ...VALVE_32NC,
      type: 'pneu-valve-32-sol',
      name: 'Electroválvula 3/2 NC',
      short: '3/2 electro',
      description:
        'Válvula 3/2 normalmente cerrada accionada por el electroimán Y1 y con retorno por muelle.',
    },
    preset: { defaults: { actLeft: 'solenoid', actRight: 'spring' } },
  },
  {
    cfg: {
      ...VALVE_32NC,
      type: 'pneu-sequence',
      name: 'Válvula de secuencia',
      short: 'Secuencia',
      description:
        'Válvula 3/2 que conmuta cuando la presión de pilotaje (12) alcanza el valor ajustado. Sirve para iniciar un movimiento cuando otro ha alcanzado cierta fuerza.',
    },
    preset: {
      category: 'flowpressure',
      defaults: { actLeft: 'pilot', actRight: 'spring', pilotBar: 3 },
    },
  },
];

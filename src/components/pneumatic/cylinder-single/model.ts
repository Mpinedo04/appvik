import { num, type ComponentModel } from '../../../core/registry';
import { stepPiston } from '../../../core/sim/mechanics';
import { P_ATM, cm3, mm, paToBarGauge } from '../../../core/units';
import {
  areaOf,
  commonCylParams,
  initCyl,
  marksParam,
  parseMarks,
  publishMarks,
  type CylState,
  type Mark,
} from '../cylinder-core';

export interface SingleState extends CylState {
  /** Fuerza del muelle [N] */
  spring: number;
}

interface Handles {
  cap: number;
  marks: Mark[];
}

const [bore, stroke, mass, load, startPos] = commonCylParams({ bore: 20, stroke: 50, mass: 0.5 });

/** Cilindro de simple efecto: el aire lo hace avanzar y un muelle lo devuelve. */
export const cylinderSingleModel: ComponentModel<SingleState, Handles> = {
  type: 'pneu-cyl-single',
  category: 'actuators',
  name: 'Cilindro de simple efecto',
  description:
    'El aire sólo actúa en la cámara trasera: el émbolo avanza con presión y retrocede empujado por un muelle cuando la cámara se descarga.',
  autoLabel: (n) => `${n}A`,
  params: [
    bore,
    stroke,
    mass,
    load,
    startPos,
    {
      key: 'springF0',
      label: 'Fuerza inicial del muelle',
      unit: 'N',
      type: 'number',
      default: 20,
      min: 0,
      max: 2000,
      step: 1,
    },
    {
      key: 'springK',
      label: 'Rigidez del muelle',
      unit: 'N/mm',
      type: 'number',
      default: 0.3,
      min: 0,
      max: 100,
      step: 0.05,
    },
    marksParam,
  ],
  ports: () => [{ id: '1', medium: 'pneu', x: -50, y: 30, dir: 'down', label: 'Cámara trasera' }],
  bbox: () => ({ x0: -60, y0: -15, x1: 140, y1: 30 }),
  initState: (p) => ({ ...initCyl(p), spring: 0 }),
  build: (b, p) => ({ cap: b.port('1'), marks: parseMarks(String(p.marks ?? '')) }),
  update(ctx, s, h, p, dt) {
    const L = mm(num(p, 'stroke'));
    const a = areaOf(num(p, 'bore'));
    const pCap = ctx.p(h.cap);
    s.spring = num(p, 'springF0') + num(p, 'springK') * s.x * 1000;
    // La cámara del muelle está abierta a la atmósfera (respiradero).
    s.force = (pCap - P_ATM) * a - s.spring;
    if (dt > 0)
      stepPiston(
        s,
        {
          mass: num(p, 'mass'),
          stroke: L,
          fStatic: 3 + a * 3e4,
          fCoulomb: 2 + a * 2e4,
          cViscous: 20 + a * 1e5,
        },
        s.force - num(p, 'load'),
        dt,
      );
    s.pos = L > 0 ? s.x / L : 0;
    s.pCap = paToBarGauge(pCap);
    s.pRod = 0;
    ctx.addVolume(h.cap, cm3(1) + a * s.x);
    s.activeMarks = publishMarks(ctx, h.marks, s.x * 1000, s.v);
  },
  explain(s) {
    const lines = [
      `Cámara trasera: ${s.pCap.toFixed(2)} bar. Muelle comprimido: ${s.spring.toFixed(0)} N.`,
      `Fuerza neta (aire − muelle): ${s.force.toFixed(0)} N.`,
    ];
    if (s.v > 0.002)
      lines.push(`AVANZA a ${(s.v * 1000).toFixed(0)} mm/s: el aire vence al muelle.`);
    else if (s.v < -0.002)
      lines.push(
        `RETROCEDE a ${(-s.v * 1000).toFixed(0)} mm/s: el muelle expulsa el aire de la cámara.`,
      );
    else if (s.pos > 0.995) lines.push('Vástago fuera: el aire mantiene comprimido el muelle.');
    else if (s.pos < 0.005) lines.push('Vástago dentro: el muelle lo mantiene retraído.');
    if (s.activeMarks.length)
      lines.push(`La leva acciona el final de carrera ${s.activeMarks.join(', ')}.`);
    return lines;
  },
};

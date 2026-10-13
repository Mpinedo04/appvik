import { num, type ComponentModel } from '../../../core/registry';
import { stepPiston } from '../../../core/sim/mechanics';
import { P_ATM, circleArea, cm3, mm, paToBarGauge } from '../../../core/units';

export interface CylinderState {
  /** Posición del émbolo [m] */
  x: number;
  /** Velocidad [m/s] */
  v: number;
  /** Carrera recorrida (0..1), para dibujar */
  pos: number;
  pCap: number;
  pRod: number;
  /** Fuerza neumática neta [N] */
  force: number;
}

interface Handles {
  cap: number;
  rod: number;
}

const DEAD_VOLUME = cm3(1);

export const cylinderDoubleModel: ComponentModel<CylinderState, Handles> = {
  type: 'pneu-cyl-double',
  category: 'actuators',
  name: 'Cilindro de doble efecto',
  description:
    'El aire empuja el émbolo en ambos sentidos: por la cámara trasera para avanzar y por la delantera para retroceder.',
  autoLabel: (n) => `${n}A`,
  params: [
    {
      key: 'bore',
      label: 'Diámetro del émbolo',
      unit: 'mm',
      type: 'number',
      default: 20,
      min: 6,
      max: 200,
      step: 1,
    },
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
    {
      key: 'stroke',
      label: 'Carrera',
      unit: 'mm',
      type: 'number',
      default: 100,
      min: 5,
      max: 2000,
      step: 5,
    },
    {
      key: 'mass',
      label: 'Masa en movimiento',
      unit: 'kg',
      type: 'number',
      default: 1,
      min: 0.05,
      max: 1000,
      step: 0.05,
    },
    {
      key: 'load',
      label: 'Fuerza de carga (opuesta al avance)',
      unit: 'N',
      type: 'number',
      default: 0,
      min: -10000,
      max: 10000,
      step: 1,
    },
    {
      key: 'startPos',
      label: 'Posición inicial',
      unit: '%',
      type: 'number',
      default: 0,
      min: 0,
      max: 100,
      step: 1,
    },
  ],
  ports: () => [
    { id: '1', medium: 'pneu', x: -50, y: 30, dir: 'down', label: 'Cámara trasera' },
    { id: '2', medium: 'pneu', x: 30, y: 30, dir: 'down', label: 'Cámara delantera' },
  ],
  bbox: () => ({ x0: -60, y0: -15, x1: 140, y1: 30 }),
  initState: (p) => {
    const x = (mm(num(p, 'stroke')) * num(p, 'startPos')) / 100;
    return { x, v: 0, pos: num(p, 'startPos') / 100, pCap: 0, pRod: 0, force: 0 };
  },
  build(b) {
    return { cap: b.port('1'), rod: b.port('2') };
  },
  update(ctx, s, h, p, dt) {
    const stroke = mm(num(p, 'stroke'));
    const aCap = circleArea(mm(num(p, 'bore')));
    const aRod = Math.min(circleArea(mm(num(p, 'rod'))), aCap * 0.95);
    const pCap = ctx.p(h.cap);
    const pRod = ctx.p(h.rod);
    s.force = pCap * aCap - pRod * (aCap - aRod) - P_ATM * aRod;
    if (dt > 0) {
      stepPiston(
        s,
        {
          mass: num(p, 'mass'),
          stroke,
          // Fricción de las juntas aproximadamente proporcional al tamaño del émbolo.
          fStatic: 4 + aCap * 4e4,
          fCoulomb: 2 + aCap * 2.5e4,
          cViscous: 20 + aCap * 1e5,
        },
        s.force - num(p, 'load'),
        dt,
      );
    }
    s.pos = stroke > 0 ? s.x / stroke : 0;
    s.pCap = paToBarGauge(pCap);
    s.pRod = paToBarGauge(pRod);
    ctx.addVolume(h.cap, DEAD_VOLUME + aCap * s.x);
    ctx.addVolume(h.rod, DEAD_VOLUME + (aCap - aRod) * (stroke - s.x));
  },
  explain(s, p) {
    const lines = [
      `Cámara trasera: ${s.pCap.toFixed(2)} bar · cámara delantera: ${s.pRod.toFixed(2)} bar.`,
      `Fuerza neumática neta sobre el émbolo: ${s.force.toFixed(0)} N${num(p, 'load') ? ` (carga: ${num(p, 'load')} N)` : ''}.`,
    ];
    if (s.v > 0.002)
      lines.push(
        `El émbolo AVANZA a ${(s.v * 1000).toFixed(0)} mm/s: el aire entra por detrás y sale por la cámara delantera.`,
      );
    else if (s.v < -0.002)
      lines.push(
        `El émbolo RETROCEDE a ${(-s.v * 1000).toFixed(0)} mm/s: el aire entra por delante y sale por la cámara trasera.`,
      );
    else if (s.pos > 0.995) lines.push('Vástago totalmente fuera (posición final delantera).');
    else if (s.pos < 0.005) lines.push('Vástago totalmente dentro (posición final trasera).');
    else lines.push(`Émbolo detenido al ${(s.pos * 100).toFixed(0)} % de la carrera.`);
    return lines;
  },
};

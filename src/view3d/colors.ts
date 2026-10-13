import * as THREE from 'three';

const IDLE = new THREE.Color('#2f6fde');

/** Igual que pressureColor() del 2D, pero escribiendo en un THREE.Color (sin crear objetos). */
export function setPressureColor(c: THREE.Color, bar: number, maxBar = 6): THREE.Color {
  const t = Math.max(0, Math.min(1, bar / maxBar));
  if (t < 0.02) return c.copy(IDLE);
  return c.setHSL((220 - 220 * t) / 360, 0.8, (48 - 4 * t) / 100, THREE.SRGBColorSpace);
}

/** Color neutro de las tuberías en modo edición (poliuretano azul). */
export const TUBE_IDLE = new THREE.Color('#5b8fd9');

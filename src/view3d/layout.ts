/**
 * Correspondencia entre el plano 2D del esquema y la escena 3D.
 * El eje X local del símbolo va al eje X 3D y el eje Y local (hacia abajo) al eje Z 3D, así
 * que los racores de cada modelo 3D caen exactamente bajo los puertos del esquema.
 */
import type { ComponentInstance, Vec2 } from '../core/model/types';

/** Unidades 3D por unidad de dibujo. */
export const S = 0.01;
/** Altura (en unidades de dibujo) de los ejes de las piezas, racores y tuberías sobre el tablero. */
export const AXIS_Y = 14;

export function toScene(p: Vec2, h = AXIS_Y): [number, number, number] {
  return [p.x * S, h * S, p.y * S];
}

/** Transformación del grupo 3D de un componente (equivalente a svgTransform). */
export function componentTransform(c: Pick<ComponentInstance, 'x' | 'y' | 'rot' | 'flip'>) {
  return {
    position: [c.x * S, 0, c.y * S] as [number, number, number],
    // Un giro horario en pantalla (y hacia abajo) es un giro negativo alrededor del eje Y 3D.
    rotationY: (-c.rot * Math.PI) / 180,
    scaleX: c.flip ? -1 : 1,
  };
}

/** Aplica la transformación de componentTransform a un punto local (para tests y cálculos). */
export function localToScene(
  c: Pick<ComponentInstance, 'x' | 'y' | 'rot' | 'flip'>,
  local: Vec2,
): [number, number] {
  const t = componentTransform(c);
  const lx = local.x * S * t.scaleX;
  const lz = local.y * S;
  const cos = Math.cos(t.rotationY);
  const sin = Math.sin(t.rotationY);
  // Rotación alrededor de Y: x' = x·cos + z·sin ; z' = −x·sin + z·cos
  return [t.position[0] + lx * cos + lz * sin, t.position[2] - lx * sin + lz * cos];
}

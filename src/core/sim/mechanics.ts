/** Dinámica de un émbolo lineal con masa, fricción (Coulomb + estática + viscosa) y topes. */

export interface PistonState {
  /** Posición [m] (0 = retraído) */
  x: number;
  /** Velocidad [m/s] (positiva = avance) */
  v: number;
}

export interface PistonParams {
  mass: number;
  stroke: number;
  /** Fricción estática (de despegue) [N] */
  fStatic: number;
  /** Fricción de Coulomb en movimiento [N] */
  fCoulomb: number;
  /** Coeficiente viscoso [N·s/m] */
  cViscous: number;
}

const V_EPS = 1e-4;

/**
 * Integra un paso (Euler semi-implícito). `force` es la fuerza motriz neta sin fricción
 * (positiva = avance). Devuelve true si el émbolo ha golpeado un tope.
 *
 * `stiffness` [N/m] es la rigidez del fluido encerrado en las cámaras (A²·dp/dV). Con aceite
 * es enorme: se trata de forma implícita (la fuerza baja en `stiffness·v·dt` durante el paso),
 * con lo que la integración es estable sin subpasos.
 */
export function stepPiston(
  s: PistonState,
  pp: PistonParams,
  force: number,
  dt: number,
  stiffness = 0,
): boolean {
  const atRest = Math.abs(s.v) < V_EPS;
  if (atRest) {
    // Adherencia: no arranca mientras la fuerza no supere la fricción estática.
    const blockedByStop = (s.x <= 0 && force <= 0) || (s.x >= pp.stroke && force >= 0);
    if (Math.abs(force) <= pp.fStatic || blockedByStop) {
      s.v = 0;
      return false;
    }
  }
  const dirMove = atRest ? Math.sign(force) : Math.sign(s.v);
  const friction = dirMove * pp.fCoulomb + pp.cViscous * s.v;
  const a = (force - friction) / pp.mass;
  let v = (s.v + a * dt) / (1 + (stiffness * dt * dt) / pp.mass);
  // Si la fricción invierte el sentido, el émbolo se detiene en este paso.
  if (!atRest && Math.sign(v) !== Math.sign(s.v)) v = 0;
  let x = s.x + v * dt;
  let hit = false;
  if (x <= 0) {
    x = 0;
    if (v < 0) {
      v = 0;
      hit = true;
    }
  } else if (x >= pp.stroke) {
    x = pp.stroke;
    if (v > 0) {
      v = 0;
      hit = true;
    }
  }
  s.x = x;
  s.v = v;
  return hit;
}

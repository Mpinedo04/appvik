/** Constantes físicas y conversiones de unidades (SI internamente). */

/** Presión atmosférica de referencia [Pa]. */
export const P_ATM = 101_325;
/** Constante específica del aire [J/(kg·K)]. */
export const R_AIR = 287.05;
/** Temperatura de trabajo (modelo isotermo) [K]. */
export const T_REF = 293.15;
/** Densidad del aire en condiciones normales ANR (ISO 8778) [kg/m³]. */
export const RHO_ANR = 1.185;
/** Producto R·T usado constantemente en la ley de gases ideales. */
export const RT = R_AIR * T_REF;

/** bar relativos → Pa absolutos */
export const barGaugeToPa = (bar: number) => bar * 1e5 + P_ATM;
/** Pa absolutos → bar relativos */
export const paToBarGauge = (pa: number) => (pa - P_ATM) / 1e5;

export const mm = (v: number) => v / 1000;
export const cm3 = (v: number) => v * 1e-6;

/**
 * Conductancia sónica C [m³/(s·Pa)] a partir del caudal nominal Qn [l/min]
 * (definición habitual: p1 = 6 bar relativos, Δp = 1 bar, b = 0.3).
 */
export function conductanceFromNominalFlow(qnLmin: number, b = 0.3): number {
  const p1 = barGaugeToPa(6);
  const p2 = barGaugeToPa(5);
  const r = p2 / p1;
  const phi = Math.sqrt(1 - ((r - b) / (1 - b)) ** 2);
  return qnLmin / 60_000 / (p1 * phi);
}

/** Área de un círculo a partir de su diámetro [m] */
export const circleArea = (d: number) => (Math.PI * d * d) / 4;

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

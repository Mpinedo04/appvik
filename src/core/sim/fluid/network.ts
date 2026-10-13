/**
 * Red neumática de parámetros concentrados.
 *
 * - Cada nodo guarda la masa de aire que contiene; su presión es p = m·R·T / V (modelo isotermo).
 * - El volumen de un nodo = volumen base (tuberías, volúmenes muertos) + volumen variable
 *   que aportan los componentes en cada paso (cámaras de cilindros).
 * - Los orificios siguen la norma ISO 6358 (conductancia sónica C y relación crítica b).
 * - Integración explícita con limitador: un orificio nunca transfiere en un paso más masa de
 *   la que igualaría las presiones de sus dos nodos. Esto la hace estable aun con volúmenes
 *   muy pequeños y pasos de tiempo moderados.
 */
import { P_ATM, RHO_ANR, RT } from '../../units';

export interface FluidNode {
  name: string;
  fixed: boolean;
  pFixed: number;
  baseVolume: number;
  dynVolume: number;
  mass: number;
  p: number;
}

export interface Orifice {
  name: string;
  a: number;
  b: number;
  C: number;
  bCrit: number;
  opening: number;
  mdot: number;
}

/** Caudal másico ISO 6358 de up → down [kg/s] para apertura 1. */
export function iso6358MassFlow(pUp: number, pDown: number, C: number, b: number): number {
  if (pUp <= 0) return 0;
  const r = pDown / pUp;
  if (r >= 1) return 0;
  let phi = 1;
  if (r > b) {
    const k = (r - b) / (1 - b);
    phi = Math.sqrt(Math.max(0, 1 - k * k));
  }
  return C * pUp * RHO_ANR * phi;
}

/** Fracción máxima del salto de equilibrio que se permite transferir en un paso. */
const LIMIT = 0.5;

export class FluidNetwork {
  nodes: FluidNode[] = [];
  orifices: Orifice[] = [];
  readonly atmosphere: number;
  private dm: Float64Array = new Float64Array(0);

  constructor() {
    this.atmosphere = this.addNode({ name: 'atmósfera', fixedPressure: P_ATM });
  }

  addNode(opts: { name?: string; volume?: number; fixedPressure?: number } = {}): number {
    const fixed = opts.fixedPressure !== undefined;
    this.nodes.push({
      name: opts.name ?? `n${this.nodes.length}`,
      fixed,
      pFixed: opts.fixedPressure ?? P_ATM,
      baseVolume: opts.volume ?? 0,
      dynVolume: 0,
      mass: 0,
      p: fixed ? (opts.fixedPressure as number) : P_ATM,
    });
    return this.nodes.length - 1;
  }

  addOrifice(a: number, b: number, C: number, bCrit = 0.3, name = ''): number {
    this.orifices.push({ name, a, b, C, bCrit, opening: 1, mdot: 0 });
    return this.orifices.length - 1;
  }

  volume(i: number): number {
    const n = this.nodes[i];
    // Volumen mínimo para evitar divisiones por cero en nodos sin tuberías.
    return Math.max(1e-8, n.baseVolume + n.dynVolume);
  }

  beginStep() {
    for (const n of this.nodes) n.dynVolume = 0;
  }

  /** Inicializa la masa de cada nodo a presión atmosférica con los volúmenes actuales. */
  initMasses(p0 = P_ATM) {
    this.nodes.forEach((n, i) => {
      n.mass = n.fixed ? 0 : (p0 * this.volume(i)) / RT;
    });
    this.updatePressures();
  }

  updatePressures() {
    this.nodes.forEach((n, i) => {
      n.p = n.fixed ? n.pFixed : (n.mass * RT) / this.volume(i);
    });
  }

  /** Avanza dt segundos: calcula caudales con las presiones actuales e integra las masas. */
  integrate(dt: number) {
    this.updatePressures();
    if (this.dm.length !== this.nodes.length) this.dm = new Float64Array(this.nodes.length);
    this.dm.fill(0);
    for (const o of this.orifices) {
      const na = this.nodes[o.a];
      const nb = this.nodes[o.b];
      if (o.opening <= 0 || o.C <= 0) {
        o.mdot = 0;
        continue;
      }
      const C = o.C * o.opening;
      let mdot =
        na.p >= nb.p
          ? iso6358MassFlow(na.p, nb.p, C, o.bCrit)
          : -iso6358MassFlow(nb.p, na.p, C, o.bCrit);
      // Limitador de equilibrio: dp/dm = RT/V en cada nodo libre.
      const ka = na.fixed ? 0 : RT / this.volume(o.a);
      const kb = nb.fixed ? 0 : RT / this.volume(o.b);
      if (ka + kb > 0) {
        const dmEq = (na.p - nb.p) / (ka + kb);
        const maxDm = Math.abs(dmEq) * LIMIT;
        if (Math.abs(mdot * dt) > maxDm) mdot = (Math.sign(mdot) * maxDm) / dt;
      }
      o.mdot = mdot;
      this.dm[o.a] -= mdot * dt;
      this.dm[o.b] += mdot * dt;
    }
    this.nodes.forEach((n, i) => {
      if (!n.fixed) n.mass = Math.max(0, n.mass + this.dm[i]);
    });
    // Presiones al final del paso (los volúmenes variables siguen siendo los de este paso).
    this.updatePressures();
  }

  /** Masa total en nodos libres (para comprobar conservación). */
  totalFreeMass(): number {
    return this.nodes.reduce((s, n) => s + (n.fixed ? 0 : n.mass), 0);
  }
}

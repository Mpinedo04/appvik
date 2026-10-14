/**
 * Red de fluidos de parámetros concentrados: aire (neumática) y aceite (hidráulica).
 *
 * - Cada nodo guarda la masa de fluido que contiene y su presión sale de ella:
 *   · aire, modelo isotermo: p = m·R·T / V;
 *   · aceite, compresibilidad lineal: p = p_atm + β·(m/ρ − V)/V (con un mínimo por cavitación).
 * - El volumen de un nodo = volumen base (tuberías, volúmenes muertos) + volumen variable
 *   que aportan los componentes en cada paso (cámaras de cilindros).
 * - Orificios de aire según ISO 6358 (conductancia sónica C y relación crítica b); orificios
 *   de aceite turbulentos (q = K·√Δp) con un tramo laminar cerca de Δp = 0.
 * - Fuentes de caudal (bombas) cuyo caudal fija el componente en cada paso.
 * - Aire: integración explícita con limitador (un orificio nunca transfiere en un paso más
 *   masa de la que igualaría las presiones de sus dos nodos): estable con volúmenes pequeños.
 * - Aceite: es tan rígido que el limitador frenaría el caudal artificialmente, así que se
 *   integra de forma implícita: las presiones al final del paso se obtienen resolviendo el
 *   sistema linealizado (orificios con su conductancia secante) por Gauss-Seidel.
 */
import { BETA_OIL, P_ATM, P_CAVITATION, RHO_ANR, RHO_OIL, RT } from '../../units';

/**
 * gas: aire; oil: aceite; accumulator: aceite que comprime un gas precargado (acumulador
 * hidráulico de vejiga: p·V_gas = p0·V0, isotermo).
 */
export type FluidKind = 'gas' | 'oil' | 'accumulator';

export interface FluidNode {
  name: string;
  kind: FluidKind;
  fixed: boolean;
  pFixed: number;
  baseVolume: number;
  dynVolume: number;
  mass: number;
  p: number;
  /** Presión inicial [Pa] (si no, la atmosférica). */
  p0?: number;
  /** Acumulador: volumen de gas V0 [m³] y presión de precarga absoluta [Pa]. */
  gasVolume?: number;
  precharge?: number;
}

export interface Orifice {
  name: string;
  kind: FluidKind;
  a: number;
  b: number;
  /** Aire: conductancia sónica C [m³/(s·Pa)]; aceite: coeficiente K [m³/(s·√Pa)]. */
  C: number;
  bCrit: number;
  opening: number;
  mdot: number;
}

export interface FlowSource {
  name: string;
  a: number;
  b: number;
  /** Caudal másico de a → b fijado por el componente [kg/s]. */
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

/** Por debajo de este salto el orificio de aceite es laminar (caudal proporcional a Δp). */
const DP_LAMINAR = 1e5;

/** Caudal volumétrico de aceite de a → b [m³/s] para apertura 1. */
export function oilFlow(dp: number, K: number): number {
  const a = Math.abs(dp);
  const q = a < DP_LAMINAR ? (K * a) / Math.sqrt(DP_LAMINAR) : K * Math.sqrt(a);
  return Math.sign(dp) * q;
}

/** Fracción máxima del salto de equilibrio que se permite transferir en un paso. */
const LIMIT = 0.5;
/** Iteraciones máximas y tolerancia [Pa] de la resolución implícita del aceite. */
const OIL_ITER = 80;
const OIL_TOL = 20;

/** Conductancia secante de un orificio de aceite q/Δp [m³/(s·Pa)]. */
function oilConductance(dp: number, K: number): number {
  const a = Math.abs(dp);
  return a < DP_LAMINAR ? K / Math.sqrt(DP_LAMINAR) : K / Math.sqrt(a);
}

export class FluidNetwork {
  nodes: FluidNode[] = [];
  orifices: Orifice[] = [];
  sources: FlowSource[] = [];
  readonly atmosphere: number;
  private dm: Float64Array = new Float64Array(0);
  /** Para el aceite: orificios que tocan cada nodo (se recalcula si cambia la red). */
  private oilAdj: number[][] = [];
  private oilAdjKey = '';
  private pIter: Float64Array = new Float64Array(0);

  constructor() {
    this.atmosphere = this.addNode({ name: 'atmósfera', fixedPressure: P_ATM });
  }

  addNode(
    opts: {
      name?: string;
      volume?: number;
      fixedPressure?: number;
      initialPressure?: number;
      kind?: FluidKind;
      gasVolume?: number;
      precharge?: number;
    } = {},
  ): number {
    const fixed = opts.fixedPressure !== undefined;
    this.nodes.push({
      name: opts.name ?? `n${this.nodes.length}`,
      kind: opts.kind ?? 'gas',
      fixed,
      pFixed: opts.fixedPressure ?? P_ATM,
      baseVolume: opts.volume ?? 0,
      dynVolume: 0,
      mass: 0,
      p: fixed ? (opts.fixedPressure as number) : P_ATM,
      p0: opts.initialPressure,
      gasVolume: opts.gasVolume,
      precharge: opts.precharge,
    });
    return this.nodes.length - 1;
  }

  addOrifice(a: number, b: number, C: number, bCrit = 0.3, name = '', kind: FluidKind = 'gas') {
    this.orifices.push({ name, kind, a, b, C, bCrit, opening: 1, mdot: 0 });
    return this.orifices.length - 1;
  }

  addSource(a: number, b: number, name = ''): number {
    this.sources.push({ name, a, b, mdot: 0 });
    return this.sources.length - 1;
  }

  volume(i: number): number {
    const n = this.nodes[i];
    // Volumen mínimo para evitar divisiones por cero en nodos sin tuberías.
    return Math.max(1e-8, n.baseVolume + n.dynVolume);
  }

  /** Rigidez del nodo: dp/dm [Pa/kg] (0 si la presión es fija). */
  dpdm(i: number): number {
    const n = this.nodes[i];
    if (n.fixed) return 0;
    if (n.kind === 'accumulator') {
      // Mientras el aceite no supera la precarga, el acumulador está vacío (rígido como aceite).
      if (n.p <= (n.precharge ?? P_ATM)) return BETA_OIL / (RHO_OIL * this.volume(i));
      return (n.p * n.p) / ((n.precharge ?? P_ATM) * (n.gasVolume ?? 1e-3) * RHO_OIL);
    }
    return n.kind === 'oil' ? BETA_OIL / (RHO_OIL * this.volume(i)) : RT / this.volume(i);
  }

  /** Rigidez del nodo frente a un cambio de volumen: −dp/dV [Pa/m³]. */
  dpdV(i: number): number {
    const n = this.nodes[i];
    if (n.fixed) return 0;
    if (n.kind === 'accumulator') return this.dpdm(i) * RHO_OIL;
    return n.kind === 'oil' ? BETA_OIL / this.volume(i) : n.p / this.volume(i);
  }

  /** Volumen de aceite que ha entrado en el acumulador [m³] (0 si está vacío). */
  storedOil(i: number): number {
    const n = this.nodes[i];
    return n.kind === 'accumulator' ? Math.max(0, n.mass / RHO_OIL - this.volume(i)) : 0;
  }

  beginStep() {
    for (const n of this.nodes) n.dynVolume = 0;
  }

  /** Inicializa la masa de cada nodo a su presión inicial con los volúmenes actuales. */
  initMasses(p0 = P_ATM) {
    this.nodes.forEach((n, i) => {
      if (n.fixed) {
        n.mass = 0;
        return;
      }
      const p = n.p0 ?? p0;
      const V = this.volume(i);
      n.mass = n.kind === 'gas' ? (p * V) / RT : RHO_OIL * V * (1 + (p - P_ATM) / BETA_OIL);
    });
    this.updatePressures();
  }

  updatePressures() {
    this.nodes.forEach((n, i) => {
      if (n.fixed) n.p = n.pFixed;
      else if (n.kind === 'accumulator') {
        // El aceite que no cabe en el volumen muerto comprime el gas de la vejiga.
        const V = this.volume(i);
        const extra = n.mass / RHO_OIL - V;
        const p0 = n.precharge ?? P_ATM;
        const V0 = n.gasVolume ?? 1e-3;
        n.p =
          extra <= 0
            ? Math.max(P_CAVITATION, P_ATM + (BETA_OIL * extra) / V)
            : Math.max(p0, (p0 * V0) / Math.max(V0 * 0.02, V0 - extra));
        // Por debajo de la precarga (vejiga vacía) manda la compresibilidad del aceite.
        if (extra > 0 && P_ATM + (BETA_OIL * extra) / V < p0) n.p = P_ATM + (BETA_OIL * extra) / V;
      } else if (n.kind === 'oil') {
        const V = this.volume(i);
        n.p = Math.max(P_CAVITATION, P_ATM + (BETA_OIL * (n.mass / RHO_OIL - V)) / V);
      } else n.p = (n.mass * RT) / this.volume(i);
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
      if (o.kind !== 'gas') continue;
      if (o.opening <= 0 || o.C <= 0) {
        o.mdot = 0;
        continue;
      }
      const C = o.C * o.opening;
      let mdot =
        na.p >= nb.p
          ? iso6358MassFlow(na.p, nb.p, C, o.bCrit)
          : -iso6358MassFlow(nb.p, na.p, C, o.bCrit);
      // Limitador de equilibrio.
      const ka = this.dpdm(o.a);
      const kb = this.dpdm(o.b);
      if (ka + kb > 0) {
        const dmEq = (na.p - nb.p) / (ka + kb);
        const maxDm = Math.abs(dmEq) * LIMIT;
        if (Math.abs(mdot * dt) > maxDm) mdot = (Math.sign(mdot) * maxDm) / dt;
      }
      o.mdot = mdot;
      this.dm[o.a] -= mdot * dt;
      this.dm[o.b] += mdot * dt;
    }
    for (const s of this.sources) {
      this.dm[s.a] -= s.mdot * dt;
      this.dm[s.b] += s.mdot * dt;
    }
    this.integrateOil(dt);
    this.nodes.forEach((n, i) => {
      if (!n.fixed) n.mass = Math.max(0, n.mass + this.dm[i]);
    });
    // Presiones al final del paso (los volúmenes variables siguen siendo los de este paso).
    this.updatePressures();
  }

  /**
   * Aceite, implícito: para cada nodo libre, (p − p*)/k = dt·Σ g·(p_j − p) + dt·fuentes, con
   * p* la presión con la masa actual y el volumen nuevo, k = dp/dm y g la conductancia secante
   * (en masa) de cada orificio. Gauss-Seidel converge porque la diagonal domina (1/k > 0).
   * Después, los caudales se calculan con las presiones resueltas y la masa de cada nodo
   * cambia exactamente lo que entra y sale (se conserva).
   */
  private integrateOil(dt: number) {
    const key = `${this.nodes.length}:${this.orifices.length}`;
    if (key !== this.oilAdjKey) {
      this.oilAdjKey = key;
      this.oilAdj = this.nodes.map(() => []);
      this.orifices.forEach((o, i) => {
        if (o.kind === 'gas') return;
        this.oilAdj[o.a].push(i);
        this.oilAdj[o.b].push(i);
      });
    }
    const nodes = this.nodes;
    if (this.pIter.length !== nodes.length) this.pIter = new Float64Array(nodes.length);
    const p = this.pIter;
    const active: number[] = [];
    nodes.forEach((n, i) => {
      p[i] = n.p;
      if (!n.fixed && n.kind !== 'gas' && this.oilAdj[i].length) active.push(i);
    });
    if (!active.length) {
      for (const o of this.orifices) if (o.kind !== 'gas') o.mdot = 0;
      return;
    }
    const src = new Float64Array(nodes.length);
    for (const s of this.sources) {
      src[s.a] -= s.mdot;
      src[s.b] += s.mdot;
    }
    const kInv = active.map((i) => 1 / this.dpdm(i));
    const pStar = active.map((i) => nodes[i].p);
    for (let it = 0; it < OIL_ITER; it++) {
      let change = 0;
      active.forEach((i, ai) => {
        let num = pStar[ai] * kInv[ai] + dt * src[i];
        let den = kInv[ai];
        for (const oi of this.oilAdj[i]) {
          const o = this.orifices[oi];
          if (o.opening <= 0 || o.C <= 0) continue;
          const j = o.a === i ? o.b : o.a;
          const g = RHO_OIL * oilConductance(p[i] - p[j], o.C * o.opening);
          num += dt * g * p[j];
          den += dt * g;
        }
        const pi = num / den;
        change = Math.max(change, Math.abs(pi - p[i]));
        p[i] = pi;
      });
      if (change < OIL_TOL) break;
    }
    for (const o of this.orifices) {
      if (o.kind === 'gas') continue;
      if (o.opening <= 0 || o.C <= 0) {
        o.mdot = 0;
        continue;
      }
      const dp = p[o.a] - p[o.b];
      o.mdot = RHO_OIL * oilConductance(dp, o.C * o.opening) * dp;
      this.dm[o.a] -= o.mdot * dt;
      this.dm[o.b] += o.mdot * dt;
    }
  }

  /** Masa total en nodos libres (para comprobar conservación). */
  totalFreeMass(): number {
    return this.nodes.reduce((s, n) => s + (n.fixed ? 0 : n.mass), 0);
  }
}

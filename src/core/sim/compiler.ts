/**
 * Compilador: Circuit → red física.
 * Une los puertos conectados (tuberías y derivaciones) en nodos de fluido y calcula el
 * volumen de cada nodo a partir de la longitud de las tuberías.
 */
import { connectionPolyline, polylineLength } from '../model/geometry';
import { endpointKey, type Circuit } from '../model/types';
import { getModel, resolveParams, type PortDef } from '../registry';
import { circleArea, cm3, mm } from '../units';
import type { FluidNetwork } from './fluid/network';

/** Escala del lienzo: milímetros reales de tubería por unidad de dibujo. */
export const TUBE_MM_PER_UNIT = 4;
/** Diámetro interior de tubería por defecto. */
export const TUBE_INNER_DIAMETER_MM = 4;
/** Volumen muerto de cada puerto. */
const PORT_DEAD_VOLUME = cm3(0.5);
/** Conductancia de un puerto abierto a la atmósfera (prácticamente sin restricción). */
export const OPEN_PORT_C = 5e-8;

class UnionFind {
  private parent = new Map<string, string>();
  find(k: string): string {
    if (!this.parent.has(k)) this.parent.set(k, k);
    let r = k;
    while (this.parent.get(r) !== r) r = this.parent.get(r)!;
    let c = k;
    while (this.parent.get(c) !== r) {
      const n = this.parent.get(c)!;
      this.parent.set(c, r);
      c = n;
    }
    return r;
  }
  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

export interface CompiledNets {
  /** `${compId}:${portId}` → índice de nodo */
  portNode: Map<string, number>;
  /** id de conexión → índice de nodo */
  connNode: Map<string, number>;
  /** id de derivación → índice de nodo */
  junctionNode: Map<string, number>;
  /** Puertos neumáticos sin conectar */
  openPorts: { comp: string; port: PortDef }[];
}

export const portKey = (comp: string, port: string) => `${comp}:${port}`;

export function compileFluidNets(circuit: Circuit, net: FluidNetwork): CompiledNets {
  const uf = new UnionFind();
  const connected = new Set<string>();
  for (const conn of Object.values(circuit.connections)) {
    if (conn.medium !== 'pneu') continue;
    const ka = endpointKey(conn.a);
    const kb = endpointKey(conn.b);
    uf.union(ka, kb);
    connected.add(ka);
    connected.add(kb);
  }

  const rootNode = new Map<string, number>();
  const nodeFor = (key: string) => {
    const r = uf.find(key);
    let n = rootNode.get(r);
    if (n === undefined) {
      n = net.addNode({ name: r });
      rootNode.set(r, n);
    }
    return n;
  };

  const result: CompiledNets = {
    portNode: new Map(),
    connNode: new Map(),
    junctionNode: new Map(),
    openPorts: [],
  };

  for (const c of Object.values(circuit.components)) {
    const m = getModel(c.type);
    for (const p of m.ports(resolveParams(m, c.params))) {
      if (p.medium !== 'pneu') continue;
      const key = endpointKey({ kind: 'port', comp: c.id, port: p.id });
      const n = nodeFor(key);
      net.nodes[n].baseVolume += PORT_DEAD_VOLUME;
      result.portNode.set(portKey(c.id, p.id), n);
      if (!connected.has(key)) {
        result.openPorts.push({ comp: c.id, port: p });
        net.addOrifice(n, net.atmosphere, OPEN_PORT_C, 0.3, `abierto ${c.label}:${p.id}`);
      }
    }
  }

  const tubeArea = circleArea(mm(TUBE_INNER_DIAMETER_MM));
  for (const conn of Object.values(circuit.connections)) {
    if (conn.medium !== 'pneu') continue;
    const n = nodeFor(endpointKey(conn.a));
    result.connNode.set(conn.id, n);
    const length = mm(polylineLength(connectionPolyline(circuit, conn.id)) * TUBE_MM_PER_UNIT);
    net.nodes[n].baseVolume += length * tubeArea;
  }
  for (const j of Object.values(circuit.junctions)) {
    if (j.medium !== 'pneu') continue;
    result.junctionNode.set(j.id, nodeFor(endpointKey({ kind: 'junction', id: j.id })));
  }
  return result;
}

export interface CompiledElectric {
  /** `${compId}:${portId}` → nodo eléctrico */
  portNode: Map<string, number>;
  connNode: Map<string, number>;
  junctionNode: Map<string, number>;
}

/** Une los bornes eléctricos conectados por cables (y derivaciones) en nodos eléctricos. */
export function compileElectricNets(
  circuit: Circuit,
  net: { addNode(): number },
): CompiledElectric {
  const uf = new UnionFind();
  for (const conn of Object.values(circuit.connections)) {
    if (conn.medium !== 'elec') continue;
    uf.union(endpointKey(conn.a), endpointKey(conn.b));
  }
  const rootNode = new Map<string, number>();
  const nodeFor = (key: string) => {
    const r = uf.find(key);
    let n = rootNode.get(r);
    if (n === undefined) {
      n = net.addNode();
      rootNode.set(r, n);
    }
    return n;
  };
  const result: CompiledElectric = {
    portNode: new Map(),
    connNode: new Map(),
    junctionNode: new Map(),
  };
  for (const c of Object.values(circuit.components)) {
    const m = getModel(c.type);
    for (const p of m.ports(resolveParams(m, c.params))) {
      if (p.medium !== 'elec') continue;
      result.portNode.set(
        portKey(c.id, p.id),
        nodeFor(endpointKey({ kind: 'port', comp: c.id, port: p.id })),
      );
    }
  }
  for (const conn of Object.values(circuit.connections))
    if (conn.medium === 'elec') result.connNode.set(conn.id, nodeFor(endpointKey(conn.a)));
  for (const j of Object.values(circuit.junctions))
    if (j.medium === 'elec')
      result.junctionNode.set(j.id, nodeFor(endpointKey({ kind: 'junction', id: j.id })));
  return result;
}

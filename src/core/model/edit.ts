/**
 * Operaciones de edición sobre un Circuit (funcionan igual sobre borradores de Immer).
 * Son puras respecto a la interfaz: el editor y los tests las reutilizan.
 */
import { getModel, resolveParams } from '../registry';
import { autoRoute, closestOnSegment, connectionPolyline, endpointGeom, snap } from './geometry';
import {
  endpointKey,
  newId,
  sameEndpoint,
  type Circuit,
  type Endpoint,
  type Medium,
  type Params,
  type Rotation,
  type Vec2,
} from './types';

export function nextLabel(circuit: Circuit, type: string): string {
  const m = getModel(type);
  const used = new Set(Object.values(circuit.components).map((c) => c.label));
  for (let n = 1; ; n++) if (!used.has(m.autoLabel(n))) return m.autoLabel(n);
}

export function addComponent(
  circuit: Circuit,
  type: string,
  x: number,
  y: number,
  params: Params = {},
): string {
  const id = newId('c');
  circuit.components[id] = {
    id,
    type,
    x: snap(x),
    y: snap(y),
    rot: 0,
    flip: false,
    label: nextLabel(circuit, type),
    params,
  };
  return id;
}

export function endpointMedium(circuit: Circuit, e: Endpoint): Medium | null {
  if (e.kind === 'junction') return circuit.junctions[e.id]?.medium ?? null;
  const c = circuit.components[e.comp];
  if (!c) return null;
  const m = getModel(c.type);
  return m.ports(resolveParams(m, c.params)).find((p) => p.id === e.port)?.medium ?? null;
}

export function connectionsAt(circuit: Circuit, e: Endpoint): string[] {
  const k = endpointKey(e);
  return Object.values(circuit.connections)
    .filter((c) => endpointKey(c.a) === k || endpointKey(c.b) === k)
    .map((c) => c.id);
}

export type ConnectResult = { ok: true; id: string } | { ok: false; reason: string };

export function connect(circuit: Circuit, a: Endpoint, b: Endpoint): ConnectResult {
  if (sameEndpoint(a, b))
    return { ok: false, reason: 'No se puede conectar un puerto consigo mismo.' };
  const ma = endpointMedium(circuit, a);
  const mb = endpointMedium(circuit, b);
  if (!ma || !mb) return { ok: false, reason: 'Extremo inexistente.' };
  if (ma !== mb)
    return {
      ok: false,
      reason: 'No se pueden unir conexiones de distinto tipo (aire, aceite, electricidad).',
    };
  const dup = Object.values(circuit.connections).some(
    (c) =>
      (sameEndpoint(c.a, a) && sameEndpoint(c.b, b)) ||
      (sameEndpoint(c.a, b) && sameEndpoint(c.b, a)),
  );
  if (dup) return { ok: false, reason: 'Esa conexión ya existe.' };
  const ga = endpointGeom(circuit, a)!;
  const gb = endpointGeom(circuit, b)!;
  const id = newId('w');
  circuit.connections[id] = {
    id,
    a,
    b,
    medium: ma,
    points: autoRoute(ga.pos, ga.dir, gb.pos, gb.dir),
  };
  return { ok: true, id };
}

/** Punto de la tubería más cercano a `p`, ajustado a la cuadrícula a lo largo del tramo. */
export function nearestOnConnection(circuit: Circuit, connId: string, p: Vec2) {
  const poly = connectionPolyline(circuit, connId);
  let best = { d: Infinity, q: p, seg: -1 };
  for (let i = 0; i < poly.length - 1; i++) {
    const r = closestOnSegment(p, poly[i], poly[i + 1]);
    if (r.d < best.d) best = { d: r.d, q: r.q, seg: i };
  }
  if (best.seg >= 0) {
    const a = poly[best.seg];
    const b = poly[best.seg + 1];
    if (a.y === b.y) best.q = { x: clampBetween(snap(best.q.x), a.x, b.x), y: a.y };
    else if (a.x === b.x) best.q = { x: a.x, y: clampBetween(snap(best.q.y), a.y, b.y) };
  }
  return best;
}

const clampBetween = (v: number, a: number, b: number) =>
  Math.min(Math.max(a, b), Math.max(Math.min(a, b), v));

/** Inserta una derivación (T) en una tubería y devuelve el id de la derivación. */
export function splitConnection(circuit: Circuit, connId: string, p: Vec2): string {
  const conn = circuit.connections[connId];
  const poly = connectionPolyline(circuit, connId);
  const { q, seg } = nearestOnConnection(circuit, connId, p);
  const jid = newId('j');
  circuit.junctions[jid] = { id: jid, x: q.x, y: q.y, medium: conn.medium };
  const j: Endpoint = { kind: 'junction', id: jid };
  const id1 = newId('w');
  const id2 = newId('w');
  circuit.connections[id1] = {
    id: id1,
    a: conn.a,
    b: j,
    medium: conn.medium,
    points: poly.slice(1, seg + 1),
  };
  circuit.connections[id2] = {
    id: id2,
    a: j,
    b: conn.b,
    medium: conn.medium,
    points: poly.slice(seg + 1, poly.length - 1),
  };
  delete circuit.connections[connId];
  return jid;
}

/** Elimina derivaciones que ya no tienen sentido (0, 1 o 2 conexiones). */
export function cleanupJunctions(circuit: Circuit) {
  let changed = true;
  while (changed) {
    changed = false;
    for (const j of Object.values(circuit.junctions)) {
      const e: Endpoint = { kind: 'junction', id: j.id };
      const conns = connectionsAt(circuit, e);
      if (conns.length >= 3) continue;
      if (conns.length === 2) {
        const [c1, c2] = conns.map((id) => circuit.connections[id]);
        const p1 = connectionPolyline(circuit, c1.id);
        const p2 = connectionPolyline(circuit, c2.id);
        // Orientamos ambas para que la derivación quede en medio: otro1 → J → otro2.
        const first = sameEndpoint(c1.b, e) ? p1 : [...p1].reverse();
        const second = sameEndpoint(c2.a, e) ? p2 : [...p2].reverse();
        const other1 = sameEndpoint(c1.b, e) ? c1.a : c1.b;
        const other2 = sameEndpoint(c2.a, e) ? c2.b : c2.a;
        const id = newId('w');
        const points = [...first.slice(1), ...second.slice(1, -1)];
        circuit.connections[id] = {
          id,
          a: other1,
          b: other2,
          medium: c1.medium,
          points: simplifyInterior(first[0], points, second[second.length - 1]),
        };
        delete circuit.connections[c1.id];
        delete circuit.connections[c2.id];
      } else {
        for (const id of conns) delete circuit.connections[id];
      }
      delete circuit.junctions[j.id];
      changed = true;
    }
  }
}

function simplifyInterior(a: Vec2, pts: Vec2[], b: Vec2): Vec2[] {
  const all = [a, ...pts, b];
  const out: Vec2[] = [];
  for (const p of all) {
    const l = out[out.length - 1];
    if (!l || l.x !== p.x || l.y !== p.y) out.push(p);
  }
  for (let i = out.length - 2; i >= 1; i--) {
    const [p, q, r] = [out[i - 1], out[i], out[i + 1]];
    if ((p.x === q.x && q.x === r.x) || (p.y === q.y && q.y === r.y)) out.splice(i, 1);
  }
  return out.slice(1, -1);
}

export function removeItems(
  circuit: Circuit,
  comps: string[],
  conns: string[],
  junctions: string[] = [],
) {
  const compSet = new Set(comps);
  const jSet = new Set(junctions);
  for (const id of conns) delete circuit.connections[id];
  for (const c of Object.values(circuit.connections)) {
    const touches = (e: Endpoint) => (e.kind === 'port' ? compSet.has(e.comp) : jSet.has(e.id));
    if (touches(c.a) || touches(c.b)) delete circuit.connections[c.id];
  }
  for (const id of comps) delete circuit.components[id];
  for (const id of junctions) delete circuit.junctions[id];
  cleanupJunctions(circuit);
}

export function rerouteConnection(circuit: Circuit, connId: string) {
  const c = circuit.connections[connId];
  const ga = endpointGeom(circuit, c.a);
  const gb = endpointGeom(circuit, c.b);
  if (ga && gb) c.points = autoRoute(ga.pos, ga.dir, gb.pos, gb.dir);
}

/**
 * Desplaza componentes y derivaciones respecto a sus posiciones en `base`.
 * Las tuberías entre elementos movidos se trasladan; las demás se vuelven a trazar.
 */
export function moveItems(
  circuit: Circuit,
  base: Circuit,
  comps: string[],
  junctions: string[],
  dx: number,
  dy: number,
) {
  const compSet = new Set(comps);
  const jSet = new Set(junctions);
  for (const id of comps) {
    const b = base.components[id];
    if (b && circuit.components[id]) {
      circuit.components[id].x = b.x + dx;
      circuit.components[id].y = b.y + dy;
    }
  }
  for (const id of junctions) {
    const b = base.junctions[id];
    if (b && circuit.junctions[id]) {
      circuit.junctions[id].x = b.x + dx;
      circuit.junctions[id].y = b.y + dy;
    }
  }
  const moves = (e: Endpoint) => (e.kind === 'port' ? compSet.has(e.comp) : jSet.has(e.id));
  for (const c of Object.values(circuit.connections)) {
    const ma = moves(c.a);
    const mb = moves(c.b);
    if (!ma && !mb) continue;
    const bc = base.connections[c.id];
    if (ma && mb && bc) c.points = bc.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
    else rerouteConnection(circuit, c.id);
  }
}

function rerouteAttached(circuit: Circuit, comps: Set<string>) {
  for (const c of Object.values(circuit.connections)) {
    if (
      (c.a.kind === 'port' && comps.has(c.a.comp)) ||
      (c.b.kind === 'port' && comps.has(c.b.comp))
    )
      rerouteConnection(circuit, c.id);
  }
}

export function rotateItems(circuit: Circuit, comps: string[]) {
  for (const id of comps) {
    const c = circuit.components[id];
    if (c) c.rot = ((c.rot + 90) % 360) as Rotation;
  }
  rerouteAttached(circuit, new Set(comps));
}

export function flipItems(circuit: Circuit, comps: string[]) {
  for (const id of comps) {
    const c = circuit.components[id];
    if (c) c.flip = !c.flip;
  }
  rerouteAttached(circuit, new Set(comps));
}

/** Arrastra el tramo interior `seg` de una tubería en perpendicular. */
export function dragSegment(
  circuit: Circuit,
  base: Circuit,
  connId: string,
  seg: number,
  dx: number,
  dy: number,
) {
  const poly = connectionPolyline(base, connId);
  const a = poly[seg];
  const b = poly[seg + 1];
  if (!a || !b || seg === 0 || seg === poly.length - 2) return;
  const horizontal = a.y === b.y;
  const next = poly.map((p, i) =>
    i === seg || i === seg + 1
      ? horizontal
        ? { x: p.x, y: p.y + dy }
        : { x: p.x + dx, y: p.y }
      : p,
  );
  circuit.connections[connId].points = next.slice(1, -1);
}

/** Problemas de diseño detectables sin simular. */
export interface DesignIssue {
  kind: 'open-port';
  comp: string;
  port: string;
  message: string;
}

export function validate(circuit: Circuit): DesignIssue[] {
  const connected = new Set<string>();
  for (const c of Object.values(circuit.connections)) {
    connected.add(endpointKey(c.a));
    connected.add(endpointKey(c.b));
  }
  const issues: DesignIssue[] = [];
  for (const c of Object.values(circuit.components)) {
    const m = getModel(c.type);
    for (const p of m.ports(resolveParams(m, c.params))) {
      if (p.exhaust) continue;
      if (!connected.has(endpointKey({ kind: 'port', comp: c.id, port: p.id })))
        issues.push({
          kind: 'open-port',
          comp: c.id,
          port: p.id,
          message: `${c.label}: el puerto ${p.label ?? p.id} está abierto${p.medium === 'pneu' ? ' (el aire escapará por él)' : ''}.`,
        });
    }
  }
  return issues;
}

/** Copia los componentes seleccionados y las conexiones internas entre ellos. */
export function extractSubcircuit(circuit: Circuit, comps: string[]): Circuit {
  const set = new Set(comps);
  const out: Circuit = { components: {}, connections: {}, junctions: {} };
  for (const id of comps)
    if (circuit.components[id]) out.components[id] = structuredClone(circuit.components[id]);
  for (const c of Object.values(circuit.connections)) {
    if (c.a.kind === 'port' && c.b.kind === 'port' && set.has(c.a.comp) && set.has(c.b.comp))
      out.connections[c.id] = structuredClone(c);
  }
  return out;
}

/** Pega un subcircuito con ids nuevos, desplazado. Devuelve los ids de los componentes nuevos. */
export function pasteSubcircuit(circuit: Circuit, sub: Circuit, dx: number, dy: number): string[] {
  const map = new Map<string, string>();
  for (const c of Object.values(sub.components)) {
    const id = newId('c');
    map.set(c.id, id);
    circuit.components[id] = {
      ...structuredClone(c),
      id,
      x: c.x + dx,
      y: c.y + dy,
      label: nextLabel(circuit, c.type),
    };
  }
  for (const w of Object.values(sub.connections)) {
    if (w.a.kind !== 'port' || w.b.kind !== 'port') continue;
    const id = newId('w');
    circuit.connections[id] = {
      id,
      medium: w.medium,
      a: { kind: 'port', comp: map.get(w.a.comp)!, port: w.a.port },
      b: { kind: 'port', comp: map.get(w.b.comp)!, port: w.b.port },
      points: w.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
    };
  }
  return [...map.values()];
}

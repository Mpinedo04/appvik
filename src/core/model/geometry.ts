import { getModel, resolveParams, type BBox, type PortDef } from '../registry';
import type { Circuit, ComponentInstance, Dir, Endpoint, Rotation, Vec2 } from './types';

export const GRID = 10;
export const snap = (v: number, g = GRID) => Math.round(v / g) * g;

/** Local → mundo: primero reflejo horizontal, luego giro horario (eje y hacia abajo). */
export function localToWorld(
  c: Pick<ComponentInstance, 'x' | 'y' | 'rot' | 'flip'>,
  p: Vec2,
): Vec2 {
  let x = c.flip ? -p.x : p.x;
  let y = p.y;
  [x, y] = rotate(x, y, c.rot);
  return { x: c.x + x, y: c.y + y };
}

function rotate(x: number, y: number, rot: Rotation): [number, number] {
  switch (rot) {
    case 90:
      return [-y, x];
    case 180:
      return [-x, -y];
    case 270:
      return [y, -x];
    default:
      return [x, y];
  }
}

const DIR_VEC: Record<Dir, Vec2> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export function dirVec(d: Dir): Vec2 {
  return DIR_VEC[d];
}

export function transformDir(c: Pick<ComponentInstance, 'rot' | 'flip'>, d: Dir): Dir {
  let { x, y } = DIR_VEC[d];
  if (c.flip) x = -x;
  [x, y] = rotate(x, y, c.rot);
  if (x === 1) return 'right';
  if (x === -1) return 'left';
  return y === 1 ? 'down' : 'up';
}

/** Transformación SVG equivalente a localToWorld. */
export function svgTransform(c: Pick<ComponentInstance, 'x' | 'y' | 'rot' | 'flip'>): string {
  return `translate(${c.x} ${c.y}) rotate(${c.rot}) scale(${c.flip ? -1 : 1} 1)`;
}

export interface WorldPort {
  comp: string;
  def: PortDef;
  pos: Vec2;
  dir: Dir;
}

export function componentPorts(c: ComponentInstance): WorldPort[] {
  const m = getModel(c.type);
  return m.ports(resolveParams(m, c.params)).map((def) => ({
    comp: c.id,
    def,
    pos: localToWorld(c, def),
    dir: transformDir(c, def.dir),
  }));
}

export function allPorts(circuit: Circuit): WorldPort[] {
  return Object.values(circuit.components).flatMap(componentPorts);
}

export function worldBBox(c: ComponentInstance): BBox {
  const m = getModel(c.type);
  const b = m.bbox(resolveParams(m, c.params));
  const pts = [localToWorld(c, { x: b.x0, y: b.y0 }), localToWorld(c, { x: b.x1, y: b.y1 })];
  return {
    x0: Math.min(pts[0].x, pts[1].x),
    y0: Math.min(pts[0].y, pts[1].y),
    x1: Math.max(pts[0].x, pts[1].x),
    y1: Math.max(pts[0].y, pts[1].y),
  };
}

/** Posición y dirección de salida de un extremo de conexión. */
export function endpointGeom(circuit: Circuit, e: Endpoint): { pos: Vec2; dir: Dir | null } | null {
  if (e.kind === 'junction') {
    const j = circuit.junctions[e.id];
    return j ? { pos: { x: j.x, y: j.y }, dir: null } : null;
  }
  const c = circuit.components[e.comp];
  if (!c) return null;
  const m = getModel(c.type);
  const def = m.ports(resolveParams(m, c.params)).find((p) => p.id === e.port);
  if (!def) return null;
  return { pos: localToWorld(c, def), dir: transformDir(c, def.dir) };
}

/** Polilínea completa de una conexión (extremos + codos). */
export function connectionPolyline(circuit: Circuit, connId: string): Vec2[] {
  const conn = circuit.connections[connId];
  if (!conn) return [];
  const a = endpointGeom(circuit, conn.a);
  const b = endpointGeom(circuit, conn.b);
  if (!a || !b) return [];
  return [a.pos, ...conn.points, b.pos];
}

export function polylineLength(pts: Vec2[]): number {
  let L = 0;
  for (let i = 1; i < pts.length; i++)
    L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return L;
}

/** Distancia de un punto a un segmento y el punto más cercano. */
export function closestOnSegment(p: Vec2, a: Vec2, b: Vec2): { d: number; q: Vec2 } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L2 = dx * dx + dy * dy;
  const t = L2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2));
  const q = { x: a.x + t * dx, y: a.y + t * dy };
  return { d: Math.hypot(p.x - q.x, p.y - q.y), q };
}

const STUB = 20;

/**
 * Trazado ortogonal automático entre dos extremos. Devuelve sólo los codos intermedios.
 * Sale de cada puerto en su dirección un tramo corto y une ambos con forma de Z.
 */
export function autoRoute(a: Vec2, aDir: Dir | null, b: Vec2, bDir: Dir | null): Vec2[] {
  // Si sólo el destino tiene dirección (p. ej. desde una derivación), se traza al revés.
  if (!aDir && bDir) return autoRoute(b, bDir, a, null).reverse();
  const da = aDir ? dirVec(aDir) : { x: 0, y: 0 };
  const db = bDir ? dirVec(bDir) : { x: 0, y: 0 };
  const s = { x: a.x + da.x * STUB, y: a.y + da.y * STUB };
  const e = { x: b.x + db.x * STUB, y: b.y + db.y * STUB };
  const vertical = aDir ? aDir === 'up' || aDir === 'down' : !(bDir === 'up' || bDir === 'down');
  let mid: Vec2[];
  if (vertical) {
    // Salida vertical: tramo vertical, horizontal y vertical.
    let my = snap((s.y + e.y) / 2);
    if (aDir === 'down') my = Math.max(my, s.y);
    if (aDir === 'up') my = Math.min(my, s.y);
    mid = [
      { x: s.x, y: my },
      { x: e.x, y: my },
    ];
  } else {
    let mx = snap((s.x + e.x) / 2);
    if (aDir === 'right') mx = Math.max(mx, s.x);
    if (aDir === 'left') mx = Math.min(mx, s.x);
    mid = [
      { x: mx, y: s.y },
      { x: mx, y: e.y },
    ];
  }
  return simplify([a, s, ...mid, e, b]).slice(1, -1);
}

/** Elimina puntos repetidos y codos colineales. */
export function simplify(pts: Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (last && last.x === p.x && last.y === p.y) continue;
    out.push(p);
  }
  for (let i = out.length - 2; i >= 1; i--) {
    const a = out[i - 1];
    const b = out[i];
    const c = out[i + 1];
    if ((a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y)) out.splice(i, 1);
  }
  return out;
}

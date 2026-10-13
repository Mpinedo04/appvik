/**
 * Geometrías procedurales reutilizables (en unidades de dibujo; los modelos se escalan con S).
 * Se cachean por parámetros: muchos componentes iguales comparten la misma geometría.
 */
import * as THREE from 'three';

const cache = new Map<string, THREE.BufferGeometry>();

function cached(key: string, make: () => THREE.BufferGeometry) {
  let g = cache.get(key);
  if (!g) {
    g = make();
    cache.set(key, g);
  }
  return g;
}

export const box = (w: number, h: number, d: number) =>
  cached(`box:${w}:${h}:${d}`, () => new THREE.BoxGeometry(w, h, d));

/** Cilindro macizo con el eje en X, centrado. */
export const cylX = (r: number, len: number, seg = 32) =>
  cached(`cylX:${r}:${len}:${seg}`, () =>
    new THREE.CylinderGeometry(r, r, len, seg).rotateZ(Math.PI / 2),
  );

/** Cilindro macizo con el eje en Y, centrado. */
export const cylY = (r: number, len: number, seg = 32) =>
  cached(`cylY:${r}:${len}:${seg}`, () => new THREE.CylinderGeometry(r, r, len, seg));

/** Cilindro macizo con el eje en Z, centrado. */
export const cylZ = (r: number, len: number, seg = 32) =>
  cached(`cylZ:${r}:${len}:${seg}`, () =>
    new THREE.CylinderGeometry(r, r, len, seg).rotateX(Math.PI / 2),
  );

/** Tubo hueco (con espesor de pared visible en el corte) con el eje en X, centrado. */
export const pipeX = (rOut: number, rIn: number, len: number) =>
  cached(`pipeX:${rOut}:${rIn}:${len}`, () => {
    const h = len / 2;
    const pts = [
      new THREE.Vector2(rIn, -h),
      new THREE.Vector2(rOut, -h),
      new THREE.Vector2(rOut, h),
      new THREE.Vector2(rIn, h),
      new THREE.Vector2(rIn, -h),
    ];
    return new THREE.LatheGeometry(pts, 48).rotateZ(-Math.PI / 2);
  });

/** Toroide (junta tórica) en el plano YZ, para ponerlo alrededor de un eje X. */
export const oringX = (r: number, tube: number) =>
  cached(`oring:${r}:${tube}`, () => new THREE.TorusGeometry(r, tube, 10, 40).rotateY(Math.PI / 2));

/** Muelle helicoidal a lo largo de X de longitud 1 (se estira con scale.x). */
export const helixX = (radius: number, turns: number, wire: number) =>
  cached(`helix:${radius}:${turns}:${wire}`, () => {
    const pts: THREE.Vector3[] = [];
    const N = turns * 24;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const a = t * turns * Math.PI * 2;
      pts.push(new THREE.Vector3(t, Math.cos(a) * radius, Math.sin(a) * radius));
    }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), N, wire, 6, false);
  });

/** Esfera. */
export const sphere = (r: number) =>
  cached(`sphere:${r}`, () => new THREE.SphereGeometry(r, 24, 16));

/** Tubo que sigue una polilínea con codos redondeados. */
export function polylineTube(points: THREE.Vector3[], radius: number, cornerR = 6, radial = 10) {
  const path = roundedPath(points, cornerR);
  const segs = Math.max(8, Math.ceil(path.getLength() / 3));
  return new THREE.TubeGeometry(path, segs, radius, radial, false);
}

/** Camino de segmentos rectos unidos por arcos (bezier cuadrática) en los codos. */
export function roundedPath(points: THREE.Vector3[], r: number): THREE.CurvePath<THREE.Vector3> {
  const path = new THREE.CurvePath<THREE.Vector3>();
  if (points.length < 2) {
    const p = points[0] ?? new THREE.Vector3();
    path.add(new THREE.LineCurve3(p, p.clone().add(new THREE.Vector3(0.001, 0, 0))));
    return path;
  }
  let cur = points[0].clone();
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const p = points[i];
    const next = points[i + 1];
    const d1 = p.distanceTo(prev);
    const d2 = p.distanceTo(next);
    const rr = Math.min(r, d1 / 2, d2 / 2);
    const a = p.clone().add(prev.clone().sub(p).setLength(rr));
    const b = p.clone().add(next.clone().sub(p).setLength(rr));
    if (cur.distanceTo(a) > 1e-6) path.add(new THREE.LineCurve3(cur, a));
    if (rr > 1e-6) path.add(new THREE.QuadraticBezierCurve3(a, p.clone(), b));
    cur = b;
  }
  const last = points[points.length - 1];
  if (cur.distanceTo(last) > 1e-6) path.add(new THREE.LineCurve3(cur, last.clone()));
  if (path.curves.length === 0)
    path.add(new THREE.LineCurve3(cur, cur.clone().add(new THREE.Vector3(0.001, 0, 0))));
  return path;
}

/** Muestreo de una polilínea por longitud de arco (para mover partículas). */
export class PolylineSampler {
  private cum: number[] = [0];
  readonly length: number;
  constructor(private pts: THREE.Vector3[]) {
    for (let i = 1; i < pts.length; i++)
      this.cum.push(this.cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
    this.length = this.cum[this.cum.length - 1];
  }
  at(u: number, out: THREE.Vector3): THREE.Vector3 {
    const d = Math.min(Math.max(u, 0), 1) * this.length;
    let i = 1;
    while (i < this.cum.length - 1 && this.cum[i] < d) i++;
    const seg = this.cum[i] - this.cum[i - 1] || 1;
    const t = (d - this.cum[i - 1]) / seg;
    return out.copy(this.pts[i - 1]).lerp(this.pts[i], t);
  }
}

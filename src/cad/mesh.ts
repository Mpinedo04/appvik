/**
 * Malla de una pieza CAD importada: grupos de triángulos por color, en las unidades del archivo
 * de origen. Se guarda dentro del proyecto (parámetro del componente) codificada en binario
 * compacto: posiciones cuantizadas a 16 bits sobre la caja de cada grupo, índices de 16 o 32
 * bits, todo comprimido con gzip y en base64.
 */

export interface CadGroup {
  /** Color RGB 0..1. */
  color: [number, number, number];
  positions: Float32Array;
  indices: Uint32Array;
}

export interface CadMesh {
  groups: CadGroup[];
}

export interface Extents {
  min: [number, number, number];
  max: [number, number, number];
}

export function extents(mesh: CadMesh): Extents {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const g of mesh.groups)
    for (let i = 0; i < g.positions.length; i += 3)
      for (let k = 0; k < 3; k++) {
        const v = g.positions[i + k];
        if (v < min[k]) min[k] = v;
        if (v > max[k]) max[k] = v;
      }
  if (!Number.isFinite(min[0])) return { min: [0, 0, 0], max: [0, 0, 0] };
  return { min, max };
}

export const triangleCount = (mesh: CadMesh) =>
  mesh.groups.reduce((n, g) => n + g.indices.length / 3, 0);

/**
 * Une los vértices repetidos (STL y otros formatos de triángulos sueltos) para que el archivo
 * ocupe menos. Compara posiciones redondeadas a `tol` (en unidades del archivo).
 */
export function weld(positions: Float32Array, indices: Uint32Array | null, tol = 1e-5): CadGroup {
  const map = new Map<string, number>();
  const out: number[] = [];
  const n = indices ? indices.length : positions.length / 3;
  const idx = new Uint32Array(n);
  const inv = 1 / tol;
  for (let i = 0; i < n; i++) {
    const v = indices ? indices[i] : i;
    const x = positions[v * 3];
    const y = positions[v * 3 + 1];
    const z = positions[v * 3 + 2];
    const key = `${Math.round(x * inv)},${Math.round(y * inv)},${Math.round(z * inv)}`;
    let j = map.get(key);
    if (j === undefined) {
      j = out.length / 3;
      out.push(x, y, z);
      map.set(key, j);
    }
    idx[i] = j;
  }
  return { color: [0.7, 0.72, 0.75], positions: new Float32Array(out), indices: idx };
}

/** Junta los grupos del mismo color (menos objetos que dibujar). */
export function mergeByColor(groups: CadGroup[]): CadGroup[] {
  const byColor = new Map<string, CadGroup[]>();
  for (const g of groups) {
    if (!g.indices.length) continue;
    const key = g.color.map((c) => Math.round(c * 255)).join(',');
    if (!byColor.has(key)) byColor.set(key, []);
    byColor.get(key)!.push(g);
  }
  return [...byColor.values()].map((list) => {
    if (list.length === 1) return list[0];
    const nv = list.reduce((s, g) => s + g.positions.length, 0);
    const ni = list.reduce((s, g) => s + g.indices.length, 0);
    const positions = new Float32Array(nv);
    const indices = new Uint32Array(ni);
    let pv = 0;
    let pi = 0;
    for (const g of list) {
      positions.set(g.positions, pv);
      for (let i = 0; i < g.indices.length; i++) indices[pi + i] = g.indices[i] + pv / 3;
      pv += g.positions.length;
      pi += g.indices.length;
    }
    return { color: list[0].color, positions, indices };
  });
}

/* ───────────── Codificación ───────────── */

const MAGIC = 0x314d4c46; // «FLM1»

export function encodeBinary(mesh: CadMesh): Uint8Array {
  let size = 8;
  for (const g of mesh.groups) {
    const nv = g.positions.length / 3;
    size += 12 + 8 + 24 + nv * 6 + g.indices.length * (nv < 65536 ? 2 : 4);
  }
  const buf = new ArrayBuffer(size);
  const dv = new DataView(buf);
  let o = 0;
  dv.setUint32(o, MAGIC, true);
  dv.setUint32(o + 4, mesh.groups.length, true);
  o += 8;
  for (const g of mesh.groups) {
    const nv = g.positions.length / 3;
    for (const c of g.color) {
      dv.setFloat32(o, c, true);
      o += 4;
    }
    dv.setUint32(o, nv, true);
    dv.setUint32(o + 4, g.indices.length, true);
    o += 8;
    const e = extents({ groups: [g] });
    for (const v of [...e.min, ...e.max]) {
      dv.setFloat32(o, v, true);
      o += 4;
    }
    const span = e.max.map((m, k) => m - e.min[k] || 1);
    for (let i = 0; i < g.positions.length; i++) {
      const k = i % 3;
      dv.setUint16(o, Math.round(((g.positions[i] - e.min[k]) / span[k]) * 65535), true);
      o += 2;
    }
    const wide = nv >= 65536;
    for (const v of g.indices) {
      if (wide) {
        dv.setUint32(o, v, true);
        o += 4;
      } else {
        dv.setUint16(o, v, true);
        o += 2;
      }
    }
  }
  return new Uint8Array(buf);
}

export function decodeBinary(bytes: Uint8Array): CadMesh {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(0, true) !== MAGIC) throw new Error('Malla CAD dañada.');
  const n = dv.getUint32(4, true);
  let o = 8;
  const groups: CadGroup[] = [];
  for (let gi = 0; gi < n; gi++) {
    const color: [number, number, number] = [0, 0, 0];
    for (let k = 0; k < 3; k++, o += 4) color[k] = dv.getFloat32(o, true);
    const nv = dv.getUint32(o, true);
    const ni = dv.getUint32(o + 4, true);
    o += 8;
    const lim: number[] = [];
    for (let k = 0; k < 6; k++, o += 4) lim.push(dv.getFloat32(o, true));
    const span = [0, 1, 2].map((k) => lim[k + 3] - lim[k] || 1);
    const positions = new Float32Array(nv * 3);
    for (let i = 0; i < positions.length; i++, o += 2) {
      const k = i % 3;
      positions[i] = lim[k] + (dv.getUint16(o, true) / 65535) * span[k];
    }
    const indices = new Uint32Array(ni);
    const wide = nv >= 65536;
    for (let i = 0; i < ni; i++) {
      if (wide) {
        indices[i] = dv.getUint32(o, true);
        o += 4;
      } else {
        indices[i] = dv.getUint16(o, true);
        o += 2;
      }
    }
    groups.push({ color, positions, indices });
  }
  return { groups };
}

async function pipe(bytes: Uint8Array, stream: GenericTransformStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(text: string): Uint8Array {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

const hasGzip = () => typeof CompressionStream !== 'undefined';

/** Malla → texto para guardarla en el proyecto («z:» gzip + base64, «r:» sin comprimir). */
export async function encodeMesh(mesh: CadMesh): Promise<string> {
  const bin = encodeBinary(mesh);
  if (hasGzip()) return `z:${toBase64(await pipe(bin, new CompressionStream('gzip')))}`;
  return `r:${toBase64(bin)}`;
}

export async function decodeMesh(text: string): Promise<CadMesh> {
  const bytes = fromBase64(text.slice(2));
  if (text.startsWith('z:'))
    return decodeBinary(await pipe(bytes, new DecompressionStream('gzip')));
  if (text.startsWith('r:')) return decodeBinary(bytes);
  throw new Error('Malla CAD dañada.');
}

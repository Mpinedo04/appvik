/**
 * Importación de piezas y conjuntos de CAD (SolidWorks, Inventor, Fusion, FreeCAD…).
 * - STEP e IGES (sólidos exactos): se triangulan con OpenCascade compilado a WebAssembly
 *   (occt-import-js, se descarga sólo al importar uno).
 * - STL, OBJ, 3MF, VRML, glTF/GLB y PLY (mallas): con los lectores de Three.js.
 * Los archivos nativos (.sldprt, .sldasm, Parasolid) son cerrados: hay que exportarlos antes.
 */
import type * as THREE from 'three';
import { mergeByColor, triangleCount, weld, type CadGroup, type CadMesh } from './mesh';

export type CadUnit = 'mm' | 'cm' | 'm' | 'in';

export const UNIT_MM: Record<CadUnit, number> = { mm: 1, cm: 10, m: 1000, in: 25.4 };

export const CAD_EXTENSIONS = [
  'step',
  'stp',
  'iges',
  'igs',
  'stl',
  'obj',
  '3mf',
  'wrl',
  'glb',
  'gltf',
  'ply',
];

export interface CadImport {
  mesh: CadMesh;
  /** Unidad del archivo (leída del propio archivo o estimada por el tamaño). */
  unit: CadUnit;
  /** true si la unidad viene en el archivo (STEP, IGES, 3MF, glTF). */
  unitKnown: boolean;
  triangles: number;
}

/** Límite práctico para que la escena siga fluida. */
export const MAX_TRIANGLES = 1_500_000;

const DEFAULT_COLOR: [number, number, number] = [0.74, 0.77, 0.8];

export const extOf = (name: string) => name.toLowerCase().split('.').pop() ?? '';

/* ───────────── STEP / IGES ───────────── */

interface OcctMesh {
  color?: [number, number, number];
  brep_faces?: { first: number; last: number; color: [number, number, number] | null }[];
  attributes: { position: { array: ArrayLike<number> } };
  index: { array: ArrayLike<number> };
}

export interface OcctResult {
  success: boolean;
  meshes: OcctMesh[];
}

export interface Occt {
  ReadStepFile(content: Uint8Array, params: object | null): OcctResult;
  ReadIgesFile(content: Uint8Array, params: object | null): OcctResult;
}

/** Resultado de OpenCascade → grupos por color (el color de cada cara si lo trae). */
export function occtToMesh(result: OcctResult): CadMesh {
  if (!result.success) throw new Error('OpenCascade no ha podido leer el archivo.');
  const groups: CadGroup[] = [];
  for (const m of result.meshes) {
    const pos = Float32Array.from(m.attributes.position.array);
    const idx = Uint32Array.from(m.index.array);
    const base = m.color ?? DEFAULT_COLOR;
    const faces = m.brep_faces?.length
      ? m.brep_faces
      : [{ first: 0, last: idx.length / 3 - 1, color: null }];
    const byColor = new Map<string, { color: [number, number, number]; tris: number[] }>();
    for (const f of faces) {
      const color = f.color ?? base;
      const key = color.join(',');
      if (!byColor.has(key)) byColor.set(key, { color, tris: [] });
      const list = byColor.get(key)!.tris;
      for (let t = f.first; t <= f.last; t++) list.push(t);
    }
    for (const { color, tris } of byColor.values()) {
      // Cada grupo se queda sólo con sus vértices.
      const remap = new Map<number, number>();
      const p: number[] = [];
      const ix = new Uint32Array(tris.length * 3);
      tris.forEach((t, i) => {
        for (let k = 0; k < 3; k++) {
          const v = idx[t * 3 + k];
          let j = remap.get(v);
          if (j === undefined) {
            j = p.length / 3;
            p.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
            remap.set(v, j);
          }
          ix[i * 3 + k] = j;
        }
      });
      groups.push({ color, positions: new Float32Array(p), indices: ix });
    }
  }
  return { groups: mergeByColor(groups) };
}

let occtPromise: Promise<Occt> | null = null;

async function loadOcct(): Promise<Occt> {
  occtPromise ??= (async () => {
    const [mod, wasm] = await Promise.all([
      import('occt-import-js'),
      import('occt-import-js/dist/occt-import-js.wasm?url'),
    ]);
    const factory = (mod.default ?? mod) as (o: object) => Promise<Occt>;
    const wasmBinary = await (await fetch(wasm.default)).arrayBuffer();
    return factory({ wasmBinary });
  })();
  try {
    return await occtPromise;
  } catch (e) {
    occtPromise = null;
    throw e;
  }
}

/** Triangulación fina: desviación 1/1000 de la caja y 0,3 rad, en milímetros. */
export const OCCT_PARAMS = {
  linearUnit: 'millimeter',
  linearDeflectionType: 'bounding_box_ratio',
  linearDeflection: 0.001,
  angularDeflection: 0.3,
};

/* ───────────── Mallas (Three.js) ───────────── */

/** Cualquier objeto de Three.js → grupos por color en coordenadas del archivo. */
export function objectToMesh(root: THREE.Object3D): CadMesh {
  root.updateMatrixWorld(true);
  const groups: CadGroup[] = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry?.attributes.position) return;
    const g = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    const pos = g.attributes.position.array as Float32Array;
    const index = g.index ? Uint32Array.from(g.index.array) : null;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const colorOf = (m: THREE.Material | undefined): [number, number, number] => {
      const c = (m as THREE.MeshStandardMaterial | undefined)?.color;
      // El blanco puro suele ser el material por defecto del lector: se pinta en gris.
      if (!c || (c.r === 1 && c.g === 1 && c.b === 1)) return DEFAULT_COLOR;
      const s = c.getRGB({ r: 0, g: 0, b: 0 }, 'srgb');
      return [s.r, s.g, s.b];
    };
    const vcol = g.attributes.color;
    const nTri = (index ? index.length : pos.length / 3) / 3;
    const vertex = (t: number, k: number) => (index ? index[t * 3 + k] : t * 3 + k);
    // Triángulos agrupados por material (grupos de la geometría) o por color de vértice.
    const buckets = new Map<string, { color: [number, number, number]; v: number[] }>();
    const add = (color: [number, number, number], t: number) => {
      const key = color.map((c) => Math.round(c * 64)).join(',');
      if (!buckets.has(key)) buckets.set(key, { color, v: [] });
      const b = buckets.get(key)!;
      for (let k = 0; k < 3; k++) b.v.push(vertex(t, k));
    };
    const matOfTri = new Array<THREE.Material | undefined>(nTri).fill(mats[0]);
    for (const gr of g.groups)
      for (let t = Math.floor(gr.start / 3); t < Math.min(nTri, (gr.start + gr.count) / 3); t++)
        matOfTri[t] = mats[gr.materialIndex ?? 0];
    for (let t = 0; t < nTri; t++) {
      if (vcol && (mesh.material as THREE.MeshStandardMaterial)?.vertexColors === true) {
        const v = vertex(t, 0);
        add([vcol.getX(v), vcol.getY(v), vcol.getZ(v)], t);
      } else add(colorOf(matOfTri[t]), t);
    }
    for (const { color, v } of buckets.values()) {
      const w = weld(pos, Uint32Array.from(v));
      w.color = color;
      groups.push(w);
    }
    g.dispose();
  });
  return { groups: mergeByColor(groups) };
}

async function readMesh(ext: string, bytes: Uint8Array): Promise<THREE.Object3D> {
  const buf = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const text = () => new TextDecoder().decode(bytes);
  const THREE_ = await import('three');
  switch (ext) {
    case 'stl': {
      const { STLLoader } = await import('three/examples/jsm/loaders/STLLoader.js');
      const geo = new STLLoader().parse(buf);
      const mat = new THREE_.MeshStandardMaterial({ vertexColors: !!geo.attributes.color });
      return new THREE_.Mesh(geo, mat);
    }
    case 'obj': {
      const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js');
      return new OBJLoader().parse(text());
    }
    case '3mf': {
      const { ThreeMFLoader } = await import('three/examples/jsm/loaders/3MFLoader.js');
      return new ThreeMFLoader().parse(buf);
    }
    case 'wrl': {
      const { VRMLLoader } = await import('three/examples/jsm/loaders/VRMLLoader.js');
      return new VRMLLoader().parse(text(), '');
    }
    case 'ply': {
      const { PLYLoader } = await import('three/examples/jsm/loaders/PLYLoader.js');
      const geo = new PLYLoader().parse(buf);
      const mat = new THREE_.MeshStandardMaterial({ vertexColors: !!geo.attributes.color });
      return new THREE_.Mesh(geo, mat);
    }
    case 'glb':
    case 'gltf': {
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
      const gltf = await new GLTFLoader().parseAsync(ext === 'glb' ? buf : text(), '');
      return gltf.scene;
    }
  }
  throw new Error(`Formato no admitido: .${ext}`);
}

/** Unidad declarada en un 3MF (atributo unit del modelo). */
async function unitOf3mf(bytes: Uint8Array): Promise<CadUnit> {
  const { unzipSync, strFromU8 } = await import('three/examples/jsm/libs/fflate.module.js');
  const files = unzipSync(bytes);
  const model = Object.keys(files).find((f) => f.toLowerCase().endsWith('.model'));
  const unit = model ? /unit\s*=\s*"(\w+)"/.exec(strFromU8(files[model]))?.[1] : undefined;
  const map: Record<string, CadUnit> = {
    micron: 'mm',
    millimeter: 'mm',
    centimeter: 'cm',
    meter: 'm',
    inch: 'in',
  };
  return map[unit ?? 'millimeter'] ?? 'mm';
}

/** Sin unidad en el archivo: algo de menos de 3 de largo casi seguro está en metros. */
export function guessUnit(mesh: CadMesh): CadUnit {
  let max = 0;
  for (const g of mesh.groups) for (const v of g.positions) max = Math.max(max, Math.abs(v));
  return max > 0 && max < 3 ? 'm' : 'mm';
}

/** Lee un archivo de CAD. `occt` permite inyectar OpenCascade (pruebas en Node). */
export async function importCad(name: string, bytes: Uint8Array, occt?: Occt): Promise<CadImport> {
  const ext = extOf(name);
  let mesh: CadMesh;
  let unit: CadUnit;
  let unitKnown = true;
  if (['step', 'stp', 'iges', 'igs'].includes(ext)) {
    const o = occt ?? (await loadOcct());
    const step = ext === 'step' || ext === 'stp';
    mesh = occtToMesh(
      step ? o.ReadStepFile(bytes, OCCT_PARAMS) : o.ReadIgesFile(bytes, OCCT_PARAMS),
    );
    unit = 'mm';
  } else {
    if (ext === 'sldprt' || ext === 'sldasm' || ext === 'slddrw')
      throw new Error(
        'Los archivos nativos de SolidWorks no se pueden leer: guárdalo como STEP (Archivo › Guardar como).',
      );
    mesh = objectToMesh(await readMesh(ext, bytes));
    if (ext === '3mf') unit = await unitOf3mf(bytes);
    else if (ext === 'glb' || ext === 'gltf') unit = 'm';
    else {
      unit = guessUnit(mesh);
      unitKnown = false;
    }
  }
  const triangles = triangleCount(mesh);
  if (!triangles) throw new Error('El archivo no contiene ninguna superficie.');
  if (triangles > MAX_TRIANGLES)
    throw new Error(
      `La pieza tiene ${triangles.toLocaleString('es-ES')} triángulos (máximo ${MAX_TRIANGLES.toLocaleString('es-ES')}). Expórtala con menos resolución.`,
    );
  return { mesh, unit, unitKnown, triangles };
}

/**
 * Exportación de la escena 3D a formatos de malla que abre SolidWorks (y cualquier CAD):
 * STL binario (todo en una pieza) y 3MF (un objeto por componente, con colores).
 * Coordenadas en milímetros (1 unidad de dibujo = 1 mm) con el eje Y hacia arriba, como en
 * SolidWorks; el plano del esquema queda en XZ, visto desde arriba igual que en 2D.
 */
import * as THREE from 'three';
import { zipSync } from 'three/examples/jsm/libs/fflate.module.js';

export interface ExportGroup {
  color: [number, number, number];
  positions: Float32Array;
  indices: Uint32Array;
}

export interface ExportPart {
  name: string;
  groups: ExportGroup[];
}

/** ¿Se exporta esta malla? Fuera: fluido, partículas, resaltes y caras de corte. */
function exportable(o: THREE.Object3D): boolean {
  const mesh = o as THREE.Mesh;
  if (!mesh.isMesh || !mesh.geometry?.attributes.position) return false;
  for (let p: THREE.Object3D | null = o; p; p = p.parent) {
    if (!p.visible || p.userData.noExport) return false;
  }
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return mats.every(
    (m) =>
      m &&
      !m.userData.fluid &&
      !m.userData.noExport &&
      !(m as THREE.MeshBasicMaterial).isMeshBasicMaterial,
  );
}

function partName(o: THREE.Object3D): string {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) {
    if (p.userData.exportName) return String(p.userData.exportName);
  }
  return 'Otros';
}

function ownerComp(o: THREE.Object3D): string | null {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) {
    if (p.userData.compId) return String(p.userData.compId);
  }
  return null;
}

/**
 * Recoge las mallas de `root` en sus coordenadas locales. `include` decide qué componentes
 * entran (null = tuberías, cables y demás piezas que no son de un componente).
 */
export function collectScene(
  root: THREE.Object3D,
  include: (compId: string | null) => boolean = () => true,
): ExportPart[] {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const parts = new Map<string, ExportPart>();
  const m = new THREE.Matrix4();
  const inst = new THREE.Matrix4();
  const v = new THREE.Vector3();
  root.traverse((o) => {
    if (!exportable(o) || !include(ownerComp(o))) return;
    const mesh = o as THREE.Mesh;
    const geo = mesh.geometry;
    const pos = geo.attributes.position;
    const index = geo.index;
    const mat = (
      Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
    ) as THREE.MeshStandardMaterial;
    const srgb = mat.color?.getRGB({ r: 0.7, g: 0.7, b: 0.7 }, THREE.SRGBColorSpace);
    const color: [number, number, number] = srgb ? [srgb.r, srgb.g, srgb.b] : [0.7, 0.7, 0.7];
    const im = mesh as THREE.InstancedMesh;
    const count = im.isInstancedMesh ? im.count : 1;
    const name = partName(o);
    if (!parts.has(name)) parts.set(name, { name, groups: [] });
    for (let i = 0; i < count; i++) {
      m.multiplyMatrices(inv, mesh.matrixWorld);
      if (im.isInstancedMesh) {
        im.getMatrixAt(i, inst);
        m.multiply(inst);
      }
      const det = m.determinant();
      if (Math.abs(det) < 1e-12) continue; // instancia oculta (escala 0)
      const positions = new Float32Array(pos.count * 3);
      for (let k = 0; k < pos.count; k++) {
        v.fromBufferAttribute(pos, k).applyMatrix4(m);
        positions[k * 3] = v.x;
        positions[k * 3 + 1] = v.y;
        positions[k * 3 + 2] = v.z;
      }
      const n = index ? index.count : pos.count;
      const all = new Uint32Array(n);
      for (let k = 0; k < n; k++) all[k] = index ? index.getX(k) : k;
      // Fuera los triángulos degenerados (dos vértices iguales): el 3MF no los admite.
      const keep: number[] = [];
      for (let k = 0; k + 2 < n; k += 3)
        if (all[k] !== all[k + 1] && all[k + 1] !== all[k + 2] && all[k] !== all[k + 2])
          keep.push(all[k], all[k + 1], all[k + 2]);
      const indices = Uint32Array.from(keep);
      // Una simetría invierte el sentido de los triángulos: se corrige para que las normales
      // sigan mirando hacia fuera.
      if (det < 0)
        for (let k = 0; k + 2 < indices.length; k += 3) {
          const t = indices[k + 1];
          indices[k + 1] = indices[k + 2];
          indices[k + 2] = t;
        }
      if (indices.length) parts.get(name)!.groups.push({ color, positions, indices });
    }
  });
  return [...parts.values()].filter((p) => p.groups.length);
}

export const exportTriangles = (parts: ExportPart[]) =>
  parts.reduce((s, p) => s + p.groups.reduce((t, g) => t + g.indices.length / 3, 0), 0);

/** STL binario (todas las piezas juntas). */
export function toStl(parts: ExportPart[], title = 'FluidLab 3D'): Uint8Array {
  const tris = exportTriangles(parts);
  const buf = new ArrayBuffer(84 + tris * 50);
  const dv = new DataView(buf);
  const header = new TextEncoder().encode(`${title} - mm, Y arriba`.slice(0, 79));
  new Uint8Array(buf, 0, 80).set(header);
  dv.setUint32(80, tris, true);
  let o = 84;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (const p of parts)
    for (const g of p.groups)
      for (let t = 0; t < g.indices.length; t += 3) {
        a.fromArray(g.positions, g.indices[t] * 3);
        b.fromArray(g.positions, g.indices[t + 1] * 3);
        c.fromArray(g.positions, g.indices[t + 2] * 3);
        const nrm = c.clone().sub(b).cross(a.clone().sub(b)).normalize();
        for (const vec of [nrm, a, b, c]) {
          dv.setFloat32(o, vec.x, true);
          dv.setFloat32(o + 4, vec.y, true);
          dv.setFloat32(o + 8, vec.z, true);
          o += 12;
        }
        dv.setUint16(o, 0, true);
        o += 2;
      }
  return new Uint8Array(buf);
}

const hex = (c: [number, number, number]) =>
  `#${c
    .map((x) =>
      Math.round(Math.max(0, Math.min(1, x)) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')
    .toUpperCase()}`;

const esc = (s: string) =>
  s.replace(/[<>&"]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[ch]!);

/** 3MF: un objeto por componente (con su etiqueta) y los colores de cada pieza. */
export function to3mf(parts: ExportPart[], title = 'FluidLab 3D'): Uint8Array {
  const colors: string[] = [];
  const colorIdx = new Map<string, number>();
  const ci = (c: [number, number, number]) => {
    const h = hex(c);
    if (!colorIdx.has(h)) {
      colorIdx.set(h, colors.length);
      colors.push(h);
    }
    return colorIdx.get(h)!;
  };
  const fmt = (x: number) => (Math.round(x * 1000) / 1000).toString();
  const objects: string[] = [];
  parts.forEach((p, i) => {
    const vs: string[] = [];
    const ts: string[] = [];
    let base = 0;
    for (const g of p.groups) {
      const k = ci(g.color);
      for (let j = 0; j < g.positions.length; j += 3)
        vs.push(
          `<vertex x="${fmt(g.positions[j])}" y="${fmt(g.positions[j + 1])}" z="${fmt(g.positions[j + 2])}"/>`,
        );
      for (let t = 0; t < g.indices.length; t += 3)
        ts.push(
          `<triangle v1="${g.indices[t] + base}" v2="${g.indices[t + 1] + base}" v3="${g.indices[t + 2] + base}" pid="1" p1="${k}"/>`,
        );
      base += g.positions.length / 3;
    }
    objects.push(
      `<object id="${i + 2}" name="${esc(p.name)}" type="model" pid="1" pindex="${ci(p.groups[0].color)}"><mesh><vertices>${vs.join('')}</vertices><triangles>${ts.join('')}</triangles></mesh></object>`,
    );
  });
  const model = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="es-ES" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
<metadata name="Title">${esc(title)}</metadata>
<metadata name="Application">FluidLab 3D</metadata>
<resources><basematerials id="1">${colors.map((c, i) => `<base name="Color ${i + 1}" displaycolor="${c}"/>`).join('')}</basematerials>
${objects.join('\n')}
</resources>
<build>${parts.map((_, i) => `<item objectid="${i + 2}"/>`).join('')}</build>
</model>`;
  const enc = new TextEncoder();
  return zipSync(
    {
      '[Content_Types].xml': enc.encode(
        '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>',
      ),
      '_rels/.rels': enc.encode(
        '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>',
      ),
      '3D/3dmodel.model': enc.encode(model),
    },
    { level: 6 },
  );
}

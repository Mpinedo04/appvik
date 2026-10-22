/** Acciones de la aplicación compartidas por la barra de herramientas y los atajos de teclado. */
import { canvasApi } from '../editor/canvasApi';
import {
  addComponent,
  extractSubcircuit,
  flipItems,
  pasteSubcircuit,
  removeItems,
  rotateItems,
} from '../core/model/edit';
import { renumber } from '../core/model/labels';
import type { Circuit, Project } from '../core/model/types';
import { parseProject, toProject, useProject } from '../store/project';
import { useSim } from '../store/sim';
import {
  openBinaryFile,
  openTextFile,
  saveFile as saveFileTo,
  type FileKind,
} from '../platform/files';
import { useView } from '../store/view';
import { sceneApi } from '../view3d/sceneApi';

const P = () => useProject.getState();
const editing = () => useSim.getState().status === 'stopped';

export function deleteSelection() {
  if (!editing()) return;
  const { comps, conns, junctions } = P().selection;
  if (!comps.length && !conns.length && !junctions.length) return;
  P().commit((d) => removeItems(d as Circuit, comps, conns, junctions));
  P().clearSelection();
}

export function rotateSelection() {
  if (!editing() || !P().selection.comps.length) return;
  P().commit((d) => rotateItems(d as Circuit, P().selection.comps));
}

export function flipSelection() {
  if (!editing() || !P().selection.comps.length) return;
  P().commit((d) => flipItems(d as Circuit, P().selection.comps));
}

export function copySelection() {
  const { comps } = P().selection;
  if (!comps.length) return;
  P().setClipboard(extractSubcircuit(P().circuit, comps));
}

export function cutSelection() {
  copySelection();
  deleteSelection();
}

export function paste() {
  const clip = P().clipboard;
  if (!editing() || !clip) return;
  let ids: string[] = [];
  P().commit((d) => {
    ids = pasteSubcircuit(d as Circuit, clip, 40, 40);
  });
  P().select({ comps: ids });
  // Pegados sucesivos se van desplazando.
  P().setClipboard({
    ...clip,
    components: Object.fromEntries(
      Object.entries(clip.components).map(([k, c]) => [k, { ...c, x: c.x + 40, y: c.y + 40 }]),
    ),
    connections: Object.fromEntries(
      Object.entries(clip.connections).map(([k, w]) => [
        k,
        { ...w, points: w.points.map((p) => ({ x: p.x + 40, y: p.y + 40 })) },
      ]),
    ),
  });
}

export function renumberAll() {
  if (!editing()) return;
  P().commit((d) => renumber(d as Circuit));
  P().notify('Componentes renumerados según la norma (1A, 1V1, 1S1…).');
}

export function selectAll() {
  const c = P().circuit;
  P().select({
    comps: Object.keys(c.components),
    conns: Object.keys(c.connections),
    junctions: Object.keys(c.junctions),
  });
}

export function newProject() {
  useSim.getState().stop();
  if (
    Object.keys(P().circuit.components).length &&
    !confirm('¿Descartar el circuito actual y empezar uno nuevo?')
  )
    return;
  P().newProject();
}

export function loadProject(p: Project) {
  useSim.getState().stop();
  P().load(p);
  requestAnimationFrame(() => canvasApi.fit());
}

const PROJECT_FILE: FileKind = {
  label: 'Proyecto FluidLab',
  ext: 'json',
  mime: 'application/json',
};

export async function openFile() {
  try {
    const f = await openTextFile(PROJECT_FILE);
    if (!f) return;
    loadProject(parseProject(f.text));
    P().notify(`Abierto «${f.name}».`);
  } catch (e) {
    P().notify(`No se pudo abrir: ${(e as Error).message}`);
  }
}

const fileBase = () =>
  P()
    .name.trim()
    .replace(/[\\/:*?"<>|]+/g, '_') || 'circuito';

export async function saveFile() {
  try {
    const ok = await saveFileTo(
      `${fileBase()}.fluidlab.json`,
      JSON.stringify(toProject(), null, 2),
      PROJECT_FILE,
    );
    if (ok) P().notify('Proyecto guardado.');
  } catch (e) {
    P().notify(`No se pudo guardar: ${(e as Error).message}`);
  }
}

/** PDF con el esquema, el GRAFCET / esquema de contactos y la lista de componentes. */
export async function exportPdf() {
  if (!Object.keys(P().circuit.components).length) return;
  P().notify('Generando el PDF…');
  try {
    const { buildPdf } = await import('./pdf');
    const bytes = await buildPdf(toProject());
    const ok = await saveFileTo(`${fileBase()}.pdf`, bytes, {
      label: 'Documento PDF',
      ext: 'pdf',
      mime: 'application/pdf',
    });
    if (ok) P().notify('PDF exportado.');
  } catch (e) {
    P().notify(`No se pudo exportar: ${(e as Error).message}`);
  }
}

export async function exportPng() {
  const svg = canvasApi.svg();
  const content = svg?.querySelector('g.content') as SVGGElement | null;
  if (!svg || !content || !Object.keys(P().circuit.components).length) return;
  const bb = content.getBBox();
  const pad = 20;
  const clone = content.cloneNode(true) as SVGGElement;
  clone.querySelectorAll('.no-export').forEach((n) => n.remove());
  const w = bb.width + 2 * pad;
  const h = bb.height + 2 * pad;
  const scale = 3;
  const xml = `<svg xmlns="http://www.w3.org/2000/svg" width="${w * scale}" height="${h * scale}" viewBox="${bb.x - pad} ${bb.y - pad} ${w} ${h}"><rect x="${bb.x - pad}" y="${bb.y - pad}" width="${w}" height="${h}" fill="#fff"/>${new XMLSerializer().serializeToString(clone)}</svg>`;
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = w * scale;
  canvas.height = h * scale;
  canvas.getContext('2d')!.drawImage(img, 0, 0);
  canvas.toBlob(async (b) => {
    if (!b) return;
    await saveFileTo(`${fileBase()}.png`, new Uint8Array(await b.arrayBuffer()), {
      label: 'Imagen PNG',
      ext: 'png',
      mime: 'image/png',
    });
  }, 'image/png');
}

// ---------- Intercambio con CAD (SolidWorks y otros) ----------

const CAD_FILE = {
  label: 'Pieza CAD (STEP, IGES, STL, OBJ, 3MF, VRML, glTF, PLY)',
  exts: ['step', 'stp', 'iges', 'igs', 'stl', 'obj', '3mf', 'wrl', 'glb', 'gltf', 'ply'],
};

/** Importa una pieza o conjunto de CAD y la coloca en el centro del esquema. */
export async function importCadPart() {
  if (!editing()) return;
  try {
    const f = await openBinaryFile(CAD_FILE);
    if (!f) return;
    const { importCad, extOf } = await import('../cad/import');
    const { encodeMesh, extents } = await import('../cad/mesh');
    const step = ['step', 'stp', 'iges', 'igs'].includes(extOf(f.name));
    P().notify(
      step
        ? `Leyendo «${f.name}» con OpenCascade… (la primera vez descarga el lector, unos 8 MB)`
        : `Leyendo «${f.name}»…`,
    );
    const r = await importCad(f.name, f.bytes);
    const e = extents(r.mesh);
    const mesh = await encodeMesh(r.mesh);
    const c = canvasApi.centerWorld();
    let id = '';
    P().commit((d) => {
      id = addComponent(d as Circuit, 'cad-part', c.x, c.y, {
        file: f.name,
        mesh,
        ext: [...e.min, ...e.max].map((v) => Math.round(v * 1e4) / 1e4).join(','),
        tris: r.triangles,
        unit: r.unit,
      });
    });
    P().select({ comps: [id] });
    if (useView.getState().layout === '2d') useView.getState().setLayout('split');
    const unitNote = r.unitKnown
      ? ''
      : ` Unidades estimadas: ${r.unit}; si no cuadra el tamaño, cámbialas en Propiedades.`;
    P().notify(
      `Importada «${f.name}» (${r.triangles.toLocaleString('es-ES')} triángulos).${unitNote}`,
    );
  } catch (err) {
    P().notify(`No se pudo importar: ${(err as Error).message}`);
  }
}

/** Esquema 2D a DXF (para abrirlo en SolidWorks como dibujo o boceto). */
export async function exportDxf() {
  if (!Object.keys(P().circuit.components).length) return;
  try {
    const { circuitToDxf } = await import('../cad/dxfCircuit');
    const ok = await saveFileTo(`${fileBase()}.dxf`, circuitToDxf(P().circuit), {
      label: 'Dibujo DXF',
      ext: 'dxf',
      mime: 'image/vnd.dxf',
    });
    if (ok) P().notify('Esquema exportado a DXF (escala 1 unidad = 0,5 mm; ábrelo en milímetros).');
  } catch (e) {
    P().notify(`No se pudo exportar: ${(e as Error).message}`);
  }
}

/** Espera a que la vista 3D esté montada (la abre en vista dividida si hace falta). */
async function sceneRoot() {
  if (useView.getState().sheet !== 'circuit') useView.getState().setSheet('circuit');
  if (useView.getState().layout === '2d') useView.getState().setLayout('split');
  for (let i = 0; i < 100 && !sceneApi.root(); i++) await new Promise((r) => setTimeout(r, 100));
  const root = sceneApi.root();
  // Unos fotogramas más para que terminen de cargarse las piezas CAD.
  if (root) await new Promise((r) => setTimeout(r, 600));
  return root;
}

/** Modelo 3D (todo o sólo lo seleccionado) a STL o 3MF, en milímetros con Y arriba. */
export async function exportCad3d(format: 'stl' | '3mf') {
  if (!Object.keys(P().circuit.components).length) return;
  try {
    P().notify('Preparando el modelo 3D…');
    const root = await sceneRoot();
    if (!root) throw new Error('la vista 3D no se ha podido abrir.');
    const { collectScene, exportTriangles, to3mf, toStl } = await import('../cad/export3d');
    const sel = new Set(P().selection.comps);
    const parts = collectScene(root, (id) => (sel.size ? !!id && sel.has(id) : true));
    if (!parts.length) throw new Error('no hay nada que exportar.');
    const tris = exportTriangles(parts);
    const bytes = format === 'stl' ? toStl(parts, P().name) : to3mf(parts, P().name);
    const ok = await saveFileTo(
      `${fileBase()}.${format}`,
      bytes,
      format === 'stl'
        ? { label: 'Malla STL', ext: 'stl', mime: 'model/stl' }
        : { label: 'Modelo 3MF', ext: '3mf', mime: 'model/3mf' },
    );
    if (ok)
      P().notify(
        `${sel.size ? 'Selección exportada' : 'Modelo exportado'} (${tris.toLocaleString('es-ES')} triángulos, mm).` +
          (tris > 500000
            ? ' SolidWorks sólo lo abrirá como «cuerpo gráfico» (más de 500 000 triángulos).'
            : ''),
      );
  } catch (e) {
    P().notify(`No se pudo exportar: ${(e as Error).message}`);
  }
}

// ---------- Autoguardado ----------
const AUTOSAVE_KEY = 'fluidlab3d.autosave';

export function restoreAutosave(): boolean {
  try {
    const text = localStorage.getItem(AUTOSAVE_KEY);
    if (!text) return false;
    P().load(parseProject(text));
    return true;
  } catch {
    return false;
  }
}

export function startAutosave() {
  let timer = 0;
  let warned = false;
  return useProject.subscribe((s, prev) => {
    if (s.circuit === prev.circuit && s.name === prev.name) return;
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      try {
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(toProject()));
        warned = false;
      } catch {
        // Almacenamiento no disponible o lleno (piezas CAD muy grandes): se avisa una vez.
        if (!warned && Object.values(s.circuit.components).some((c) => c.type === 'cad-part'))
          P().notify(
            'El proyecto no cabe en el autoguardado del navegador (piezas CAD grandes): guárdalo con Ctrl+S.',
          );
        warned = true;
      }
    }, 500);
  });
}

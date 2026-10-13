/** Acciones de la aplicación compartidas por la barra de herramientas y los atajos de teclado. */
import { canvasApi } from '../editor/canvasApi';
import {
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

export function openFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,.fluidlab.json,application/json';
  input.onchange = async () => {
    const f = input.files?.[0];
    if (!f) return;
    try {
      loadProject(parseProject(await f.text()));
      P().notify(`Abierto «${f.name}».`);
    } catch (e) {
      P().notify(`No se pudo abrir: ${(e as Error).message}`);
    }
  };
  input.click();
}

function download(name: string, blob: Blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const fileBase = () =>
  P()
    .name.trim()
    .replace(/[\\/:*?"<>|]+/g, '_') || 'circuito';

export function saveFile() {
  download(
    `${fileBase()}.fluidlab.json`,
    new Blob([JSON.stringify(toProject(), null, 2)], { type: 'application/json' }),
  );
  P().notify('Proyecto guardado.');
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
  canvas.toBlob((b) => b && download(`${fileBase()}.png`, b), 'image/png');
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
  return useProject.subscribe((s, prev) => {
    if (s.circuit === prev.circuit && s.name === prev.name) return;
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      try {
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(toProject()));
      } catch {
        /* almacenamiento no disponible: se ignora */
      }
    }, 500);
  });
}

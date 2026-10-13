/**
 * Store del proyecto: circuito + historial (deshacer/rehacer) + selección.
 * El historial guarda instantáneas inmutables del circuito; Immer comparte la estructura
 * no modificada, así que cada entrada cuesta muy poco.
 */
import { produce, type Draft } from 'immer';
import { create } from 'zustand';
import {
  emptyCircuit,
  PROJECT_FORMAT,
  PROJECT_VERSION,
  type Circuit,
  type Project,
} from '../core/model/types';
import { hasModel } from '../core/registry';

const HISTORY_LIMIT = 200;

export interface Selection {
  comps: string[];
  conns: string[];
  junctions: string[];
}

const emptySel = (): Selection => ({ comps: [], conns: [], junctions: [] });

interface ProjectStore {
  name: string;
  circuit: Circuit;
  past: Circuit[];
  future: Circuit[];
  selection: Selection;
  /** Circuito al empezar una operación continua (arrastre). */
  txBase: Circuit | null;
  clipboard: Circuit | null;
  /** Mensaje breve para la barra de estado. */
  toast: string | null;

  commit(recipe: (c: Draft<Circuit>) => void): void;
  beginTx(): void;
  updateTx(recipe: (c: Draft<Circuit>, base: Circuit) => void): void;
  endTx(): void;
  undo(): void;
  redo(): void;
  select(sel: Partial<Selection>, additive?: boolean): void;
  clearSelection(): void;
  setName(name: string): void;
  load(p: Project): void;
  newProject(): void;
  setClipboard(c: Circuit | null): void;
  notify(msg: string | null): void;
}

export const useProject = create<ProjectStore>((set, get) => ({
  name: 'Circuito sin título',
  circuit: emptyCircuit(),
  past: [],
  future: [],
  selection: emptySel(),
  txBase: null,
  clipboard: null,
  toast: null,

  commit(recipe) {
    const { circuit, past } = get();
    const next = produce(circuit, recipe);
    if (next === circuit) return;
    set({
      circuit: next,
      past: [...past, circuit].slice(-HISTORY_LIMIT),
      future: [],
      selection: pruneSelection(get().selection, next),
    });
  },
  beginTx() {
    set({ txBase: get().circuit });
  },
  updateTx(recipe) {
    const base = get().txBase;
    if (!base) return;
    set({ circuit: produce(base, (d) => recipe(d, base)) });
  },
  endTx() {
    const { txBase, circuit, past } = get();
    if (txBase && txBase !== circuit)
      set({ past: [...past, txBase].slice(-HISTORY_LIMIT), future: [] });
    set({ txBase: null });
  },
  undo() {
    const { past, future, circuit } = get();
    if (!past.length) return;
    const prev = past[past.length - 1];
    set({
      circuit: prev,
      past: past.slice(0, -1),
      future: [circuit, ...future],
      selection: pruneSelection(get().selection, prev),
    });
  },
  redo() {
    const { past, future, circuit } = get();
    if (!future.length) return;
    const next = future[0];
    set({
      circuit: next,
      past: [...past, circuit],
      future: future.slice(1),
      selection: pruneSelection(get().selection, next),
    });
  },
  select(sel, additive = false) {
    const cur = get().selection;
    if (!additive) {
      set({ selection: { ...emptySel(), ...sel } });
      return;
    }
    const toggle = (a: string[], b: string[] = []) => {
      const s = new Set(a);
      for (const x of b) {
        if (s.has(x)) s.delete(x);
        else s.add(x);
      }
      return [...s];
    };
    set({
      selection: {
        comps: toggle(cur.comps, sel.comps),
        conns: toggle(cur.conns, sel.conns),
        junctions: toggle(cur.junctions, sel.junctions),
      },
    });
  },
  clearSelection() {
    set({ selection: emptySel() });
  },
  setName(name) {
    set({ name });
  },
  load(p) {
    set({ name: p.name, circuit: p.circuit, past: [], future: [], selection: emptySel() });
  },
  newProject() {
    set({
      name: 'Circuito sin título',
      circuit: emptyCircuit(),
      past: [],
      future: [],
      selection: emptySel(),
    });
  },
  setClipboard(c) {
    set({ clipboard: c });
  },
  notify(msg) {
    set({ toast: msg });
  },
}));

function pruneSelection(sel: Selection, c: Circuit): Selection {
  return {
    comps: sel.comps.filter((id) => c.components[id]),
    conns: sel.conns.filter((id) => c.connections[id]),
    junctions: sel.junctions.filter((id) => c.junctions[id]),
  };
}

export function toProject(): Project {
  const { name, circuit } = useProject.getState();
  return { format: PROJECT_FORMAT, version: PROJECT_VERSION, name, circuit };
}

/** Valida y migra un proyecto leído de un archivo. */
export function parseProject(text: string): Project {
  const data = JSON.parse(text);
  if (data?.format !== PROJECT_FORMAT)
    throw new Error('El archivo no es un proyecto de FluidLab 3D.');
  if (typeof data.version !== 'number' || data.version > PROJECT_VERSION)
    throw new Error('El proyecto se creó con una versión más reciente de la aplicación.');
  const c = data.circuit as Circuit;
  if (!c || typeof c.components !== 'object' || typeof c.connections !== 'object')
    throw new Error('Proyecto dañado.');
  c.junctions ??= {};
  for (const comp of Object.values(c.components)) {
    if (!hasModel(comp.type)) throw new Error(`Componente desconocido en el archivo: ${comp.type}`);
  }
  return {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    name: String(data.name ?? 'Circuito'),
    circuit: c,
  };
}

/** Preferencias de visualización: 2D / 3D / dividida y modo de render 3D. */
import { create } from 'zustand';

export type Layout = '2d' | '3d' | 'split';
export type Render3D = 'normal' | 'xray' | 'cut';
/** Cómo se dibujan las válvulas de vías en 3D: corredera real o cámaras del símbolo ISO. */
export type ValveStyle = 'real' | 'iso';

export const RENDER_LABELS: Record<Render3D, string> = {
  normal: 'Normal',
  xray: 'Rayos X',
  cut: 'Corte',
};

interface ViewStore {
  layout: Layout;
  render3d: Render3D;
  /** Modo particular de algunos componentes (si no, se usa el global). */
  perComp: Record<string, Render3D>;
  /** Altura del plano de corte relativa al eje de las piezas (unidades de dibujo). */
  cutOffset: number;
  /** Anchura del panel 2D en la vista dividida (fracción). */
  split: number;
  /** Mostrar etiquetas (1A, 1V1…) en la vista 3D. */
  labels: boolean;
  /** Panel de diagramas abierto. */
  diagrams: boolean;
  valveStyle: ValveStyle;
  setLayout(l: Layout): void;
  setRender(r: Render3D): void;
  setCompRender(id: string, r: Render3D | null): void;
  setCutOffset(v: number): void;
  setSplit(v: number): void;
  setLabels(v: boolean): void;
  setDiagrams(v: boolean): void;
  setValveStyle(v: ValveStyle): void;
}

const KEY = 'fluidlab3d.view';

function load(): Partial<ViewStore> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
}

export const useView = create<ViewStore>((set, get) => {
  const saved = load();
  const persist = () => {
    try {
      const { layout, render3d, split, labels, valveStyle } = get();
      localStorage.setItem(KEY, JSON.stringify({ layout, render3d, split, labels, valveStyle }));
    } catch {
      /* sin almacenamiento */
    }
  };
  return {
    layout: saved.layout ?? '2d',
    render3d: saved.render3d ?? 'normal',
    perComp: {},
    cutOffset: 0,
    split: saved.split ?? 0.5,
    labels: saved.labels ?? true,
    diagrams: false,
    valveStyle: saved.valveStyle ?? 'real',
    setLayout(layout) {
      set({ layout });
      persist();
    },
    setRender(render3d) {
      set({ render3d });
      persist();
    },
    setCompRender(id, r) {
      const perComp = { ...get().perComp };
      if (r) perComp[id] = r;
      else delete perComp[id];
      set({ perComp });
    },
    setCutOffset(cutOffset) {
      set({ cutOffset });
    },
    setSplit(split) {
      set({ split: Math.min(0.8, Math.max(0.2, split)) });
      persist();
    },
    setLabels(labels) {
      set({ labels });
      persist();
    },
    setDiagrams(diagrams) {
      set({ diagrams });
    },
    setValveStyle(valveStyle) {
      set({ valveStyle });
      persist();
    },
  };
});

export function renderModeOf(id: string): Render3D {
  const { perComp, render3d } = useView.getState();
  return perComp[id] ?? render3d;
}

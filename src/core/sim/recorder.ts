/**
 * Grabador de la simulación para los diagramas espacio-tiempo y espacio-fase.
 * Muestrea a intervalos fijos de tiempo simulado (5 ms por defecto) en un búfer circular.
 */
import type { Circuit } from '../model/types';
import { getModel } from '../registry';

export type SeriesKind = 'actuator' | 'valve' | 'gauge' | 'electric';

/** Componentes eléctricos que aparecen en el diagrama (bobinas, relés, contadores, lámparas). */
const ELECTRIC_SERIES = new Set([
  'elec-relay',
  'elec-relay-timer',
  'elec-counter',
  'elec-solenoid',
  'elec-lamp',
]);

export interface SeriesInfo {
  id: string;
  label: string;
  kind: SeriesKind;
  /** Unidad de los valores (%, estado, bar). */
  unit: string;
}

export interface Recording {
  t: number[];
  series: SeriesInfo[];
  /** values[i][k]: valor de la serie i en la muestra k */
  values: number[][];
}

/** Valor que se registra de cada componente a partir de su estado. */
function sampleValue(kind: SeriesKind, state: any): number {
  if (kind === 'actuator') return (state?.pos ?? 0) * 100;
  if (kind === 'gauge') return state?.bar ?? 0;
  if (kind === 'electric') return state?.on ? 1 : 0;
  // Válvula: 1 = casilla izquierda (accionada), 0 = derecha; en las de 3 posiciones, 0,5 = centro.
  if (typeof state?.pos === 'number') return state.pos;
  return 0;
}

export class Recorder {
  readonly series: SeriesInfo[] = [];
  private t: number[] = [];
  private values: number[][] = [];
  private next = 0;
  /** Normalización de la posición de cada válvula a 1 = izquierda … 0 = derecha. */
  private boxes: number[] = [];

  constructor(
    circuit: Circuit,
    readonly interval = 0.005,
    readonly maxSamples = 12_000,
  ) {
    const comps = Object.values(circuit.components).sort((a, b) =>
      a.label.localeCompare(b.label, 'es', { numeric: true }),
    );
    for (const c of comps) {
      const m = getModel(c.type);
      let kind: SeriesKind | null = null;
      if (m.category === 'actuators') kind = 'actuator';
      else if (
        m.category === 'directional' ||
        m.category === 'sensors' ||
        c.type === 'pneu-timer' ||
        c.type === 'pneu-sequence'
      )
        kind = 'valve';
      else if (c.type === 'pneu-gauge') kind = 'gauge';
      else if (ELECTRIC_SERIES.has(c.type)) kind = 'electric';
      if (!kind) continue;
      this.series.push({
        id: c.id,
        label: c.label,
        kind,
        unit: kind === 'actuator' ? '%' : kind === 'gauge' ? 'bar' : '',
      });
      this.values.push([]);
      // Nº de casillas: lo deduce la posición de reposo de la primera muestra (1 en 2 y 3 posiciones).
      this.boxes.push(c.type.includes('-53-') || c.type.includes('-43-') ? 3 : 2);
    }
    // Etapas del GRAFCET (activa = 1).
    const steps = Object.values(circuit.grafcet?.steps ?? {}).sort((a, b) => a.n - b.n);
    for (const st of steps) {
      this.series.push({ id: `grafcet:${st.id}`, label: `X${st.n}`, kind: 'electric', unit: '' });
      this.values.push([]);
      this.boxes.push(2);
    }
  }

  /** Llamado por el motor tras cada paso. */
  maybeSample(t: number, stateOf: (id: string) => any) {
    if (t + 1e-9 < this.next) return;
    this.next = t + this.interval;
    this.t.push(t);
    this.series.forEach((s, i) => {
      let v = sampleValue(s.kind, stateOf(s.id));
      if (s.kind === 'valve') v = 1 - v / (this.boxes[i] - 1);
      this.values[i].push(v);
    });
    if (this.t.length > this.maxSamples) {
      this.t.shift();
      for (const arr of this.values) arr.shift();
    }
  }

  get length() {
    return this.t.length;
  }

  data(): Recording {
    return {
      t: this.t.slice(),
      series: this.series.slice(),
      values: this.values.map((v) => v.slice()),
    };
  }

  toCSV(): string {
    const head = ['t [s]', ...this.series.map((s) => `${s.label}${s.unit ? ` [${s.unit}]` : ''}`)];
    const rows = this.t.map((t, k) =>
      [t.toFixed(4), ...this.values.map((v) => v[k].toFixed(3))].join(';'),
    );
    return [head.join(';'), ...rows].join('\n');
  }
}

export interface Step {
  /** Tiempos de inicio y fin del paso [s] */
  t0: number;
  t1: number;
  /** Movimientos del paso, p. ej. ["1A+", "2A−"] */
  moves: string[];
}

export interface PhaseDiagram {
  actuators: SeriesInfo[];
  steps: Step[];
  /** positions[a][k]: posición (0..1) del actuador a en el límite k (k = 0..steps.length) */
  positions: number[][];
}

/**
 * Diagrama espacio-fase: divide la grabación en pasos, que son los intervalos en los que el
 * conjunto de actuadores en movimiento es el mismo. Los tiempos muertos sin movimiento se
 * descartan y los movimientos insignificantes (rebotes) se ignoran.
 */
export function phaseDiagram(rec: Recording, minTravel = 0.05): PhaseDiagram {
  const idx = rec.series.map((s, i) => (s.kind === 'actuator' ? i : -1)).filter((i) => i >= 0);
  const actuators = idx.map((i) => rec.series[i]);
  const pos = idx.map((i) => rec.values[i].map((v) => v / 100));
  const n = rec.t.length;
  const EPS = 0.002;
  // Dirección de movimiento de cada actuador en cada muestra (+1, −1, 0).
  const dir = (a: number, k: number) => {
    if (k === 0) return 0;
    const d = pos[a][k] - pos[a][k - 1];
    return d > EPS ? 1 : d < -EPS ? -1 : 0;
  };
  const steps: Step[] = [];
  const positions: number[][] = actuators.map(() => []);
  let start = -1;
  let key = '';
  const close = (k: number) => {
    if (start < 0) return;
    const moved = actuators
      .map((s, a) => ({ a, d: pos[a][k] - pos[a][start] }))
      .filter((m) => Math.abs(m.d) >= minTravel);
    if (moved.length) {
      if (!steps.length) actuators.forEach((_, a) => positions[a].push(pos[a][start]));
      steps.push({
        t0: rec.t[start],
        t1: rec.t[k],
        moves: moved.map((m) => `${actuators[m.a].label}${m.d > 0 ? '+' : '−'}`),
      });
      actuators.forEach((_, a) => positions[a].push(pos[a][k]));
    }
    start = -1;
    key = '';
  };
  for (let k = 1; k < n; k++) {
    const dirs = actuators.map((_, a) => dir(a, k));
    const kk = dirs.join(',');
    const moving = dirs.some((d) => d !== 0);
    if (!moving) {
      close(k - 1);
      continue;
    }
    if (kk !== key) {
      close(k - 1);
      start = k - 1;
      key = kk;
    }
  }
  close(n - 1);
  // Fusiona pasos consecutivos con el mismo movimiento (aceleraciones/frenadas parciales).
  const merged: Step[] = [];
  const mergedPos: number[][] = actuators.map((_, a) =>
    positions[a].length ? [positions[a][0]] : [],
  );
  steps.forEach((s, i) => {
    const last = merged[merged.length - 1];
    if (last && last.moves.join() === s.moves.join()) {
      last.t1 = s.t1;
      actuators.forEach((_, a) => (mergedPos[a][mergedPos[a].length - 1] = positions[a][i + 1]));
    } else {
      merged.push({ ...s });
      actuators.forEach((_, a) => mergedPos[a].push(positions[a][i + 1]));
    }
  });
  return { actuators, steps: merged, positions: mergedPos };
}

/** Store de simulación: controla el motor y publica una instantánea por fotograma. */
import { create } from 'zustand';
import { num } from '../core/registry';
import { Simulation, type SimSnapshot } from '../core/sim/engine';
import { useProject } from './project';

export type SimStatus = 'stopped' | 'running' | 'paused';

export const SPEEDS = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2];
/** Avance del botón «paso a paso» [s de tiempo simulado]. */
export const STEP_SECONDS = 0.005;

interface SimStore {
  status: SimStatus;
  speed: number;
  snapshot: SimSnapshot | null;
  /** Presión máxima de la instalación (escala de colores). */
  maxBar: number;
  error: string | null;
  start(): void;
  pause(): void;
  stop(): void;
  stepOnce(): void;
  setSpeed(s: number): void;
  press(compId: string, side?: 'left' | 'right'): void;
  release(compId: string): void;
}

let sim: Simulation | null = null;
let raf = 0;
let last = 0;

export function currentSimulation() {
  return sim;
}

export const useSim = create<SimStore>((set, get) => {
  const publish = () => set({ snapshot: sim ? sim.snapshot() : null });

  const loop = (now: number) => {
    if (!sim || get().status !== 'running') return;
    const realDt = Math.min(0.05, (now - last) / 1000);
    last = now;
    sim.advance(realDt * get().speed);
    publish();
    raf = requestAnimationFrame(loop);
  };

  const ensureSim = () => {
    if (sim) return true;
    try {
      const circuit = useProject.getState().circuit;
      sim = new Simulation(circuit);
      const supplies = Object.values(circuit.components).filter((c) => c.type === 'pneu-supply');
      const maxBar = Math.max(
        1,
        ...supplies.map((c) => (c.params.pressure === undefined ? 6 : num(c.params, 'pressure'))),
      );
      set({ maxBar, error: null });
      return true;
    } catch (e) {
      set({ error: (e as Error).message });
      return false;
    }
  };

  return {
    status: 'stopped',
    speed: 1,
    snapshot: null,
    maxBar: 6,
    error: null,
    start() {
      if (get().status === 'running' || !ensureSim()) return;
      useProject.getState().clearSelection();
      set({ status: 'running' });
      publish();
      last = performance.now();
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(loop);
    },
    pause() {
      if (get().status !== 'running') return;
      cancelAnimationFrame(raf);
      set({ status: 'paused' });
    },
    stop() {
      cancelAnimationFrame(raf);
      sim = null;
      set({ status: 'stopped', snapshot: null });
    },
    stepOnce() {
      if (get().status === 'running') get().pause();
      if (!ensureSim()) return;
      if (get().status === 'stopped') set({ status: 'paused' });
      sim!.advance(STEP_SECONDS);
      publish();
    },
    setSpeed(speed) {
      set({ speed });
    },
    press(id, side) {
      sim?.userAction(id, 'press', side);
      if (get().status === 'paused') {
        sim?.advance(0);
        publish();
      }
    },
    release(id) {
      sim?.userAction(id, 'release');
    },
  };
});

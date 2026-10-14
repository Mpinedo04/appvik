/**
 * Ejecución de un esquema de contactos como en un PLC: en cada ciclo se leen las entradas, se
 * evalúan los segmentos de arriba abajo (cada uno ve lo que han escrito los anteriores) y se
 * escriben las salidas. Variables internas: marcas M…, temporizadores T… (TON / TOF, el bit
 * vale 1 al terminar) y contadores C… (CTU, el bit vale 1 al llegar a la preselección; una
 * bobina R sobre el contador lo pone a cero).
 */
import type { Ladder } from '../model/types';
import { evalExpr, parseExpr, type Expr } from './expr';
import type { ControlIO } from './grafcet';

interface CompiledRung {
  id: string;
  expr: Expr | null;
  error: string | null;
  coil: Ladder['rungs'][number]['coil'];
}

export interface LadderState {
  /** Valor de cada variable escrita o leída en el último ciclo. */
  vars: Record<string, number>;
  /** Resultado (conduce o no) de cada segmento. */
  rungs: Record<string, boolean>;
  /** Tiempo/cuenta actual de temporizadores y contadores. */
  acc: Record<string, number>;
}

export class LadderRuntime {
  private rungs: CompiledRung[];
  /** Bobinas y marcas que conservan su valor entre ciclos. */
  private mem = new Map<string, boolean>();
  private timers = new Map<string, { acc: number; done: boolean; prevIn: boolean }>();
  private counters = new Map<string, { n: number; prevIn: boolean; preset: number }>();
  private prev = new Map<string, boolean>();

  constructor(l: Ladder) {
    this.rungs = l.rungs.map((r) => {
      try {
        return { id: r.id, expr: parseExpr(r.cond || ''), error: null, coil: r.coil };
      } catch (e) {
        return { id: r.id, expr: null, error: (e as Error).message, coil: r.coil };
      }
    });
  }

  errors() {
    return this.rungs.filter((r) => r.error).map((r) => ({ id: r.id, message: r.error! }));
  }

  private read(name: string, io: ControlIO): boolean {
    const t = this.timers.get(name);
    if (t) return t.done;
    const c = this.counters.get(name);
    if (c) return c.n >= c.preset;
    if (this.mem.has(name)) return this.mem.get(name)!;
    return io.read(name);
  }

  cycle(dt: number, io: ControlIO): LadderState {
    const vars: Record<string, number> = {};
    const rungs: Record<string, boolean> = {};
    const env = {
      value: (name: string) => {
        const v = this.read(name, io);
        vars[name] = v ? 1 : 0;
        return v;
      },
      edge: (name: string, up: boolean) => {
        const cur = this.read(name, io);
        const before = this.prev.get(name) ?? cur;
        this.prev.set(name, cur);
        return up ? cur && !before : !cur && before;
      },
      stepTime: () => -1,
    };
    for (const r of this.rungs) {
      const on = r.expr ? evalExpr(r.expr, env) : false;
      rungs[r.id] = on;
      const { kind, target, preset = 1 } = r.coil;
      if (!target) continue;
      switch (kind) {
        case 'coil':
          this.mem.set(target, on);
          break;
        case 'set':
          if (on) this.mem.set(target, true);
          else if (!this.mem.has(target)) this.mem.set(target, false);
          break;
        case 'reset':
          if (on) {
            const c = this.counters.get(target);
            if (c) c.n = 0;
            const t = this.timers.get(target);
            if (t) Object.assign(t, { acc: 0, done: false });
            if (!c && !t) this.mem.set(target, false);
          }
          break;
        case 'TON': {
          const t = this.timers.get(target) ?? { acc: 0, done: false, prevIn: false };
          if (on) t.acc = Math.min(preset, t.acc + dt);
          else t.acc = 0;
          t.done = on && t.acc >= preset;
          this.timers.set(target, t);
          break;
        }
        case 'TOF': {
          const t = this.timers.get(target) ?? { acc: 0, done: false, prevIn: false };
          if (on) {
            t.acc = 0;
            t.done = true;
          } else if (t.done) {
            t.acc += dt;
            if (t.acc >= preset) t.done = false;
          }
          this.timers.set(target, t);
          break;
        }
        case 'CTU': {
          const c = this.counters.get(target) ?? { n: 0, prevIn: false, preset };
          c.preset = preset;
          if (on && !c.prevIn) c.n++;
          c.prevIn = on;
          this.counters.set(target, c);
          break;
        }
      }
    }
    // Salidas: todas las bobinas a 1 que no son internas (Q…, Y…, K…).
    for (const [name, v] of this.mem) {
      vars[name] = v ? 1 : 0;
      if (v && !/^M\d/.test(name)) io.write(name);
    }
    const acc: Record<string, number> = {};
    for (const [k, t] of this.timers) {
      acc[k] = t.acc;
      vars[k] = t.done ? 1 : 0;
    }
    for (const [k, c] of this.counters) {
      acc[k] = c.n;
      vars[k] = c.n >= c.preset ? 1 : 0;
    }
    return { vars, rungs, acc };
  }
}

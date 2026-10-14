/**
 * Intérprete de GRAFCET (IEC 60848) con las reglas de evolución:
 *  1. Situación inicial: las etapas iniciales activas.
 *  2. Una transición está validada si todas sus etapas anteriores están activas, y es
 *     franqueable si además su receptividad es verdadera.
 *  3. Al franquearla se desactivan las etapas anteriores y se activan las posteriores.
 *  4. Todas las transiciones franqueables a la vez se franquean a la vez.
 *  5. Si una etapa se activa y desactiva a la vez, queda activa.
 * Tras cada franqueo se vuelve a evaluar (evolución fugaz) hasta una situación estable.
 */
import type { Grafcet, GrafcetAction } from '../model/types';
import { evalExpr, exprVars, parseExpr, type Expr, type ExprEnv } from './expr';

export interface ControlIO {
  read(name: string): boolean;
  /** Las salidas sólo se escriben a 1 (lo que no se escribe en un ciclo vale 0). */
  write(name: string): void;
}

interface CompiledTransition {
  id: string;
  before: string[];
  after: string[];
  expr: Expr | null;
  error: string | null;
}

export interface GrafcetState {
  /** Ids de las etapas activas. */
  active: string[];
  /** Transiciones franqueables en el último ciclo. */
  firable: string[];
  /** Contadores de las acciones CU. */
  counters: Record<string, number>;
}

export class GrafcetRuntime {
  private steps: Grafcet['steps'];
  private trans: CompiledTransition[];
  private active = new Set<string>();
  /** Tiempo de activación de cada etapa activa. */
  private since = new Map<string, number>();
  /** Salidas memorizadas (acciones S/R). */
  private latched = new Set<string>();
  private counters = new Map<string, { n: number; preset: number }>();
  private prev = new Map<string, boolean>();
  private watched: string[];
  private byNumber = new Map<number, string>();
  firable: string[] = [];

  constructor(g: Grafcet) {
    this.steps = g.steps;
    for (const s of Object.values(g.steps)) this.byNumber.set(s.n, s.id);
    const links = Object.values(g.links);
    this.trans = Object.values(g.transitions).map((t) => {
      let expr: Expr | null = null;
      let error: string | null = null;
      try {
        expr = parseExpr(t.cond || '');
      } catch (e) {
        error = (e as Error).message;
      }
      return {
        id: t.id,
        before: links.filter((l) => l.to === t.id && g.steps[l.from]).map((l) => l.from),
        after: links.filter((l) => l.from === t.id && g.steps[l.to]).map((l) => l.to),
        expr,
        error,
      };
    });
    const vars = new Set<string>();
    for (const t of this.trans) if (t.expr) exprVars(t.expr, vars);
    this.watched = [...vars];
    this.reset(0);
  }

  /** Errores de las receptividades (para el editor). */
  errors() {
    return this.trans.filter((t) => t.error).map((t) => ({ id: t.id, message: t.error! }));
  }

  reset(t: number) {
    this.active = new Set(
      Object.values(this.steps)
        .filter((s) => s.initial)
        .map((s) => s.id),
    );
    this.since = new Map([...this.active].map((id) => [id, t]));
    this.latched.clear();
    this.counters.clear();
    this.prev.clear();
  }

  isActive(n: number) {
    const id = this.byNumber.get(n);
    return !!id && this.active.has(id);
  }

  /** Un ciclo: evolución hasta situación estable y cálculo de las salidas. */
  cycle(t: number, io: ControlIO): GrafcetState {
    const now = new Map(this.watched.map((v) => [v, this.readVar(v, io)]));
    const env: ExprEnv = {
      value: (name) => this.readVar(name, io),
      edge: (name, up) => {
        const cur = now.get(name) ?? this.readVar(name, io);
        const before = this.prev.get(name) ?? cur;
        return up ? cur && !before : !cur && before;
      },
      stepTime: (n) => {
        const id = this.byNumber.get(n);
        return id && this.active.has(id) ? t - (this.since.get(id) ?? t) : -1;
      },
    };
    this.firable = [];
    for (let iter = 0; iter < 20; iter++) {
      const fire = this.trans.filter(
        (tr) =>
          tr.expr &&
          tr.before.length > 0 &&
          tr.before.every((s) => this.active.has(s)) &&
          evalExpr(tr.expr, env),
      );
      if (!fire.length) break;
      if (iter === 0) this.firable = fire.map((f) => f.id);
      const off = new Set(fire.flatMap((f) => f.before));
      const on = new Set(fire.flatMap((f) => f.after));
      for (const s of off)
        if (!on.has(s)) {
          this.active.delete(s);
          this.since.delete(s);
        }
      for (const s of on) {
        if (!this.active.has(s)) {
          this.active.add(s);
          this.since.set(s, t);
          this.onActivate(s);
        }
      }
      // Los flancos sólo valen para el primer franqueo del ciclo.
      env.edge = () => false;
    }
    for (const [v, val] of now) this.prev.set(v, val);
    this.writeOutputs(t, io);
    return {
      active: [...this.active],
      firable: this.firable,
      counters: Object.fromEntries([...this.counters].map(([k, c]) => [k, c.n])),
    };
  }

  private readVar(name: string, io: ControlIO): boolean {
    const step = /^X(\d+)$/.exec(name);
    if (step) return this.isActive(Number(step[1]));
    const c = this.counters.get(name);
    if (c) return c.n >= c.preset;
    return io.read(name);
  }

  private onActivate(id: string) {
    for (const a of this.steps[id]?.actions ?? []) {
      if (a.kind === 'CU') {
        const c = this.counters.get(a.target) ?? { n: 0, preset: a.time ?? 1 };
        c.n++;
        c.preset = a.time ?? c.preset;
        this.counters.set(a.target, c);
      } else if (a.kind === 'CR') {
        const c = this.counters.get(a.target);
        if (c) c.n = 0;
        else this.counters.set(a.target, { n: 0, preset: 1 });
      } else if (a.kind === 'S') this.latched.add(a.target);
      else if (a.kind === 'R') this.latched.delete(a.target);
    }
  }

  private writeOutputs(t: number, io: ControlIO) {
    const out = new Set(this.latched);
    for (const id of this.active) {
      const dt = t - (this.since.get(id) ?? t);
      for (const a of this.steps[id]?.actions ?? []) if (this.continuous(a, dt)) out.add(a.target);
    }
    for (const name of out) if (name) io.write(name);
  }

  private continuous(a: GrafcetAction, dt: number) {
    if (a.kind === 'N') return true;
    if (a.kind === 'D') return dt >= (a.time ?? 0);
    if (a.kind === 'L') return dt < (a.time ?? 0);
    return false;
  }
}

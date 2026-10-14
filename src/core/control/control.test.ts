import { describe, expect, it } from 'vitest';
import type { Grafcet, Ladder } from '../model/types';
import { evalExpr, exprError, parseExpr, type ExprEnv } from './expr';
import { GrafcetRuntime, type ControlIO } from './grafcet';
import { LadderRuntime } from './ladder';

const env = (vals: Record<string, boolean>, times: Record<number, number> = {}): ExprEnv => ({
  value: (n) => !!vals[n],
  edge: () => false,
  stepTime: (n) => times[n] ?? -1,
});

/** Entradas/salidas de prueba: lo escrito en cada ciclo se guarda en `out`. */
function io(inputs: Record<string, boolean>) {
  const out = new Set<string>();
  const port: ControlIO = { read: (n) => !!inputs[n], write: (n) => out.add(n) };
  return { inputs, out, port };
}

describe('expresiones', () => {
  it('precedencia, negación, yuxtaposición y constantes', () => {
    const e = env({ S1: true, '1B1': true, S2: false });
    expect(evalExpr(parseExpr('S1 · 1B1'), e)).toBe(true);
    expect(evalExpr(parseExpr('S1 1B1 + S2'), e)).toBe(true);
    expect(evalExpr(parseExpr('S2 + !S1'), e)).toBe(false);
    expect(evalExpr(parseExpr('¬(S2 + S1)'), e)).toBe(false);
    expect(evalExpr(parseExpr('/S2 & S1'), e)).toBe(true);
    expect(evalExpr(parseExpr('=1'), e)).toBe(true);
    expect(evalExpr(parseExpr('t/X3/2s'), env({}, { 3: 2.5 }))).toBe(true);
    expect(evalExpr(parseExpr('t/X3/500ms'), env({}, { 3: 0.2 }))).toBe(false);
  });

  it('errores comprensibles', () => {
    expect(exprError('S1 ·')).toMatch(/Falta un operando/);
    expect(exprError('(S1 + S2')).toMatch(/paréntesis/);
    expect(exprError('')).toMatch(/vacía/);
    expect(exprError('S1 · 1B2')).toBeNull();
  });
});

/** 0 →(S1)→ 1 [N Y1] →(1B2)→ 2 [N Y2] →(1B1)→ 0 */
function sequence(): Grafcet {
  return {
    steps: {
      s0: { id: 's0', n: 0, x: 0, y: 0, initial: true, actions: [] },
      s1: { id: 's1', n: 1, x: 0, y: 100, initial: false, actions: [{ kind: 'N', target: 'Y1' }] },
      s2: {
        id: 's2',
        n: 2,
        x: 0,
        y: 200,
        initial: false,
        actions: [{ kind: 'D', target: 'Y2', time: 1 }],
      },
    },
    transitions: {
      t0: { id: 't0', x: 0, y: 50, cond: '↑S1' },
      t1: { id: 't1', x: 0, y: 150, cond: '1B2' },
      t2: { id: 't2', x: 0, y: 250, cond: '1B1' },
    },
    links: {
      a: { id: 'a', from: 's0', to: 't0' },
      b: { id: 'b', from: 't0', to: 's1' },
      c: { id: 'c', from: 's1', to: 't1' },
      d: { id: 'd', from: 't1', to: 's2' },
      e: { id: 'e', from: 's2', to: 't2' },
      f: { id: 'f', from: 't2', to: 's0' },
    },
  };
}

describe('GRAFCET', () => {
  it('evoluciona con flancos, acciones continuas y retardadas', () => {
    const g = new GrafcetRuntime(sequence());
    const p = io({ S1: true });
    // S1 ya estaba pulsado al empezar: no hay flanco.
    expect(g.cycle(0, p.port).active).toEqual(['s0']);
    p.inputs.S1 = false;
    g.cycle(0.1, p.port);
    p.inputs.S1 = true;
    expect(g.cycle(0.2, p.port).active).toEqual(['s1']);
    expect(p.out.has('Y1')).toBe(true);
    p.out.clear();
    p.inputs['1B2'] = true;
    expect(g.cycle(0.3, p.port).active).toEqual(['s2']);
    expect(p.out.has('Y2')).toBe(false); // retardada 1 s
    p.out.clear();
    g.cycle(1.4, p.port);
    expect(p.out.has('Y2')).toBe(true);
  });

  it('divergencia en Y (dos etapas a la vez) y convergencia', () => {
    const g: Grafcet = {
      steps: {
        a: { id: 'a', n: 0, x: 0, y: 0, initial: true, actions: [] },
        b: { id: 'b', n: 1, x: 0, y: 0, initial: false, actions: [{ kind: 'N', target: 'Y1' }] },
        c: { id: 'c', n: 2, x: 0, y: 0, initial: false, actions: [{ kind: 'N', target: 'Y3' }] },
      },
      transitions: {
        t0: { id: 't0', x: 0, y: 0, cond: 'S1' },
        t1: { id: 't1', x: 0, y: 0, cond: 'S2' },
      },
      links: {
        l1: { id: 'l1', from: 'a', to: 't0' },
        l2: { id: 'l2', from: 't0', to: 'b' },
        l3: { id: 'l3', from: 't0', to: 'c' },
        l4: { id: 'l4', from: 'b', to: 't1' },
        l5: { id: 'l5', from: 'c', to: 't1' },
        l6: { id: 'l6', from: 't1', to: 'a' },
      },
    };
    const r = new GrafcetRuntime(g);
    const p = io({ S1: true });
    expect(r.cycle(0, p.port).active.sort()).toEqual(['b', 'c']);
    expect([...p.out].sort()).toEqual(['Y1', 'Y3']);
    p.inputs.S2 = true;
    p.inputs.S1 = false;
    expect(r.cycle(0.1, p.port).active).toEqual(['a']);
  });

  it('contador CU/CR y acciones memorizadas S/R', () => {
    const g = sequence();
    g.steps.s1.actions = [
      { kind: 'S', target: 'H1' },
      { kind: 'CU', target: 'C1', time: 2 },
    ];
    g.steps.s0.actions = [{ kind: 'R', target: 'H1' }];
    g.transitions.t0.cond = 'S1';
    g.transitions.t1.cond = '1';
    g.transitions.t2.cond = '1B1';
    const r = new GrafcetRuntime(g);
    const p = io({ S1: true });
    r.cycle(0, p.port);
    expect(p.out.has('H1')).toBe(true); // memorizada aunque la etapa 1 ya no esté activa
    expect(r.cycle(0.1, p.port).counters.C1).toBe(1);
  });
});

describe('esquema de contactos', () => {
  const latch: Ladder = {
    rungs: [
      { id: 'r1', cond: '(I0.0 + M0.0) · I0.1', coil: { kind: 'coil', target: 'M0.0' } },
      { id: 'r2', cond: 'M0.0 · !T1', coil: { kind: 'coil', target: 'Q0.0' } },
      { id: 'r3', cond: 'I0.2', coil: { kind: 'TON', target: 'T1', preset: 2 } },
      { id: 'r4', cond: '↑I0.3', coil: { kind: 'CTU', target: 'C1', preset: 2 } },
      { id: 'r5', cond: 'C1', coil: { kind: 'coil', target: 'Q0.1' } },
      { id: 'r6', cond: 'I0.4', coil: { kind: 'reset', target: 'C1' } },
    ],
  };

  it('autorretención, temporizador a la conexión y contador', () => {
    const l = new LadderRuntime(latch);
    const p = io({ 'I0.1': true });
    l.cycle(0.001, p.port);
    expect(p.out.has('Q0.0')).toBe(false);
    p.inputs['I0.0'] = true;
    l.cycle(0.001, p.port);
    p.inputs['I0.0'] = false;
    p.out.clear();
    l.cycle(0.001, p.port);
    expect(p.out.has('Q0.0')).toBe(true); // se mantiene por M0.0
    // TON: 2 s con I0.2 → T1 corta Q0.0.
    p.inputs['I0.2'] = true;
    for (let i = 0; i < 1990; i++) l.cycle(0.001, p.port);
    p.out.clear();
    l.cycle(0.001, p.port);
    expect(p.out.has('Q0.0')).toBe(true);
    for (let i = 0; i < 20; i++) l.cycle(0.001, p.port);
    p.out.clear();
    l.cycle(0.001, p.port);
    expect(p.out.has('Q0.0')).toBe(false);
    // Paro (I0.1 NC abierto) desenclava.
    p.inputs['I0.1'] = false;
    l.cycle(0.001, p.port);
    expect(l.cycle(0.001, p.port).vars['M0.0']).toBe(0);
    // Contador: dos flancos de I0.3 → C1.
    for (const v of [true, false, true]) {
      p.inputs['I0.3'] = v;
      p.out.clear();
      l.cycle(0.001, p.port);
    }
    expect(p.out.has('Q0.1')).toBe(true);
    p.inputs['I0.4'] = true;
    p.out.clear();
    l.cycle(0.001, p.port);
    l.cycle(0.001, p.port);
    p.out.clear();
    l.cycle(0.001, p.port);
    expect(p.out.has('Q0.1')).toBe(false);
  });
});

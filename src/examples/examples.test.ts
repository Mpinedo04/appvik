import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllModels } from '../components/models';
import { validate } from '../core/model/edit';
import { Simulation } from '../core/sim/engine';
import { phaseDiagram, Recorder } from '../core/sim/recorder';
import { cycleABAB, cycleABBA, EXAMPLE_DEFS, latchStartStop, timedReturn } from './builders';

beforeAll(registerAllModels);

const byLabel = (c: ReturnType<typeof cycleABBA>, label: string) =>
  Object.values(c.components).find((x) => x.label === label)!.id;

describe('ejemplos', () => {
  it('todos se construyen sin puertos abiertos y se pueden simular', () => {
    for (const ex of EXAMPLE_DEFS) {
      const c = ex.build();
      expect(
        validate(c).map((i) => i.message),
        ex.file,
      ).toEqual([]);
      const sim = new Simulation(c);
      sim.advance(0.2);
    }
  });

  it('ciclo A+ B+ B− A−: también funciona pulsando el arranque nada más empezar', () => {
    const c = cycleABBA();
    const sim = new Simulation(c);
    const rec = new Recorder(c);
    sim.recorder = rec;
    const start = Object.values(c.components).find((x) => x.type === 'pneu-valve-32nc')!.id;
    sim.userAction(start, 'press');
    sim.advance(0.2);
    sim.userAction(start, 'release');
    sim.advance(4);
    expect(phaseDiagram(rec.data()).steps.map((s) => s.moves.join(' '))).toEqual([
      '1A+',
      '2A+',
      '2A−',
      '1A−',
    ]);
  });

  it('ciclo A+ B+ B− A−: la secuencia es exacta y el ciclo termina', () => {
    const c = cycleABBA();
    const labels = Object.values(c.components).map((x) => x.label);
    expect(labels).toEqual(
      expect.arrayContaining(['1A', '2A', '1V1', '2V1', '1S1', '1S2', '2S1', '2S2']),
    );
    const sim = new Simulation(c);
    const rec = new Recorder(c);
    sim.recorder = rec;
    sim.advance(0.3);
    const start = Object.values(c.components).find((x) => x.type === 'pneu-valve-32nc')!.id;
    sim.userAction(start, 'press');
    sim.advance(0.15);
    sim.userAction(start, 'release');
    sim.advance(4);
    const A = byLabel(c, '1A');
    const B = byLabel(c, '2A');
    expect(sim.state(A).pos).toBeLessThan(0.01);
    expect(sim.state(B).pos).toBeLessThan(0.01);
    const phases = phaseDiagram(rec.data());
    expect(phases.steps.map((s) => s.moves.join(' '))).toEqual(['1A+', '2A+', '2A−', '1A−']);
    // Posiciones en los límites de los pasos (0 = dentro, 1 = fuera).
    const round = (v: number[]) => v.map((x) => Math.round(x));
    expect(round(phases.positions[0])).toEqual([0, 1, 1, 1, 0]);
    expect(round(phases.positions[1])).toEqual([0, 0, 1, 0, 0]);
  });

  it('08 enclavamiento: K1 se mantiene al soltar S1; el paro y la seta lo cortan', () => {
    const c = latchStartStop();
    const sim = new Simulation(c);
    const id = (label: string, type?: string) =>
      Object.values(c.components).find((x) => x.label === label && (!type || x.type === type))!.id;
    const K1 = id('K1', 'elec-relay');
    const H1 = id('H1');
    const cyl = id('1A');
    const click = (label: string) => {
      sim.userAction(id(label), 'press');
      sim.advance(0.1);
      sim.userAction(id(label), 'release');
    };
    sim.advance(0.2);
    click('S1');
    sim.advance(1.5);
    expect(sim.state(K1).on).toBe(true);
    expect(sim.state(H1).on).toBe(true);
    expect(sim.state(cyl).pos).toBeGreaterThan(0.99);
    click('S0');
    sim.advance(1.5);
    expect(sim.state(K1).on).toBe(false);
    expect(sim.state(cyl).pos).toBeLessThan(0.01);
    click('S1');
    sim.advance(0.3);
    expect(sim.state(K1).on).toBe(true);
    // Seta de emergencia: corta y, enclavada, impide volver a arrancar.
    click('S2');
    sim.advance(0.1);
    expect(sim.state(K1).on).toBe(false);
    click('S1');
    sim.advance(0.3);
    expect(sim.state(K1).on).toBe(false);
    click('S2'); // rearme
    click('S1');
    sim.advance(0.3);
    expect(sim.state(K1).on).toBe(true);
  });

  it('09 ciclo A+ B+ A− B− electroneumático: en ciclo continuo se repite', () => {
    const c = cycleABAB();
    expect(validate(c)).toEqual([]);
    const sim = new Simulation(c);
    const rec = new Recorder(c);
    sim.recorder = rec;
    sim.advance(0.2);
    const s2 = Object.values(c.components).find((x) => x.label === 'S2')!.id;
    sim.userAction(s2, 'press');
    sim.userAction(s2, 'release');
    sim.advance(6);
    const steps = phaseDiagram(rec.data()).steps.map((s) => s.moves.join(' '));
    expect(steps.slice(0, 8)).toEqual(['1A+', '2A+', '1A−', '2A−', '1A+', '2A+', '1A−', '2A−']);
  });

  it('10 retorno temporizado: el vástago se queda fuera 2 s', () => {
    const c = timedReturn();
    const sim = new Simulation(c);
    const cyl = Object.values(c.components).find((x) => x.label === '1A')!.id;
    const s1 = Object.values(c.components).find((x) => x.label === 'S1')!.id;
    sim.advance(0.2);
    sim.userAction(s1, 'press');
    sim.advance(0.1);
    sim.userAction(s1, 'release');
    let tOut = -1;
    let tBack = -1;
    for (let i = 0; i < 6000 && tBack < 0; i++) {
      sim.advance(0.001);
      const pos = sim.state(cyl).pos;
      if (tOut < 0 && pos > 0.999) tOut = sim.t;
      if (tOut > 0 && pos < 0.99) tBack = sim.t;
    }
    expect(tBack - tOut).toBeGreaterThan(1.9);
    expect(tBack - tOut).toBeLessThan(2.1);
  });
});

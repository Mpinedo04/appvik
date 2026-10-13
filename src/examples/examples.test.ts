import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllModels } from '../components/models';
import { validate } from '../core/model/edit';
import { Simulation } from '../core/sim/engine';
import { phaseDiagram, Recorder } from '../core/sim/recorder';
import { cycleABBA, EXAMPLE_DEFS } from './builders';

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
    expect(phaseDiagram(rec.data()).steps.map((s) => s.moves.join(' '))).toEqual(['1A+', '2A+', '2A−', '1A−']);
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
});

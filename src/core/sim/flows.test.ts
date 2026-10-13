import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllModels } from '../../components/models';
import { CircuitBuilder } from '../model/builder';
import { Simulation } from './engine';
import { connectionFlows } from './flows';

beforeAll(registerAllModels);

describe('caudal por tubería', () => {
  it('al pulsar, el aire va de la válvula a la cámara trasera y sale de la delantera', () => {
    const b = new CircuitBuilder();
    const cyl = b.add('pneu-cyl-double', 300, 120);
    const valve = b.add('pneu-valve-52', 270, 260);
    const src = b.add('pneu-supply', 300, 400);
    const w4 = b.connect(valve, '4', cyl, '1'); // a = válvula, b = cilindro
    const w2 = b.connect(cyl, '2', valve, '2'); // a = cilindro, b = válvula
    const feed = b.connect(src, '1', valve, '1');
    const sim = new Simulation(b.circuit);
    sim.advance(0.3);
    sim.userAction(valve, 'press');
    sim.advance(0.03);
    const f = connectionFlows(b.circuit, sim.snapshot());
    expect(f[w4]).toBeGreaterThan(1e-5); // válvula → cilindro
    expect(f[w2]).toBeGreaterThan(1e-5); // cilindro → válvula (escape)
    expect(f[feed]).toBeGreaterThan(1e-5); // fuente → válvula
    sim.advance(1);
    const still = connectionFlows(b.circuit, sim.snapshot());
    expect(Math.abs(still[w4])).toBeLessThan(1e-6);
  });

  it('el bus de señales entrega en el paso siguiente lo publicado', () => {
    const b = new CircuitBuilder();
    b.add('pneu-supply', 0, 0);
    const sim = new Simulation(b.circuit);
    expect(sim.signal('x')).toBe(0);
    expect(sim.snapshot().signals).toEqual({});
  });
});

import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllModels } from '../../components/models';
import { CircuitBuilder } from '../model/builder';
import { Simulation } from './engine';

beforeAll(registerAllModels);

/** Mando directo: fuente → 5/2 (pulsador + muelle) → cilindro de doble efecto. */
function directControl(valveParams = {}, cylParams = {}) {
  const b = new CircuitBuilder();
  const cyl = b.add('pneu-cyl-double', 200, 100, cylParams);
  const valve = b.add('pneu-valve-52', 200, 250, valveParams);
  const src = b.add('pneu-supply', 230, 380);
  const gauge = b.add('pneu-gauge', 320, 380);
  b.connect(valve, '4', cyl, '1');
  b.connect(valve, '2', cyl, '2');
  b.connect(src, '1', valve, '1');
  b.connect(gauge, '1', valve, '1');
  return { circuit: b.circuit, cyl, valve, src, gauge };
}

/** Avanza hasta que se cumpla la condición; devuelve el tiempo empleado o Infinity. */
function timeUntil(sim: Simulation, cond: () => boolean, max = 3) {
  const t0 = sim.t;
  while (sim.t - t0 < max) {
    sim.advance(0.001);
    if (cond()) return sim.t - t0;
  }
  return Infinity;
}

describe('mando directo de un cilindro de doble efecto', () => {
  it('en reposo el cilindro queda retraído y la cámara delantera a presión', () => {
    const { circuit, cyl, gauge } = directControl();
    const sim = new Simulation(circuit);
    sim.advance(0.5);
    const s = sim.state(cyl);
    expect(s.pos).toBeLessThan(0.001);
    expect(s.pRod).toBeGreaterThan(5.5);
    expect(s.pCap).toBeLessThan(0.1);
    expect(sim.state(gauge).bar).toBeGreaterThan(5.5);
  });

  it('al pulsar avanza, al soltar retrocede, con tiempos de carrera realistas', () => {
    const { circuit, cyl, valve } = directControl();
    const sim = new Simulation(circuit);
    sim.advance(0.3);
    sim.userAction(valve, 'press');
    const tOut = timeUntil(sim, () => sim.state(cyl).pos > 0.999);
    expect(tOut).toBeGreaterThan(0.03);
    expect(tOut).toBeLessThan(1);
    sim.advance(0.2);
    expect(sim.state(cyl).pCap).toBeGreaterThan(5.5);
    sim.userAction(valve, 'release');
    const tIn = timeUntil(sim, () => sim.state(cyl).pos < 0.001);
    expect(tIn).toBeGreaterThan(0.02);
    expect(tIn).toBeLessThan(1);
  });

  it('una carga mayor hace más lento el avance y una carga excesiva lo impide', () => {
    const run = (load: number) => {
      const { circuit, cyl, valve } = directControl({}, { load });
      const sim = new Simulation(circuit);
      sim.advance(0.2);
      sim.userAction(valve, 'press');
      return timeUntil(sim, () => sim.state(cyl).pos > 0.999, 2);
    };
    const free = run(0);
    const loaded = run(120);
    expect(loaded).toBeGreaterThan(free);
    // Fuerza teórica a 6 bar con Ø20: ~188 N → con 250 N no puede avanzar.
    expect(run(250)).toBe(Infinity);
  });

  it('una válvula más pequeña hace el cilindro más lento', () => {
    const run = (qn: number) => {
      const { circuit, cyl, valve } = directControl({ qn });
      const sim = new Simulation(circuit);
      sim.advance(0.2);
      sim.userAction(valve, 'press');
      return timeUntil(sim, () => sim.state(cyl).pos > 0.999);
    };
    expect(run(50)).toBeGreaterThan(run(300) * 2);
  });

  it('la palanca con enclavamiento mantiene la posición al soltar', () => {
    const { circuit, cyl, valve } = directControl({ actLeft: 'lever' });
    const sim = new Simulation(circuit);
    sim.advance(0.2);
    sim.userAction(valve, 'press');
    sim.userAction(valve, 'release');
    sim.advance(1);
    expect(sim.state(cyl).pos).toBeGreaterThan(0.999);
    sim.userAction(valve, 'press');
    sim.userAction(valve, 'release');
    sim.advance(1);
    expect(sim.state(cyl).pos).toBeLessThan(0.001);
  });

  it('detecta puertos abiertos (los escapes no cuentan como fuga)', () => {
    const { circuit } = directControl();
    const sim = new Simulation(circuit);
    const open = sim.nets.openPorts.filter((o) => !o.port.exhaust);
    expect(open).toHaveLength(0);
    expect(sim.nets.openPorts.map((o) => o.port.id).sort()).toEqual(['3', '5']);
  });

  it('las explicaciones describen el estado interno', () => {
    const { circuit, cyl, valve } = directControl();
    const sim = new Simulation(circuit);
    sim.advance(0.3);
    expect(sim.explain(valve).join(' ')).toMatch(/1→2 abierta/);
    sim.userAction(valve, 'press');
    sim.advance(0.02);
    expect(sim.explain(cyl).join(' ')).toMatch(/AVANZA/);
  });
});

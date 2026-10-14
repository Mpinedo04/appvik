import { beforeAll, describe, expect, it } from 'vitest';
import { CircuitBuilder } from '../../core/model/builder';
import { Simulation } from '../../core/sim/engine';
import { registerAllModels } from '../models';

beforeAll(registerAllModels);

/** Grupo + válvula de vías + cilindro, con retorno al depósito. */
function rig(
  valveType: string,
  opts: { pset?: number; load?: number; flow?: number; meterIn?: number } = {},
) {
  const b = new CircuitBuilder();
  const cyl = b.add('hyd-cyl-double', 300, 0, { load: opts.load ?? 0, mass: 20 });
  const valve = b.add(valveType, 270, 200, { actLeft: 'lever', actRight: 'lever' });
  const pu = b.add('hyd-power-unit', 280, 400, { flow: opts.flow ?? 8, pset: 100 });
  const relief = b.add('hyd-relief', 150, 330, { pset: opts.pset ?? 50 });
  const gauge = b.add('hyd-gauge', 450, 330);
  const t1 = b.add('hyd-tank', 330, 300);
  const t2 = b.add('hyd-tank', 150, 400);
  if (opts.meterIn) {
    const fc = b.add('hyd-flow-control', 250, 100, { qset: opts.meterIn });
    b.connect(valve, 'A', fc, '1');
    b.connect(fc, '2', cyl, 'A');
  } else b.connect(valve, 'A', cyl, 'A');
  b.connect(valve, 'B', cyl, 'B');
  const feed = b.connect(pu, 'P', valve, 'P');
  b.connect(valve, 'T', t1, '1');
  b.connect(pu, 'T', b.add('hyd-tank', 400, 450), '1');
  b.tee(feed, 270, 330, relief, 'P');
  b.connect(relief, 'T', t2, '1');
  b.teeAt(270, 300, gauge, '1');
  return { c: b.circuit, cyl, valve, pu, relief, gauge };
}

describe('hidráulica', () => {
  it('prensa: al llegar al tope la presión sube hasta el tarado y la limitadora descarga la bomba', () => {
    const r = rig('hyd-valve-43-tandem');
    const sim = new Simulation(r.c);
    sim.advance(0.5);
    // Centro en tándem: la bomba descarga al tanque sin presión.
    expect(sim.state(r.pu).pBar).toBeLessThan(3);
    sim.userAction(r.valve, 'press', 'left');
    sim.userAction(r.valve, 'release');
    sim.advance(1);
    const v = sim.state(r.cyl).v;
    // Velocidad = caudal / área (8 l/min en Ø40 → 0,106 m/s).
    expect(v).toBeGreaterThan(0.09);
    expect(v).toBeLessThan(0.115);
    sim.advance(3);
    expect(sim.state(r.cyl).pos).toBeGreaterThan(0.999);
    const p = sim.state(r.pu).pBar;
    expect(p).toBeGreaterThan(50 * 0.97);
    expect(p).toBeLessThan(50 * 1.03);
    expect(sim.state(r.relief).q).toBeGreaterThan(7.5);
    // Vuelta al centro: el cilindro queda quieto y la bomba vuelve a descargar.
    sim.userAction(r.valve, 'press', 'left');
    sim.userAction(r.valve, 'release');
    sim.advance(1);
    expect(sim.state(r.pu).pBar).toBeLessThan(3);
    expect(sim.state(r.cyl).pos).toBeGreaterThan(0.99);
  });

  it('reguladora compensada: la misma velocidad con y sin carga', () => {
    const speeds = [0, 3000].map((load) => {
      const r = rig('hyd-valve-43-closed', { load, meterIn: 3, pset: 80 });
      const sim = new Simulation(r.c);
      sim.advance(0.3);
      sim.userAction(r.valve, 'press', 'left');
      sim.userAction(r.valve, 'release');
      sim.advance(1.5);
      return sim.state(r.cyl).v;
    });
    const expected = 3 / 60_000 / ((Math.PI * 0.04 ** 2) / 4);
    for (const v of speeds) {
      expect(v).toBeGreaterThan(expected * 0.9);
      expect(v).toBeLessThan(expected * 1.1);
    }
  });

  it('antirretorno desbloqueable: sostiene la carga con la válvula en el centro', () => {
    const b = new CircuitBuilder();
    const cyl = b.add('hyd-cyl-double', 300, 0, { load: 2000, mass: 20 });
    const pc = b.add('hyd-pilot-check', 250, 100);
    const valve = b.add('hyd-valve-43-float', 270, 200, { actLeft: 'lever', actRight: 'lever' });
    const pu = b.add('hyd-power-unit', 280, 400, { flow: 8, pset: 100 });
    b.connect(valve, 'A', pc, '1');
    b.connect(pc, '2', cyl, 'A');
    const lineB = b.connect(valve, 'B', cyl, 'B');
    b.tee(lineB, 330, 150, pc, 'X');
    b.connect(pu, 'P', valve, 'P');
    b.connect(valve, 'T', b.add('hyd-tank', 330, 300), '1');
    b.connect(pu, 'T', b.add('hyd-tank', 400, 450), '1');
    const sim = new Simulation(b.circuit);
    sim.advance(0.2);
    sim.userAction(valve, 'press', 'left');
    sim.userAction(valve, 'release');
    sim.advance(1);
    const pos = sim.state(cyl).pos;
    expect(pos).toBeGreaterThan(0.3);
    // Centro flotante: A y B al tanque, pero el antirretorno no deja volver el aceite.
    sim.userAction(valve, 'press', 'left');
    sim.userAction(valve, 'release');
    sim.advance(2);
    expect(Math.abs(sim.state(cyl).pos - pos)).toBeLessThan(0.02);
    // Presión en B → pilotaje → la bola se levanta y el cilindro baja.
    sim.userAction(valve, 'press', 'right');
    sim.userAction(valve, 'release');
    sim.advance(1);
    expect(sim.state(cyl).pos).toBeLessThan(pos - 0.2);
  });

  it('motor hidráulico: rpm = caudal / cilindrada', () => {
    const b = new CircuitBuilder();
    const motor = b.add('hyd-motor', 300, 0, { disp: 8, loadT: 2 });
    const valve = b.add('hyd-valve-42', 270, 200, { actLeft: 'lever', actRight: 'spring' });
    const pu = b.add('hyd-power-unit', 280, 400, { flow: 8, pset: 100 });
    b.connect(valve, 'A', motor, 'A');
    b.connect(valve, 'B', motor, 'B');
    b.connect(pu, 'P', valve, 'P');
    b.connect(valve, 'T', b.add('hyd-tank', 330, 300), '1');
    b.connect(pu, 'T', b.add('hyd-tank', 400, 450), '1');
    const sim = new Simulation(b.circuit);
    sim.userAction(valve, 'press', 'left');
    sim.advance(1.5);
    const rpm = sim.state(motor).rpm;
    expect(rpm).toBeGreaterThan(900);
    expect(rpm).toBeLessThan(1010);
    // Par = cilindrada·Δp/2π ≈ par resistente.
    expect(sim.state(motor).torque).toBeGreaterThan(1.5);
  });

  it('acumulador: se carga por encima de la precarga y devuelve aceite al parar la bomba', () => {
    const b = new CircuitBuilder();
    const acc = b.add('hyd-accumulator', 300, 0, { V0: 0.5, p0: 20 });
    const pu = b.add('hyd-power-unit', 280, 400, { flow: 8, pset: 60 });
    const ck = b.add('hyd-check', 300, 200);
    const relief = b.add('hyd-relief', 400, 100, { pset: 1000 });
    b.connect(pu, 'P', ck, '1');
    const line = b.connect(ck, '2', acc, '1');
    b.tee(line, 300, 100, relief, 'P');
    b.connect(relief, 'T', b.add('hyd-tank', 420, 200), '1');
    b.connect(pu, 'T', b.add('hyd-tank', 400, 450), '1');
    const sim = new Simulation(b.circuit);
    sim.advance(4);
    const s = sim.state(acc);
    expect(s.pBar).toBeGreaterThan(55);
    expect(s.fill).toBeGreaterThan(0.5);
    expect(sim.state(pu).relief).toBeGreaterThan(0.01);
  });
});

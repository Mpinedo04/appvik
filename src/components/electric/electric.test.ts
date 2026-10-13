import { beforeAll, describe, expect, it } from 'vitest';
import { CircuitBuilder } from '../../core/model/builder';
import { Simulation } from '../../core/sim/engine';
import { registerAllModels } from '../models';

beforeAll(registerAllModels);

/** +24 V → contacto(s) en serie → carga → 0 V (sin tuberías). */
function branch(b: CircuitBuilder, x: number, items: [string, string, string, string?][]) {
  const plus = b.add('elec-24v', x, 0);
  let prev: [string, string] = [plus, '1'];
  const ids: string[] = [];
  items.forEach(([type, top, bottom, label], i) => {
    const id = b.add(type, x, 80 + i * 80, {}, { label });
    b.connect(prev[0], prev[1], id, top);
    prev = [id, bottom];
    ids.push(id);
  });
  const zero = b.add('elec-0v', x, 80 + items.length * 80);
  b.connect(prev[0], prev[1], zero, '1');
  return ids;
}

describe('componentes eléctricos', () => {
  it('pulsador → relé: la bobina tarda ~10 ms en conmutar y publica su etiqueta', () => {
    const b = new CircuitBuilder();
    const [s1, k1] = branch(b, 0, [
      ['elec-button-no', '3', '4', 'S1'],
      ['elec-relay', 'A1', 'A2', 'K1'],
    ]);
    const sim = new Simulation(b.circuit);
    sim.advance(0.05);
    expect(sim.state(k1).on).toBe(false);
    sim.userAction(s1, 'press');
    sim.advance(0.005);
    expect(sim.state(k1).energized).toBe(true);
    expect(sim.state(k1).on).toBe(false);
    sim.advance(0.01);
    expect(sim.state(k1).on).toBe(true);
    expect(sim.signal('K1')).toBe(1);
  });

  it('relé temporizado a la conexión y a la desconexión', () => {
    const b = new CircuitBuilder();
    const [s1, kt] = branch(b, 0, [
      ['elec-switch', '3', '4', 'S1'],
      ['elec-relay-timer', 'A1', 'A2', 'KT1'],
    ]);
    b.circuit.components[kt].params = { mode: 'on-delay', delay: 1 };
    const [s2, kt2] = branch(b, 200, [
      ['elec-switch', '3', '4', 'S2'],
      ['elec-relay-timer', 'A1', 'A2', 'KT2'],
    ]);
    b.circuit.components[kt2].params = { mode: 'off-delay', delay: 1 };
    const sim = new Simulation(b.circuit);
    sim.userAction(s1, 'press');
    sim.userAction(s2, 'press');
    sim.advance(0.9);
    expect(sim.state(kt).on).toBe(false);
    expect(sim.state(kt2).on).toBe(true);
    sim.advance(0.2);
    expect(sim.state(kt).on).toBe(true);
    // Se desconectan los dos interruptores (otro clic).
    sim.userAction(s1, 'press');
    sim.userAction(s2, 'press');
    sim.advance(0.05);
    expect(sim.state(kt).on).toBe(false);
    expect(sim.state(kt2).on).toBe(true);
    sim.advance(1);
    expect(sim.state(kt2).on).toBe(false);
  });

  it('contador: cuenta flancos, conmuta en la preselección y se pone a cero', () => {
    const b = new CircuitBuilder();
    const plus = b.add('elec-24v', 0, 0);
    const s1 = b.add('elec-button-no', 0, 80, {}, { label: 'S1' });
    const s2 = b.add('elec-button-no', 100, 80, {}, { label: 'S2' });
    const c1 = b.add('elec-counter', 50, 200, { preset: 3 }, { label: 'C1' });
    const zero = b.add('elec-0v', 50, 300);
    const plus2 = b.add('elec-24v', 100, 0);
    const zero2 = b.add('elec-0v', 100, 300);
    b.connect(plus, '1', s1, '3');
    b.connect(s1, '4', c1, 'A1');
    b.connect(c1, 'A2', zero, '1');
    b.connect(plus2, '1', s2, '3');
    b.connect(s2, '4', c1, 'R1');
    b.connect(c1, 'R2', zero2, '1');
    const sim = new Simulation(b.circuit);
    const pulse = (id: string) => {
      sim.userAction(id, 'press');
      sim.advance(0.02);
      sim.userAction(id, 'release');
      sim.advance(0.02);
    };
    pulse(s1);
    pulse(s1);
    expect(sim.state(c1).count).toBe(2);
    expect(sim.signal('C1')).toBe(0);
    pulse(s1);
    sim.advance(0.01);
    expect(sim.signal('C1')).toBe(1);
    pulse(s2);
    expect(sim.state(c1).count).toBe(0);
    expect(sim.signal('C1')).toBe(0);
  });

  it('presostato con histéresis', () => {
    const b = new CircuitBuilder();
    const ps = b.add('elec-pressure-switch', 0, 0, { setBar: 4, hyst: 1 });
    const reg = b.add('pneu-regulator', -120, 0);
    const src = b.add('pneu-supply', -120, 120);
    b.connect(src, '1', reg, '1');
    b.connect(reg, '2', ps, 'X');
    const sim = new Simulation(b.circuit);
    const regId = reg;
    const setReg = (bar: number) => {
      // Cambia el tarado en caliente a través del estado de parámetros resueltos.
      const it = (sim as any).instances.find((x: any) => x.inst.id === regId);
      it.params.pset = bar;
    };
    setReg(3.5);
    sim.advance(1);
    expect(sim.state(ps).actuated).toBe(false);
    setReg(4.5);
    sim.advance(1);
    expect(sim.state(ps).actuated).toBe(true);
    setReg(3.5);
    sim.advance(1);
    expect(sim.state(ps).actuated).toBe(true);
    setReg(2.5);
    sim.advance(1);
    expect(sim.state(ps).actuated).toBe(false);
  });

  it('electroválvula: Y1 la conmuta; la servopilotada necesita presión de alimentación', () => {
    for (const servo of [false, true]) {
      const b = new CircuitBuilder();
      const [s1] = branch(b, 400, [
        ['elec-switch', '3', '4', 'S1'],
        ['elec-solenoid', 'A1', 'A2', 'Y1'],
      ]);
      const valve = b.add('pneu-valve-52', 0, 0, {
        actLeft: servo ? 'solenoid-servo' : 'solenoid',
        actRight: 'spring',
        solLeft: 'Y1',
      });
      const sim = new Simulation(b.circuit);
      sim.userAction(s1, 'press');
      sim.advance(0.1);
      // Sin alimentación neumática (puerto 1 abierto a la atmósfera).
      expect(sim.state(valve).pos < 0.5, `servo=${servo}`).toBe(!servo);
    }
  });

  it('cortocircuito: un interruptor entre +24 V y 0 V apaga todas las cargas', () => {
    const b = new CircuitBuilder();
    const [s1, h1] = branch(b, 0, [
      ['elec-switch', '3', '4', 'S1'],
      ['elec-lamp', 'X1', 'X2', 'H1'],
    ]);
    const [s2] = branch(b, 200, [['elec-switch', '3', '4', 'S2']]);
    const sim = new Simulation(b.circuit);
    sim.userAction(s1, 'press');
    sim.advance(0.01);
    expect(sim.state(h1).on).toBe(true);
    sim.userAction(s2, 'press');
    sim.advance(0.01);
    expect(sim.snapshot().elec.short).toBe(true);
    expect(sim.state(h1).on).toBe(false);
  });
});

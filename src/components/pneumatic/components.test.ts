/** Tests de comportamiento de la biblioteca neumática (fase 3). */
import { beforeAll, describe, expect, it } from 'vitest';
import { CircuitBuilder } from '../../core/model/builder';
import type { Params } from '../../core/model/types';
import { Simulation } from '../../core/sim/engine';
import { registerAllModels } from '../models';

beforeAll(registerAllModels);

function timeUntil(sim: Simulation, cond: () => boolean, max = 5) {
  const t0 = sim.t;
  while (sim.t - t0 < max) {
    sim.advance(0.002);
    if (cond()) return sim.t - t0;
  }
  return Infinity;
}

/** Fuente → válvula 5/2 manual → actuador de dos conexiones. */
function drive52(
  actType: string,
  actParams: Params = {},
  extra?: (b: CircuitBuilder, valve: string, act: string) => void,
) {
  const b = new CircuitBuilder();
  const act = b.add(actType, 300, 100, actParams);
  const valve = b.add('pneu-valve-52', 300, 300);
  const src = b.add('pneu-supply', 330, 450);
  if (extra) extra(b, valve, act);
  else {
    b.connect(valve, '4', act, '1');
    b.connect(valve, '2', act, '2');
  }
  b.connect(src, '1', valve, '1');
  return { b, act, valve, src };
}

describe('actuadores', () => {
  it('cilindro de simple efecto: avanza con aire y vuelve por el muelle', () => {
    const b = new CircuitBuilder();
    const cyl = b.add('pneu-cyl-single', 300, 100);
    const valve = b.add('pneu-valve-32nc', 300, 300);
    const src = b.add('pneu-supply', 300, 450);
    b.connect(valve, '2', cyl, '1');
    b.connect(src, '1', valve, '1');
    const sim = new Simulation(b.circuit);
    sim.advance(0.2);
    expect(sim.state(cyl).pos).toBeLessThan(0.01);
    sim.userAction(valve, 'press');
    expect(timeUntil(sim, () => sim.state(cyl).pos > 0.99)).toBeLessThan(1);
    sim.userAction(valve, 'release');
    expect(timeUntil(sim, () => sim.state(cyl).pos < 0.01)).toBeLessThan(2);
  });

  it('cilindro sin vástago, actuador de giro y pinza se mueven en ambos sentidos', () => {
    for (const type of ['pneu-cyl-rodless', 'pneu-rotary', 'pneu-gripper']) {
      const { b, act, valve } = drive52(type);
      const sim = new Simulation(b.circuit);
      sim.advance(0.2);
      sim.userAction(valve, 'press');
      expect(
        timeUntil(sim, () => sim.state(act).pos > 0.99),
        type,
      ).toBeLessThan(2);
      sim.userAction(valve, 'release');
      expect(
        timeUntil(sim, () => sim.state(act).pos < 0.01),
        type,
      ).toBeLessThan(2);
    }
  });

  it('la amortiguación frena el final de la carrera sin impedir llegar al final', () => {
    // Masa y caudal dentro de lo que admite una amortiguación real de Ø20 (≈ 0,2 J).
    const vNearEnd = (cushion: string) => {
      const { b, act, valve } = drive52('pneu-cyl-double', { cushion, cushionPct: 5, mass: 0.3 });
      b.circuit.components[valve].params = { qn: 100 };
      const sim = new Simulation(b.circuit);
      sim.advance(0.2);
      sim.userAction(valve, 'press');
      timeUntil(sim, () => sim.state(act).pos > 0.98);
      const v = sim.state(act).v;
      expect(timeUntil(sim, () => sim.state(act).pos > 0.999, 3)).toBeLessThan(3);
      return v;
    };
    expect(vNearEnd('adjustable')).toBeLessThan(vNearEnd('none') * 0.4);
  });

  it('motor neumático: gira en un sentido u otro según la conexión con aire', () => {
    const { b, act, valve } = drive52('pneu-motor');
    const sim = new Simulation(b.circuit);
    sim.advance(0.3);
    expect(sim.state(act).rpm).toBeLessThan(-10); // en reposo entra por 2
    sim.userAction(valve, 'press');
    sim.advance(0.4);
    expect(sim.state(act).rpm).toBeGreaterThan(10);
  });
});

describe('válvulas de vías y accionamientos', () => {
  it('mando indirecto: un pulsador 3/2 pilota una 5/2 que mueve el cilindro', () => {
    const b = new CircuitBuilder();
    const cyl = b.add('pneu-cyl-double', 300, 100);
    const power = b.add('pneu-valve-52-pilot', 300, 260);
    const button = b.add('pneu-valve-32nc', 100, 300);
    const src = b.add('pneu-supply', 300, 450);
    b.connect(power, '4', cyl, '1');
    b.connect(power, '2', cyl, '2');
    const feed = b.connect(src, '1', power, '1');
    b.tee(feed, 300, 400, button, '1');
    b.connect(button, '2', power, '14');
    const sim = new Simulation(b.circuit);
    sim.advance(0.3);
    expect(sim.state(cyl).pos).toBeLessThan(0.01);
    sim.userAction(button, 'press');
    expect(timeUntil(sim, () => sim.state(cyl).pos > 0.99)).toBeLessThan(1);
    sim.userAction(button, 'release');
    expect(timeUntil(sim, () => sim.state(cyl).pos < 0.01)).toBeLessThan(1);
  });

  it('5/2 biestable: un impulso en 14 basta para que se quede conmutada', () => {
    const b = new CircuitBuilder();
    const mem = b.add('pneu-valve-52-memory', 300, 260);
    const btn = b.add('pneu-valve-32nc', 100, 300);
    const src = b.add('pneu-supply', 300, 450);
    const feed = b.connect(src, '1', mem, '1');
    b.tee(feed, 300, 400, btn, '1');
    b.connect(btn, '2', mem, '14');
    const sim = new Simulation(b.circuit);
    sim.advance(0.2);
    expect(sim.state(mem).pos).toBeCloseTo(1, 3);
    sim.userAction(btn, 'press');
    sim.advance(0.15);
    sim.userAction(btn, 'release');
    sim.advance(0.5);
    expect(sim.state(mem).pos).toBeCloseTo(0, 3);
  });

  it('5/3: el centro cerrado atrapa el aire y el centro a escape descarga las dos cámaras', () => {
    const run = (type: string) => {
      const b = new CircuitBuilder();
      const cyl = b.add('pneu-cyl-double', 300, 100, { mass: 2, load: 40 });
      const v = b.add(type, 300, 300, { qn: 60 });
      const src = b.add('pneu-supply', 300, 450);
      b.connect(v, '4', cyl, '1');
      b.connect(v, '2', cyl, '2');
      b.connect(src, '1', v, '1');
      const sim = new Simulation(b.circuit);
      sim.advance(0.3);
      sim.userAction(v, 'press', 'left');
      timeUntil(sim, () => sim.state(cyl).pos > 0.3);
      sim.userAction(v, 'release');
      sim.advance(1);
      const a = sim.state(cyl);
      sim.advance(1);
      return { s: a, drift: Math.abs(sim.state(cyl).pos - a.pos), center: sim.state(v).pos };
    };
    const closed = run('pneu-valve-53-closed');
    expect(closed.center).toBeCloseTo(1, 3);
    expect(closed.s.pCap).toBeGreaterThan(0.5); // el aire queda encerrado
    expect(closed.drift).toBeLessThan(0.02); // y el émbolo queda quieto
    const exhaust = run('pneu-valve-53-exhaust');
    expect(exhaust.s.pCap).toBeLessThan(0.2);
    expect(exhaust.s.pRod).toBeLessThan(0.2);
  });

  it('final de carrera: la leva del cilindro acciona la válvula de rodillo con su etiqueta', () => {
    const { b, act, valve } = drive52('pneu-cyl-double', { marks: '1S2@100' });
    const sw = b.add('pneu-limit-32', 600, 300, { sensor: '1S2' });
    const once = b.add('pneu-limit-32', 700, 300, {
      sensor: '1S2',
      actLeft: 'roller-oneway',
      rollerDir: '-',
    });
    const sim = new Simulation(b.circuit);
    sim.advance(0.2);
    expect(sim.state(sw).leftOn).toBe(false);
    sim.userAction(valve, 'press');
    timeUntil(sim, () => sim.state(act).pos > 0.999);
    sim.advance(0.05);
    expect(sim.state(sw).leftOn).toBe(true);
    // El rodillo abatible configurado «al retroceder» no se acciona con el vástago parado al final.
    expect(sim.state(once).leftOn).toBe(false);
    sim.userAction(valve, 'release');
    let tripped = false;
    timeUntil(sim, () => {
      tripped ||= sim.state(once).leftOn;
      return sim.state(act).pos < 0.9;
    });
    expect(tripped).toBe(true);
  });

  it('válvula de secuencia: conmuta al alcanzar la presión de pilotaje ajustada', () => {
    const b = new CircuitBuilder();
    const seq = b.add('pneu-sequence', 300, 300, { pilotBar: 3 });
    const reg = b.add('pneu-regulator', 100, 300, { pset: 2 });
    const src = b.add('pneu-supply', 100, 450);
    b.connect(src, '1', reg, '1');
    b.connect(reg, '2', seq, '12');
    const sim = new Simulation(b.circuit);
    sim.advance(0.5);
    expect(sim.state(seq).leftOn).toBe(false);
    const sim2 = new Simulation({
      ...b.circuit,
      components: {
        ...b.circuit.components,
        [reg]: { ...b.circuit.components[reg], params: { pset: 4 } },
      },
    });
    sim2.advance(0.5);
    expect(sim2.state(seq).leftOn).toBe(true);
  });
});

describe('otras válvulas de vías', () => {
  it('4/2 mueve un cilindro de doble efecto', () => {
    const b = new CircuitBuilder();
    const cyl = b.add('pneu-cyl-double', 300, 100);
    const v = b.add('pneu-valve-42', 300, 300);
    const src = b.add('pneu-supply', 300, 450);
    b.connect(v, '4', cyl, '1');
    b.connect(v, '2', cyl, '2');
    b.connect(src, '1', v, '1');
    const sim = new Simulation(b.circuit);
    sim.advance(0.3);
    sim.userAction(v, 'press');
    expect(timeUntil(sim, () => sim.state(cyl).pos > 0.99)).toBeLessThan(1);
  });

  it('2/2 NC y 3/2 NA: paso cerrado/abierto en reposo según su tipo', () => {
    const out = (type: string, press: boolean) => {
      const b = new CircuitBuilder();
      const v = b.add(type, 300, 300);
      const src = b.add('pneu-supply', 300, 450);
      const g = b.add('pneu-gauge', 300, 150);
      b.connect(src, '1', v, '1');
      b.connect(v, '2', g, '1');
      const sim = new Simulation(b.circuit);
      if (press) sim.userAction(v, 'press');
      sim.advance(0.3);
      return sim.state(g).bar > 3;
    };
    expect([out('pneu-valve-22nc', false), out('pneu-valve-22nc', true)]).toEqual([false, true]);
    expect([out('pneu-valve-32no', false), out('pneu-valve-32no', true)]).toEqual([true, false]);
  });
});

describe('bloqueo y lógica', () => {
  /** Dos pulsadores 3/2 alimentan las entradas de una válvula lógica. */
  function logic(type: string) {
    const b = new CircuitBuilder();
    const lv = b.add(type, 300, 200);
    const a = b.add('pneu-valve-32nc', 150, 300);
    const c = b.add('pneu-valve-32nc', 450, 300);
    const g = b.add('pneu-gauge', 300, 80);
    const s1 = b.add('pneu-supply', 150, 450);
    const s2 = b.add('pneu-supply', 450, 450);
    b.connect(s1, '1', a, '1');
    b.connect(s2, '1', c, '1');
    b.connect(a, '2', lv, '1a');
    b.connect(c, '2', lv, '1b');
    b.connect(lv, '2', g, '1');
    const sim = new Simulation(b.circuit);
    const out = (pa: boolean, pc: boolean) => {
      sim.userAction(a, pa ? 'press' : 'release');
      sim.userAction(c, pc ? 'press' : 'release');
      sim.advance(0.4);
      return sim.state(g).bar > 3;
    };
    return out;
  }

  it('selectora (O): hay salida si llega aire por cualquiera de las entradas', () => {
    const out = logic('pneu-shuttle-or');
    expect([out(false, false), out(true, false), out(false, true), out(true, true)]).toEqual([
      false,
      true,
      true,
      true,
    ]);
  });

  it('simultaneidad (Y): sólo hay salida si llega aire por las dos entradas', () => {
    const out = logic('pneu-shuttle-and');
    expect([out(false, false), out(true, false), out(false, true), out(true, true)]).toEqual([
      false,
      false,
      false,
      true,
    ]);
  });

  it('antirretorno: deja pasar de 1 a 2 y bloquea de 2 a 1', () => {
    const run = (from: '1' | '2') => {
      const b = new CircuitBuilder();
      const ck = b.add('pneu-check', 300, 200);
      const src = b.add('pneu-supply', 300, 400);
      const g = b.add('pneu-gauge', 300, 50);
      b.connect(src, '1', ck, from);
      b.connect(ck, from === '1' ? '2' : '1', g, '1');
      const sim = new Simulation(b.circuit);
      sim.advance(0.3);
      return sim.state(g).bar;
    };
    expect(run('1')).toBeGreaterThan(5.5);
    expect(run('2')).toBeLessThan(0.1);
  });

  it('escape rápido: el cilindro retrocede antes', () => {
    const tIn = (quick: boolean) => {
      const { b, act, valve } = drive52('pneu-cyl-double', { mass: 2 }, (bb, v, a) => {
        if (quick) {
          const qe = bb.add('pneu-quick-exhaust', 200, 200);
          bb.connect(v, '4', qe, '1');
          bb.connect(qe, '2', a, '1');
        } else bb.connect(v, '4', a, '1');
        bb.connect(v, '2', a, '2');
      });
      for (const c of Object.values(b.circuit.components))
        if (c.type === 'pneu-valve-52') c.params = { qn: 80 };
      const sim = new Simulation(b.circuit);
      sim.advance(0.2);
      sim.userAction(valve, 'press');
      timeUntil(sim, () => sim.state(act).pos > 0.999);
      sim.advance(0.3);
      sim.userAction(valve, 'release');
      return timeUntil(sim, () => sim.state(act).pos < 0.01);
    };
    expect(tIn(true)).toBeLessThan(tIn(false) * 0.8);
  });
});

describe('caudal y presión', () => {
  it('estranguladora antirretorno en el escape: menos apertura, avance más lento', () => {
    const tOut = (pct: number) => {
      const { b, act, valve } = drive52('pneu-cyl-double', {}, (bb, v, a) => {
        const fc = bb.add('pneu-throttle-oneway', 400, 200, { pct });
        bb.connect(v, '4', a, '1');
        bb.connect(v, '2', fc, '1'); // paso libre hacia el cilindro
        bb.connect(fc, '2', a, '2'); // el escape del cilindro sale estrangulado
      });
      const sim = new Simulation(b.circuit);
      sim.advance(0.3);
      sim.userAction(valve, 'press');
      return timeUntil(sim, () => sim.state(act).pos > 0.99);
    };
    expect(tOut(5)).toBeGreaterThan(tOut(60) * 2);
  });

  it('reguladora y unidad de mantenimiento mantienen la presión ajustada', () => {
    for (const type of ['pneu-regulator', 'pneu-frl']) {
      const b = new CircuitBuilder();
      const r = b.add(type, 300, 200, { pset: 3.5 });
      const src = b.add('pneu-supply', 100, 300);
      const g = b.add('pneu-gauge', 500, 100);
      b.connect(src, '1', r, '1');
      b.connect(r, '2', g, '1');
      const sim = new Simulation(b.circuit);
      sim.advance(1);
      expect(sim.state(g).bar, type).toBeGreaterThan(3.2);
      expect(sim.state(g).bar, type).toBeLessThan(3.8);
    }
  });

  it('limitadora: no deja que la presión supere el tarado', () => {
    const b = new CircuitBuilder();
    const thr = b.add('pneu-throttle', 200, 200, { pct: 20 });
    const rv = b.add('pneu-relief', 400, 200, { pset: 3, qn: 1500 });
    const src = b.add('pneu-supply', 200, 400);
    const g = b.add('pneu-gauge', 300, 50);
    b.connect(src, '1', thr, '1');
    const w = b.connect(thr, '2', rv, '1');
    b.tee(w, 300, 140, g, '1');
    const sim = new Simulation(b.circuit);
    sim.advance(1);
    expect(sim.state(g).bar).toBeGreaterThan(2.8);
    expect(sim.state(g).bar).toBeLessThan(3.6);
  });

  it('temporizador: la salida aparece aproximadamente con el retardo ajustado', () => {
    const b = new CircuitBuilder();
    const tm = b.add('pneu-timer', 300, 200, { delay: 1 });
    const out = b.add('pneu-gauge', 330, 60);
    const src = b.add('pneu-supply', 300, 400);
    b.connect(tm, '2', out, '1');
    const btn = b.add('pneu-valve-32nc', 100, 300, { actLeft: 'lever' });
    const feed = b.connect(src, '1', tm, '1');
    b.tee(feed, 300, 330, btn, '1');
    b.connect(btn, '2', tm, '12');
    const sim = new Simulation(b.circuit);
    sim.advance(0.3);
    sim.userAction(btn, 'press');
    sim.userAction(btn, 'release');
    const t = timeUntil(sim, () => sim.state(tm).portBar['2'] > 3, 5);
    expect(t).toBeGreaterThan(0.6);
    expect(t).toBeLessThan(1.6);
    // Al quitar la señal se rearma enseguida.
    sim.userAction(btn, 'press');
    sim.userAction(btn, 'release');
    expect(timeUntil(sim, () => sim.state(tm).portBar['2'] < 0.5, 1)).toBeLessThan(0.3);
  });
});

describe('alimentación e instrumentos', () => {
  it('compresor: el presostato lo arranca al consumir y lo para al llegar al máximo', () => {
    const b = new CircuitBuilder();
    const comp = b.add('pneu-compressor', 300, 300, { pOn: 6, pOff: 7, liters: 1, q: 300 });
    const thr = b.add('pneu-throttle', 300, 150, { pct: 30 });
    b.connect(comp, '1', thr, '1'); // la salida 2 del estrangulador queda abierta: consumo constante
    const sim = new Simulation(b.circuit);
    sim.advance(0.05);
    expect(sim.state(comp).running).toBe(false);
    let started = false;
    let stopped = false;
    timeUntil(
      sim,
      () => {
        if (sim.state(comp).running) started = true;
        else if (started) stopped = true;
        return stopped;
      },
      30,
    );
    expect(started).toBe(true);
    expect(stopped).toBe(true);
  });

  it('caudalímetro y depósito', () => {
    const b = new CircuitBuilder();
    const fm = b.add('pneu-flowmeter', 300, 300);
    const tank = b.add('pneu-tank', 300, 100, { liters: 2 });
    const g = b.add('pneu-gauge', 450, 50);
    b.connect(tank, '2', g, '1');
    const src = b.add('pneu-supply', 300, 450);
    b.connect(src, '1', fm, '1');
    b.connect(fm, '2', tank, '1');
    const sim = new Simulation(b.circuit);
    sim.advance(0.05);
    expect(sim.state(fm).lmin).toBeGreaterThan(50);
    sim.advance(5);
    expect(sim.state(tank).bar).toBeGreaterThan(5.5);
    expect(Math.abs(sim.state(fm).lmin)).toBeLessThan(5);
  });
});

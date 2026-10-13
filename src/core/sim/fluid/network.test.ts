import { describe, expect, it } from 'vitest';
import { P_ATM, barGaugeToPa, cm3, paToBarGauge } from '../../units';
import { FluidNetwork, iso6358MassFlow } from './network';

describe('iso6358MassFlow', () => {
  it('en régimen sónico el caudal no depende de la presión aguas abajo', () => {
    const C = 1e-8;
    const a = iso6358MassFlow(7e5, 1e5, C, 0.3);
    const b = iso6358MassFlow(7e5, 2e5, C, 0.3);
    expect(a).toBeCloseTo(b, 12);
    expect(a).toBeCloseTo(C * 7e5 * 1.185, 12);
  });
  it('es cero sin diferencia de presión y crece con ella en régimen subsónico', () => {
    expect(iso6358MassFlow(5e5, 5e5, 1e-8, 0.3)).toBe(0);
    expect(iso6358MassFlow(5e5, 4.9e5, 1e-8, 0.3)).toBeLessThan(
      iso6358MassFlow(5e5, 4e5, 1e-8, 0.3),
    );
  });
});

describe('FluidNetwork', () => {
  it('dos depósitos cerrados igualan presiones y conservan la masa', () => {
    const net = new FluidNetwork();
    const a = net.addNode({ volume: cm3(50) });
    const b = net.addNode({ volume: cm3(150) });
    net.addOrifice(a, b, 5e-9);
    net.initMasses();
    // Cargamos el depósito A a 6 bar.
    net.nodes[a].mass *= barGaugeToPa(6) / P_ATM;
    const m0 = net.totalFreeMass();
    for (let i = 0; i < 20000; i++) {
      net.beginStep();
      net.integrate(1e-4);
    }
    expect(net.totalFreeMass()).toBeCloseTo(m0, 12);
    expect(net.nodes[a].p).toBeCloseTo(net.nodes[b].p, -1);
    // Isotermo: p_final = (6+1)·50/200 + 1·150/200 bar abs
    const expected = (barGaugeToPa(6) * 50 + P_ATM * 150) / 200;
    expect(net.nodes[a].p).toBeCloseTo(expected, -2);
  });

  it('un volumen alimentado desde una fuente alcanza su presión sin oscilar', () => {
    const net = new FluidNetwork();
    const src = net.addNode({ fixedPressure: barGaugeToPa(6) });
    const v = net.addNode({ volume: cm3(2) });
    net.addOrifice(src, v, 3e-8);
    net.initMasses();
    let prev = -Infinity;
    for (let i = 0; i < 2000; i++) {
      net.beginStep();
      net.integrate(1e-4);
      expect(net.nodes[v].p).toBeGreaterThanOrEqual(prev - 1e-6);
      prev = net.nodes[v].p;
    }
    expect(paToBarGauge(net.nodes[v].p)).toBeCloseTo(6, 2);
  });
});

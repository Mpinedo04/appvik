import { describe, expect, it } from 'vitest';
import {
  barGaugeToPa,
  BETA_OIL,
  cm3,
  oilKFromNominalFlow,
  paToBarGauge,
  RHO_OIL,
} from '../../units';
import { FluidNetwork, oilFlow } from './network';

describe('red con aceite', () => {
  it('el caudal nominal sale a 5 bar y es laminar cerca de Δp = 0', () => {
    const K = oilKFromNominalFlow(20);
    expect(oilFlow(5e5, K) * 60_000).toBeCloseTo(20, 6);
    expect(oilFlow(-5e5, K) * 60_000).toBeCloseTo(-20, 6);
    // Lineal por debajo de 1 bar: la mitad de salto, la mitad de caudal.
    expect(oilFlow(2e4, K) / oilFlow(4e4, K)).toBeCloseTo(0.5, 6);
  });

  it('dos volúmenes pequeños se igualan sin oscilar y conservan la masa', () => {
    const net = new FluidNetwork();
    const a = net.addNode({ kind: 'oil', volume: cm3(1), initialPressure: barGaugeToPa(100) });
    const b = net.addNode({ kind: 'oil', volume: cm3(1) });
    net.addOrifice(a, b, oilKFromNominalFlow(50), 0, 'o', 'oil');
    net.initMasses();
    const m0 = net.totalFreeMass();
    let prevDiff = Infinity;
    for (let i = 0; i < 2000; i++) {
      net.integrate(1e-4);
      const diff = net.nodes[a].p - net.nodes[b].p;
      // Nunca cambia de signo ni crece (sin oscilaciones numéricas).
      expect(diff).toBeGreaterThanOrEqual(-1);
      expect(diff).toBeLessThanOrEqual(prevDiff + 1);
      prevDiff = diff;
    }
    expect(net.totalFreeMass()).toBeCloseTo(m0, 9);
    expect(paToBarGauge(net.nodes[a].p)).toBeCloseTo(50, 0);
  });

  it('una bomba en un volumen cerrado sube la presión según β (q·dt/V)', () => {
    const net = new FluidNetwork();
    const p = net.addNode({ kind: 'oil', volume: cm3(100) });
    const src = net.addSource(net.atmosphere, p);
    net.initMasses();
    const q = 10 / 60_000; // 10 l/min
    net.sources[src].mdot = q * RHO_OIL;
    const t = 0.01;
    for (let i = 0; i < t / 1e-4; i++) net.integrate(1e-4);
    // Δp ≈ β·ΔV/V
    expect(paToBarGauge(net.nodes[p].p)).toBeCloseTo((BETA_OIL * q * t) / cm3(100) / 1e5, 0);
  });
});

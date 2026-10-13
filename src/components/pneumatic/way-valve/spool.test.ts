import { describe, expect, it } from 'vitest';
import { ALL_WAY_VALVES } from '../../models';
import { VALVE_32NC, VALVE_52, VALVE_53_EXHAUST } from './config';
import { boxGroups, expectedGroups, solveSpool, spoolLands } from './spool';

describe('corredera real', () => {
  for (const { cfg } of ALL_WAY_VALVES) {
    it(`${cfg.type}: cada casilla comunica exactamente sus vías`, () => {
      expect(cfg.spool, 'corredera precalculada').toBeDefined();
      const sol = solveSpool(cfg);
      cfg.positions.forEach((_, i) =>
        expect(boxGroups(cfg, sol, i), `casilla ${i}`).toBe(expectedGroups(cfg, i)),
      );
      for (const p of cfg.ports) expect(sol.bore).toContain(p.id);
      expect(spoolLands(cfg, sol).length).toBeGreaterThanOrEqual(2);
      // El accionamiento izquierdo empuja la corredera hacia la derecha.
      expect(sol.stroke).toBeGreaterThan(0);
    });
  }

  it('la búsqueda encuentra la corredera de una válvula sin datos precalculados', () => {
    for (const base of [VALVE_32NC, VALVE_52, VALVE_53_EXHAUST]) {
      const cfg = { ...base, spool: undefined };
      const sol = solveSpool(cfg);
      cfg.positions.forEach((_, i) => expect(boxGroups(cfg, sol, i)).toBe(expectedGroups(cfg, i)));
      expect({ bore: sol.bore, lands: sol.lands, stroke: sol.stroke }).toEqual(base.spool);
    }
  });
});

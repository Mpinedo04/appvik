import { describe, expect, it } from 'vitest';
import { ElectricNetwork } from './network';

/** +24 V ─ contacto(s) ─ carga ─ 0 V */
function rig() {
  const n = new ElectricNetwork();
  const plus = n.addNode();
  const zero = n.addNode();
  n.addRail(plus, '+24');
  n.addRail(zero, '0');
  return { n, plus, zero };
}

describe('red eléctrica', () => {
  it('serie: la carga sólo se energiza con todos los contactos cerrados', () => {
    const { n, plus, zero } = rig();
    const a = n.addNode();
    const b = n.addNode();
    const c1 = n.addContact(plus, a);
    const c2 = n.addContact(a, b);
    const load = n.addLoad(b, zero);
    n.solve();
    expect(n.energized[load]).toBe(false);
    n.setContact(c1, true);
    n.solve();
    expect(n.energized[load]).toBe(false);
    expect(n.level[a]).toBe(1);
    expect(n.level[b]).toBe(0);
    n.setContact(c2, true);
    n.solve();
    expect(n.energized[load]).toBe(true);
    expect(n.level[b]).toBe(1);
  });

  it('paralelo: basta un contacto; la carga funciona en cualquier sentido', () => {
    const { n, plus, zero } = rig();
    const a = n.addNode();
    n.addContact(plus, a);
    const c2 = n.addContact(plus, a);
    const load = n.addLoad(zero, a);
    n.setContact(c2, true);
    n.solve();
    expect(n.energized[load]).toBe(true);
  });

  it('cortocircuito: +24 V unido a 0 V apaga todo', () => {
    const { n, plus, zero } = rig();
    const a = n.addNode();
    const c = n.addContact(plus, a);
    const load = n.addLoad(a, zero);
    const sc = n.addContact(a, zero);
    n.setContact(c, true);
    n.solve();
    expect(n.energized[load]).toBe(true);
    n.setContact(sc, true);
    n.solve();
    expect(n.short).toBe(true);
    expect(n.energized[load]).toBe(false);
  });

  it('una carga con un borne al aire no se energiza y su nodo queda sin tensión', () => {
    const { n, plus } = rig();
    const a = n.addNode();
    const load = n.addLoad(plus, a);
    n.solve();
    expect(n.energized[load]).toBe(false);
    expect(n.level[a]).toBe(0);
  });

  it('autorretención: el contacto propio mantiene la bobina al soltar el pulsador', () => {
    const { n, plus, zero } = rig();
    const a = n.addNode();
    const start = n.addContact(plus, a);
    const hold = n.addContact(plus, a);
    const coil = n.addLoad(a, zero);
    n.setContact(start, true);
    n.solve();
    expect(n.energized[coil]).toBe(true);
    // El relé cierra su contacto y después se suelta el pulsador.
    n.setContact(hold, true);
    n.setContact(start, false);
    n.solve();
    expect(n.energized[coil]).toBe(true);
  });
});

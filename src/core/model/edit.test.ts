import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllModels } from '../../components/models';
import { Simulation } from '../sim/engine';
import { CircuitBuilder } from './builder';
import {
  addComponent,
  connect,
  extractSubcircuit,
  moveItems,
  pasteSubcircuit,
  removeItems,
  rotateItems,
  validate,
} from './edit';
import { connectionPolyline, endpointGeom } from './geometry';

beforeAll(registerAllModels);

function last<T>(a: T[]) {
  return a[a.length - 1];
}

describe('edición de circuitos', () => {
  it('las tuberías trazadas son ortogonales y empiezan y acaban en los puertos', () => {
    const b = new CircuitBuilder();
    const v = b.add('pneu-valve-52', 200, 250);
    const cyl = b.add('pneu-cyl-double', 300, 100);
    const w = b.connect(v, '4', cyl, '1');
    const poly = connectionPolyline(b.circuit, w);
    for (let i = 1; i < poly.length; i++) {
      expect(poly[i].x === poly[i - 1].x || poly[i].y === poly[i - 1].y).toBe(true);
    }
    expect(poly[0]).toEqual(endpointGeom(b.circuit, { kind: 'port', comp: v, port: '4' })!.pos);
    expect(last(poly)).toEqual(
      endpointGeom(b.circuit, { kind: 'port', comp: cyl, port: '1' })!.pos,
    );
  });

  it('rechaza conexiones duplicadas y de un puerto consigo mismo', () => {
    const b = new CircuitBuilder();
    const v = b.add('pneu-valve-52', 200, 250);
    const s = b.add('pneu-supply', 230, 380);
    b.connect(s, '1', v, '1');
    expect(
      connect(b.circuit, { kind: 'port', comp: v, port: '1' }, { kind: 'port', comp: s, port: '1' })
        .ok,
    ).toBe(false);
    expect(
      connect(b.circuit, { kind: 'port', comp: v, port: '1' }, { kind: 'port', comp: v, port: '1' })
        .ok,
    ).toBe(false);
  });

  it('una derivación en T une los tres extremos en el mismo nodo de presión', () => {
    const b = new CircuitBuilder();
    const v = b.add('pneu-valve-52', 200, 250);
    const s = b.add('pneu-supply', 230, 380);
    const g = b.add('pneu-gauge', 320, 330);
    const w = b.connect(s, '1', v, '1');
    b.tee(w, 230, 320, g, '1');
    expect(Object.keys(b.circuit.junctions)).toHaveLength(1);
    expect(Object.keys(b.circuit.connections)).toHaveLength(3);
    const sim = new Simulation(b.circuit);
    sim.advance(0.3);
    expect(sim.state(g).bar).toBeGreaterThan(5.8);
  });

  it('al borrar el manómetro la derivación desaparece y la tubería vuelve a ser una', () => {
    const b = new CircuitBuilder();
    const v = b.add('pneu-valve-52', 200, 250);
    const s = b.add('pneu-supply', 230, 380);
    const g = b.add('pneu-gauge', 320, 330);
    const w = b.connect(s, '1', v, '1');
    b.tee(w, 230, 320, g, '1');
    removeItems(b.circuit, [g], []);
    expect(Object.keys(b.circuit.junctions)).toHaveLength(0);
    const conns = Object.values(b.circuit.connections);
    expect(conns).toHaveLength(1);
    expect([conns[0].a, conns[0].b].map((e) => (e.kind === 'port' ? e.comp : '')).sort()).toEqual(
      [s, v].sort(),
    );
  });

  it('mover un componente vuelve a trazar sus tuberías', () => {
    const b = new CircuitBuilder();
    const v = b.add('pneu-valve-52', 200, 250);
    const s = b.add('pneu-supply', 230, 380);
    const w = b.connect(s, '1', v, '1');
    const base = structuredClone(b.circuit);
    moveItems(b.circuit, base, [s], [], 100, 40);
    const poly = connectionPolyline(b.circuit, w);
    expect(poly[0]).toEqual({ x: 330, y: 400 });
    for (let i = 1; i < poly.length; i++)
      expect(poly[i].x === poly[i - 1].x || poly[i].y === poly[i - 1].y).toBe(true);
  });

  it('girar 90° mueve los puertos', () => {
    const b = new CircuitBuilder();
    const g = b.add('pneu-gauge', 100, 100);
    rotateItems(b.circuit, [g]);
    expect(endpointGeom(b.circuit, { kind: 'port', comp: g, port: '1' })).toEqual({
      pos: { x: 70, y: 100 },
      dir: 'left',
    });
  });

  it('copiar y pegar crea etiquetas nuevas y mantiene las conexiones internas', () => {
    const b = new CircuitBuilder();
    const v = b.add('pneu-valve-52', 200, 250);
    const cyl = b.add('pneu-cyl-double', 300, 100);
    b.connect(v, '4', cyl, '1');
    const sub = extractSubcircuit(b.circuit, [v, cyl]);
    const ids = pasteSubcircuit(b.circuit, sub, 300, 0);
    expect(ids).toHaveLength(2);
    expect(Object.keys(b.circuit.connections)).toHaveLength(2);
    const labels = Object.values(b.circuit.components)
      .map((c) => c.label)
      .sort();
    expect(labels).toEqual(['1A', '1V1', '1V2', '2A']);
  });

  it('valida puertos abiertos ignorando los escapes', () => {
    const b = new CircuitBuilder();
    addComponent(b.circuit, 'pneu-valve-52', 0, 0);
    const issues = validate(b.circuit);
    expect(issues.map((i) => i.port).sort()).toEqual(['1', '2', '4']);
  });
});

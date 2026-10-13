/** Construcción programática de circuitos (tests, ejemplos). */
import { addComponent, connect, nearestOnConnection, splitConnection } from './edit';
import { renumber } from './labels';
import { emptyCircuit, type Circuit, type Endpoint, type Params, type Rotation } from './types';

const port = (comp: string, p: string): Endpoint => ({ kind: 'port', comp, port: p });

export class CircuitBuilder {
  readonly circuit: Circuit = emptyCircuit();

  add(
    type: string,
    x: number,
    y: number,
    params: Params = {},
    opts: { rot?: Rotation; flip?: boolean; label?: string } = {},
  ) {
    const id = addComponent(this.circuit, type, x, y, params);
    const c = this.circuit.components[id];
    if (opts.rot) c.rot = opts.rot;
    if (opts.flip) c.flip = true;
    if (opts.label) c.label = opts.label;
    return id;
  }

  connect(compA: string, portA: string, compB: string, portB: string) {
    const r = connect(this.circuit, port(compA, portA), port(compB, portB));
    if (!r.ok) throw new Error(r.reason);
    return r.id;
  }

  /** Conecta un puerto a una tubería existente creando una derivación en el punto dado. */
  tee(connId: string, x: number, y: number, comp: string, portId: string) {
    const j = splitConnection(this.circuit, connId, { x, y });
    const r = connect(this.circuit, { kind: 'junction', id: j }, port(comp, portId));
    if (!r.ok) throw new Error(r.reason);
    return r.id;
  }

  /** Deriva desde la tubería más cercana al punto (x, y). */
  teeAt(x: number, y: number, comp: string, portId: string) {
    let best = { id: '', d: Infinity };
    for (const id of Object.keys(this.circuit.connections)) {
      const { d } = nearestOnConnection(this.circuit, id, { x, y });
      if (d < best.d) best = { id, d };
    }
    if (!best.id) throw new Error('No hay tuberías para derivar');
    return this.tee(best.id, x, y, comp, portId);
  }

  /** Etiqueta todo según la norma (1A, 1V1, 1S1…). */
  renumber() {
    renumber(this.circuit);
    return this;
  }
}

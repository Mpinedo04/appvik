/** Construcción programática de circuitos (tests, ejemplos). */
import { addComponent, connect, splitConnection } from './edit';
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
}

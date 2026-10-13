/**
 * Caudal por tubería a partir de los caudales medidos en los puertos.
 * En el modelo concentrado toda una red es un único nodo, así que el caudal por cada
 * tubería se estima con el extremo que más caudal mide (normalmente el lado de la válvula).
 */
import type { Circuit, Endpoint } from '../model/types';
import { portKey } from './compiler';
import type { SimSnapshot } from './engine';

/** Caudal másico de cada tubería [kg/s]; positivo en el sentido a → b de la conexión. */
export function connectionFlows(
  circuit: Circuit,
  snap: Pick<SimSnapshot, 'portFlow'>,
): Record<string, number> {
  const out: Record<string, number> = {};
  const flowAt = (e: Endpoint) =>
    e.kind === 'port' ? (snap.portFlow[portKey(e.comp, e.port)] ?? 0) : 0;
  for (const c of Object.values(circuit.connections)) {
    // Caudal que entra al componente del extremo a ⇒ en la tubería circula b → a.
    const fromA = -flowAt(c.a);
    const fromB = flowAt(c.b);
    out[c.id] = Math.abs(fromA) >= Math.abs(fromB) ? fromA : fromB;
  }
  return out;
}

/**
 * Etiquetado según la práctica habitual (ISO 1219-2):
 *   0Z…  alimentación (fuente, compresor, unidad de mantenimiento, depósito)
 *   nA   actuador n (ordenados de izquierda a derecha)
 *   nV1  válvula de potencia que manda al actuador n
 *   nV2… elementos entre la válvula y el actuador (reguladoras, escape rápido…) y lógicas
 *   nS…  elementos de señal (pulsadores, finales de carrera) de la cadena del actuador n
 * Las válvulas de rodillo toman la etiqueta de la marca que las acciona (p. ej. 1S2).
 * Lo que no pertenece a ninguna cadena se numera como 0V… / 0S…
 */
import { getModel, resolveParams } from '../registry';
import { endpointKey, type Circuit } from './types';

const SUPPLY_TYPES = new Set(['pneu-supply', 'pneu-compressor', 'pneu-frl', 'pneu-tank']);
const INSTRUMENT_CATS = new Set(['instruments']);
/** Los componentes eléctricos llevan como etiqueta su enlace (K1, Y1, 1B1…): no se renumeran. */
const ELECTRIC_CATS = new Set(['electric', 'relays', 'electric-sensors']);

function isRollerValve(circuit: Circuit, id: string) {
  const c = circuit.components[id];
  const p = resolveParams(getModel(c.type), c.params);
  return [p.actLeft, p.actRight].some((a) => a === 'roller' || a === 'roller-oneway');
}

/** Componentes vecinos (comparten red neumática) de cada componente. */
export function adjacency(circuit: Circuit): Map<string, Set<string>> {
  const parent = new Map<string, string>();
  const find = (k: string): string => {
    if (!parent.has(k)) parent.set(k, k);
    let r = k;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(k, r);
    return r;
  };
  for (const w of Object.values(circuit.connections)) {
    // Sólo la red neumática: los cables eléctricos no forman parte de las cadenas de mando.
    if (w.medium !== 'pneu') continue;
    const a = find(endpointKey(w.a));
    const b = find(endpointKey(w.b));
    if (a !== b) parent.set(a, b);
  }
  const byNet = new Map<string, Set<string>>();
  for (const c of Object.values(circuit.components)) {
    const m = getModel(c.type);
    for (const p of m.ports(resolveParams(m, c.params))) {
      if (p.medium !== 'pneu') continue;
      const net = find(endpointKey({ kind: 'port', comp: c.id, port: p.id }));
      if (!byNet.has(net)) byNet.set(net, new Set());
      byNet.get(net)!.add(c.id);
    }
  }
  const adj = new Map<string, Set<string>>();
  for (const c of Object.keys(circuit.components)) adj.set(c, new Set());
  for (const comps of byNet.values())
    for (const a of comps) for (const b of comps) if (a !== b) adj.get(a)!.add(b);
  return adj;
}

/** Calcula las etiquetas nuevas (no modifica el circuito). */
export function computeLabels(circuit: Circuit): Record<string, string> {
  const cat = (id: string) => getModel(circuit.components[id].type).category;
  const comps = Object.values(circuit.components).filter((c) => !ELECTRIC_CATS.has(cat(c.id)));
  const adj = adjacency(circuit);
  const labels: Record<string, string> = {};
  const assigned = new Set<string>();
  // Las etiquetas de los rodillos vienen dadas por sus marcas: se reservan.
  const used = new Set<string>();
  for (const c of comps)
    if (isRollerValve(circuit, c.id)) {
      const sensor = String(resolveParams(getModel(c.type), c.params).sensor ?? '');
      if (sensor) used.add(sensor);
    }
  const nextFree = (make: (k: number) => string, from: { k: number }) => {
    while (used.has(make(from.k))) from.k++;
    const l = make(from.k++);
    used.add(l);
    return l;
  };

  const byPos = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    a.x - b.x || a.y - b.y;

  // Alimentación
  comps
    .filter((c) => SUPPLY_TYPES.has(c.type) || c.type === 'pneu-silencer')
    .sort(byPos)
    .forEach((c, i) => {
      labels[c.id] = `0Z${i + 1}`;
      assigned.add(c.id);
    });

  // Cadenas de cada actuador
  const actuators = comps.filter((c) => cat(c.id) === 'actuators').sort(byPos);
  actuators.forEach((a, i) => {
    const n = i + 1;
    labels[a.id] = `${n}A`;
    assigned.add(a.id);
  });
  actuators.forEach((a, i) => {
    const n = i + 1;
    // Recorrido en anchura desde el actuador, sin atravesar alimentación ni otros actuadores.
    const dist = new Map<string, number>([[a.id, 0]]);
    const queue = [a.id];
    while (queue.length) {
      const cur = queue.shift()!;
      for (const nb of adj.get(cur) ?? []) {
        if (dist.has(nb)) continue;
        const c = circuit.components[nb];
        if (SUPPLY_TYPES.has(c.type) || cat(nb) === 'actuators' || ELECTRIC_CATS.has(cat(nb)))
          continue;
        dist.set(nb, dist.get(cur)! + 1);
        queue.push(nb);
      }
    }
    const reach = [...dist.entries()]
      .filter(([id]) => id !== a.id && !assigned.has(id) && !INSTRUMENT_CATS.has(cat(id)))
      .sort((x, y) => x[1] - y[1] || byPos(circuit.components[x[0]], circuit.components[y[0]]));
    const power = reach.find(([id]) => cat(id) === 'directional' && !isRollerValve(circuit, id));
    const powerDist = power ? power[1] : Infinity;
    const v = { k: 1 };
    const sIdx = { k: 1 };
    if (power) {
      labels[power[0]] = nextFree((k) => `${n}V${k}`, v);
      assigned.add(power[0]);
    }
    for (const [id, d] of reach) {
      if (assigned.has(id)) continue;
      const c = cat(id);
      const signal =
        c === 'sensors' || (c === 'directional' && d > powerDist) || isRollerValve(circuit, id);
      if (signal) {
        const sensor = String(
          resolveParams(getModel(circuit.components[id].type), circuit.components[id].params)
            .sensor ?? '',
        );
        labels[id] =
          isRollerValve(circuit, id) && sensor ? sensor : nextFree((k) => `${n}S${k}`, sIdx);
      } else {
        labels[id] = nextFree((k) => `${n}V${k}`, v);
      }
      assigned.add(id);
    }
  });

  // Resto
  const v0 = { k: 1 };
  const s0 = { k: 1 };
  for (const c of comps.sort(byPos)) {
    if (assigned.has(c.id) || INSTRUMENT_CATS.has(cat(c.id))) continue;
    const sensor = isRollerValve(circuit, c.id)
      ? String(resolveParams(getModel(c.type), c.params).sensor ?? '')
      : '';
    if (sensor) {
      labels[c.id] = sensor;
      continue;
    }
    labels[c.id] =
      cat(c.id) === 'sensors' ? nextFree((k) => `0S${k}`, s0) : nextFree((k) => `0V${k}`, v0);
  }
  return labels;
}

/** Aplica el renumerado al circuito (funciona sobre borradores de Immer). */
export function renumber(circuit: Circuit) {
  const labels = computeLabels(circuit);
  for (const [id, label] of Object.entries(labels)) circuit.components[id].label = label;
}

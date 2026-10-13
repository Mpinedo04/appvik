/**
 * Geometría de la corredera real de una válvula de vías, deducida de su configuración.
 *
 * El cuerpo tiene un taladro con una ranura anular por cada «estación» (un puerto puede tener
 * varias, unidas por dentro). La corredera lleva resaltes con junta que separan o tapan las
 * ranuras. Al desplazarse una carrera por casilla, los puertos que comparten el hueco entre dos
 * resaltes quedan comunicados. `solveSpool` busca la corredera más sencilla (menos resaltes)
 * cuya conexión coincide exactamente, casilla a casilla, con las vías de la configuración.
 *
 * Todo se calcula en medios pasos de ranura (`h`): la estación j está en h = 2j; un resalte en
 * h par tapa la ranura, en h impar separa las dos vecinas.
 */
import type { WayValveConfig } from './config';

/** Paso entre ranuras del taladro por defecto (unidades de dibujo). */
export const PITCH = 12;
/** Anchura de una ranura y de un resalte, en fracción del paso. */
export const GROOVE_FRAC = 0.33;
export const LAND_FRAC = 0.46;

export interface SpoolSolution {
  /** Puertos a lo largo del taladro, de izquierda a derecha. */
  bore: string[];
  /** Paso entre ranuras (unidades de dibujo). */
  pitch: number;
  /** Posición x (local, en reposo) de cada estación. */
  stationX: number[];
  /** Resaltes de la corredera en reposo, en medios pasos respecto a la estación 0. */
  lands: number[];
  /** Desplazamiento por casilla en medios pasos (con signo): casilla i → (rest − i)·stroke. */
  stroke: number;
}

function partitionKey(ports: string[], groups: string[][]): string {
  const parent = new Map(ports.map((p) => [p, p]));
  const find = (p: string): string => {
    while (parent.get(p) !== p) p = parent.get(p)!;
    return p;
  };
  for (const g of groups)
    for (let i = 1; i < g.length; i++) {
      const a = find(g[0]);
      const b = find(g[i]);
      if (a !== b) parent.set(a, b);
    }
  const byRoot = new Map<string, string[]>();
  for (const p of ports) {
    const r = find(p);
    byRoot.set(r, [...(byRoot.get(r) ?? []), p]);
  }
  return [...byRoot.values()]
    .map((g) => g.sort().join('+'))
    .sort()
    .join('|');
}

/** Grupos de puertos comunicados entre sí (por huecos) con los resaltes en `lands` (h). */
function gapGroups(bore: string[], lands: number[]): string[][] | null {
  const sorted = [...lands].sort((a, b) => a - b);
  const groups: string[][] = [];
  for (let j = 0; j < bore.length; j++) {
    const h = 2 * j;
    if (sorted.includes(h)) continue; // tapada por un resalte
    // Fuera de los resaltes extremos: la ranura daría a la cámara del accionamiento.
    if (h < sorted[0] || h > sorted[sorted.length - 1]) return null;
    let gap = 0;
    while (gap < sorted.length && sorted[gap] < h) gap++;
    (groups[gap] ??= []).push(bore[j]);
  }
  return groups.filter(Boolean);
}

function targetKey(cfg: WayValveConfig, ports: string[], box: number): string {
  return partitionKey(ports, cfg.positions[box].paths);
}

function fits(
  cfg: WayValveConfig,
  bore: string[],
  lands: number[],
  stroke: number,
  targets: string[],
) {
  const ports = cfg.ports.map((p) => p.id);
  for (let i = 0; i < cfg.positions.length; i++) {
    const shift = (cfg.rest - i) * stroke;
    const groups = gapGroups(
      bore,
      lands.map((h) => h + shift),
    );
    if (!groups) return false;
    // Las estaciones repetidas de un mismo puerto están unidas por dentro.
    const dup = ports.map((p) => [p, ...bore.filter((b) => b === p)]);
    if (partitionKey(ports, [...groups, ...dup]) !== targets[i]) return false;
  }
  return true;
}

/** Recorre combinaciones de k elementos de `items` en orden. */
function* combinations(
  items: number[],
  k: number,
  start = 0,
  acc: number[] = [],
): Generator<number[]> {
  if (acc.length === k) {
    yield acc;
    return;
  }
  for (let i = start; i <= items.length - (k - acc.length); i++) {
    acc.push(items[i]);
    yield* combinations(items, k, i + 1, acc);
    acc.pop();
  }
}

function solveFor(
  cfg: WayValveConfig,
  bore: string[],
  k: number,
  strokes: number[],
): Omit<SpoolSolution, 'stationX' | 'pitch'> | null {
  const ports = cfg.ports.map((p) => p.id);
  const targets = cfg.positions.map((_, i) => targetKey(cfg, ports, i));
  const n = cfg.positions.length;
  const maxH = 2 * (bore.length - 1);
  for (const stroke of strokes) {
    const travel = Math.abs(stroke) * (n - 1);
    const range: number[] = [];
    for (let h = -travel - 1; h <= maxH + travel + 1; h++) range.push(h);
    for (const lands of combinations(range, k))
      if (fits(cfg, bore, lands, stroke, targets)) return { bore, lands: [...lands], stroke };
  }
  return null;
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((x, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((r) => [x, ...r]),
  );
}

function portX(cfg: WayValveConfig, id: string) {
  return cfg.boxW / 2 + cfg.ports.find((p) => p.id === id)!.col;
}

export function stationXs(cfg: WayValveConfig, bore: string[], pitch = PITCH) {
  return bore.map((_, j) => cfg.boxW / 2 + (j - (bore.length - 1) / 2) * pitch);
}

/** La misma corredera con otro paso entre ranuras (para que quepa en el sitio disponible). */
export function withPitch(cfg: WayValveConfig, sol: SpoolSolution, pitch: number): SpoolSolution {
  return { ...sol, pitch, stationX: stationXs(cfg, sol.bore, pitch) };
}

/** Estación a la que llega el conducto de cada puerto (la más cercana; el resto, por galería). */
export function mainStation(cfg: WayValveConfig, sol: SpoolSolution, id: string) {
  let best = -1;
  sol.bore.forEach((b, j) => {
    if (b !== id) return;
    if (
      best < 0 ||
      Math.abs(sol.stationX[j] - portX(cfg, id)) < Math.abs(sol.stationX[best] - portX(cfg, id))
    )
      best = j;
  });
  return best;
}

/** Los conductos de un mismo lado no se cruzan (tramos horizontales disjuntos). */
function channelsClear(cfg: WayValveConfig, bore: string[]) {
  const xs = stationXs(cfg, bore);
  for (const side of ['top', 'bottom'] as const) {
    const spans = cfg.ports
      .filter((p) => p.side === side)
      .map((p) => {
        let j = -1;
        bore.forEach((b, k) => {
          if (
            b === p.id &&
            (j < 0 || Math.abs(xs[k] - portX(cfg, p.id)) < Math.abs(xs[j] - portX(cfg, p.id)))
          )
            j = k;
        });
        const a = portX(cfg, p.id);
        return [Math.min(a, xs[j]), Math.max(a, xs[j])];
      })
      .sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < spans.length; i++) if (spans[i][0] <= spans[i - 1][1]) return false;
  }
  return true;
}

/** Desalineación total entre los racores y sus ranuras (se prefiere el orden más recto). */
function misalignment(cfg: WayValveConfig, bore: string[]) {
  const xs = stationXs(cfg, bore);
  return bore.reduce((s, b, j) => s + Math.abs(xs[j] - portX(cfg, b)), 0);
}

const cache = new WeakMap<WayValveConfig, SpoolSolution>();

export function solveSpool(cfg: WayValveConfig): SpoolSolution {
  const hit = cache.get(cfg);
  if (hit) return hit;
  if (cfg.spool) {
    const sol = { ...cfg.spool, pitch: PITCH, stationX: stationXs(cfg, cfg.spool.bore) };
    cache.set(cfg, sol);
    return sol;
  }
  const orders = permutations(cfg.ports.map((p) => p.id))
    .filter((b) => channelsClear(cfg, b))
    .sort((a, b) => misalignment(cfg, a) - misalignment(cfg, b));
  // Se prefiere que el accionamiento izquierdo empuje la corredera hacia la derecha (carrera
  // positiva); después, la corredera con menos resaltes en cualquier orden del taladro; a
  // igualdad, el orden en el que los conductos van más rectos y la carrera más corta.
  for (const strokes of [
    [2, 1, 3, 4],
    [-2, -1, -3, -4],
  ])
    for (let k = 2; k <= 6; k++)
      for (const bore of orders) {
        const r = solveFor(cfg, bore, k, strokes);
        if (r) {
          const sol = { ...r, pitch: PITCH, stationX: stationXs(cfg, bore) };
          cache.set(cfg, sol);
          return sol;
        }
      }
  throw new Error(`No hay corredera posible para ${cfg.type}`);
}

/** Grupos de puertos comunicados en cada casilla (para los tests y la explicación). */
export function boxGroups(cfg: WayValveConfig, sol: SpoolSolution, box: number): string {
  const ports = cfg.ports.map((p) => p.id);
  const shift = (cfg.rest - box) * sol.stroke;
  const groups =
    gapGroups(
      sol.bore,
      sol.lands.map((h) => h + shift),
    ) ?? [];
  const dup = ports.map((p) => [p, ...sol.bore.filter((b) => b === p)]);
  return partitionKey(ports, [...groups, ...dup]);
}

export const expectedGroups = (cfg: WayValveConfig, box: number) =>
  targetKey(
    cfg,
    cfg.ports.map((p) => p.id),
    box,
  );

/** Resaltes en coordenadas x locales (en reposo), con los contiguos unidos en uno ancho. */
export function spoolLands(cfg: WayValveConfig, sol: SpoolSolution): { x0: number; x1: number }[] {
  const toX = (h: number) => sol.stationX[0] + (h * sol.pitch) / 2;
  const w = sol.pitch * LAND_FRAC;
  const hs = [...sol.lands].sort((a, b) => a - b);
  const out: { x0: number; x1: number }[] = [];
  for (const h of hs) {
    const x0 = toX(h) - w / 2;
    const x1 = toX(h) + w / 2;
    const last = out[out.length - 1];
    if (last && x0 - last.x1 < sol.pitch / 2 - w + 0.01) last.x1 = x1;
    else out.push({ x0, x1 });
  }
  return out;
}

/** Desplazamiento de la corredera (unidades de dibujo) para la posición continua `pos`. */
export const spoolOffset = (cfg: WayValveConfig, sol: SpoolSolution, pos: number) =>
  ((cfg.rest - pos) * sol.stroke * sol.pitch) / 2;

/**
 * Puertos que toca cada hueco entre resaltes con la corredera desplazada `offset`
 * (cálculo continuo, para teñir las cámaras durante la conmutación).
 */
export function chamberPorts(
  sol: SpoolSolution,
  lands: { x0: number; x1: number }[],
  offset: number,
): string[][] {
  const out: string[][] = [];
  const g = (sol.pitch * GROOVE_FRAC) / 2;
  for (let i = 0; i < lands.length - 1; i++) {
    const g0 = lands[i].x1 + offset;
    const g1 = lands[i + 1].x0 + offset;
    out.push(
      sol.bore.filter((_, j) => {
        const x = sol.stationX[j];
        return x + g > g0 && x - g < g1;
      }),
    );
  }
  return out;
}

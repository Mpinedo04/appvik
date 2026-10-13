/**
 * Núcleo común de los actuadores lineales de doble cámara: fuerzas, amortiguación regulable,
 * marcas de final de carrera (señales para las válvulas de rodillo) y explicación.
 */
import type { Params } from '../../core/model/types';
import { num, str, type BuildCtx, type ParamDef, type StepCtx } from '../../core/registry';
import { stepPiston } from '../../core/sim/mechanics';
import { P_ATM, circleArea, cm3, mm, paToBarGauge } from '../../core/units';

export interface Mark {
  label: string;
  /** Posición del vástago [mm] desde la posición retraída. */
  mm: number;
}

/** Ventana de accionamiento de la leva sobre el rodillo [mm]. */
export const MARK_WINDOW_MM = 5;

/** «1S1@0; 1S2@100» → [{1S1, 0}, {1S2, 100}] */
export function parseMarks(text: string): Mark[] {
  return String(text ?? '')
    .split(/[;,\n]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => {
      const [label, pos] = t.split('@').map((x) => x.trim());
      return { label, mm: Number(pos) };
    })
    .filter((m) => m.label && Number.isFinite(m.mm));
}

export const marksParam: ParamDef = {
  key: 'marks',
  label: 'Marcas de final de carrera (etiqueta@mm)',
  type: 'text',
  default: '',
  placeholder: '1S1@0; 1S2@100',
  help: 'Las válvulas de rodillo con esa etiqueta se accionan cuando el vástago pasa por la marca.',
};

/**
 * Publica una señal por marca (1 si la leva está sobre el rodillo) y, aparte, el sentido del
 * movimiento al pasar (para los rodillos abatibles). Devuelve las etiquetas activas.
 */
export function publishMarks(ctx: StepCtx, marks: Mark[], xMm: number, v: number): string[] {
  const active: string[] = [];
  for (const m of marks) {
    const on = Math.abs(xMm - m.mm) <= MARK_WINDOW_MM;
    ctx.setSignal(m.label, on);
    ctx.setSignal(`${m.label}:dir`, on ? Math.sign(v) : 0);
    if (on) active.push(m.label);
  }
  return active;
}

export interface CylState {
  x: number;
  v: number;
  pos: number;
  pCap: number;
  pRod: number;
  force: number;
  /** Amortiguación actuando en cada extremo. */
  cushionCap: boolean;
  cushionRod: boolean;
  /** Marcas con la leva sobre el rodillo. */
  activeMarks: string[];
}

export const initCyl = (p: Params): CylState => {
  const stroke = mm(num(p, 'stroke'));
  const start = Number(p.startPos ?? 0) / 100;
  return {
    x: stroke * start,
    v: 0,
    pos: start,
    pCap: 0,
    pRod: 0,
    force: 0,
    cushionCap: false,
    cushionRod: false,
    activeMarks: [],
  };
};

export const cushionParams: ParamDef[] = [
  {
    key: 'cushion',
    label: 'Amortiguación de final de carrera',
    type: 'select',
    default: 'none',
    options: [
      { value: 'none', label: 'Sin amortiguación' },
      { value: 'adjustable', label: 'Regulable en ambos extremos' },
    ],
  },
  {
    key: 'cushionPct',
    label: 'Apertura del estrangulador de amortiguación',
    unit: '%',
    type: 'number',
    default: 15,
    min: 1,
    max: 100,
    step: 1,
    when: (p) => str(p, 'cushion') === 'adjustable',
  },
];

const DEAD_VOLUME = cm3(1);
const C_MAIN = 6e-8;
const C_THROTTLE_MAX = 4e-9;

interface ChamberHandles {
  port: number;
  /** Nodo de la cámara (igual que el del puerto si no hay amortiguación). */
  chamber: number;
  main: number | null;
  throttle: number | null;
}

export interface CylHandles {
  cap: ChamberHandles;
  rod: ChamberHandles;
  marks: Mark[];
}

function chamber(b: BuildCtx, portId: string, cushion: boolean, pct: number): ChamberHandles {
  const port = b.port(portId);
  if (!cushion) return { port, chamber: port, main: null, throttle: null };
  const ch = b.addNode({ name: `cámara ${portId}` });
  return {
    port,
    chamber: ch,
    main: b.addOrifice(port, ch, { C: C_MAIN }),
    throttle: b.addOrifice(port, ch, { C: (C_THROTTLE_MAX * pct) / 100 }),
  };
}

export function buildCyl(b: BuildCtx, p: Params, capPort = '1', rodPort = '2'): CylHandles {
  const cushion = str(p, 'cushion') === 'adjustable';
  const pct = Number(p.cushionPct ?? 15);
  return {
    cap: chamber(b, capPort, cushion, pct),
    rod: chamber(b, rodPort, cushion, pct),
    marks: parseMarks(String(p.marks ?? '')),
  };
}

/**
 * Paso común de un actuador de doble cámara. `aRod` = 0 para áreas iguales (sin vástago).
 * Las cámaras se modelan como parte del nodo del puerto o, con amortiguación, como nodos
 * propios unidos al puerto por el paso principal + el estrangulador de amortiguación.
 */
export function updateCyl(
  ctx: StepCtx,
  s: CylState,
  h: CylHandles,
  p: Params,
  dt: number,
  aCap: number,
  aRod: number,
) {
  const stroke = mm(num(p, 'stroke'));
  const pCap = ctx.p(h.cap.chamber);
  const pRod = ctx.p(h.rod.chamber);
  s.force = pCap * aCap - pRod * (aCap - aRod) - P_ATM * aRod;
  if (dt > 0) {
    stepPiston(
      s,
      {
        mass: num(p, 'mass'),
        stroke,
        // Fricción de las juntas aproximadamente proporcional al tamaño del émbolo.
        fStatic: 4 + aCap * 4e4,
        fCoulomb: 2 + aCap * 2.5e4,
        cViscous: 20 + aCap * 1e5,
      },
      s.force - Number(p.load ?? 0),
      dt,
    );
  }
  s.pos = stroke > 0 ? s.x / stroke : 0;
  s.pCap = paToBarGauge(pCap);
  s.pRod = paToBarGauge(pRod);

  // Amortiguación: cerca de cada extremo se cierra el paso principal de la cámara que se
  // vacía; el aire sólo sale por el estrangulador (la entrada es libre por la antirretorno).
  const lc = Math.min(mm(10), stroke / 4);
  const setMain = (c: ChamberHandles, inZone: boolean) => {
    if (c.main === null) return false;
    const filling = ctx.p(c.port) > ctx.p(c.chamber);
    const closed = inZone && !filling;
    ctx.setOpening(c.main, closed ? 0 : 1);
    return closed;
  };
  s.cushionCap = setMain(h.cap, s.x < lc);
  s.cushionRod = setMain(h.rod, s.x > stroke - lc);

  ctx.addVolume(h.cap.chamber, DEAD_VOLUME + aCap * s.x);
  ctx.addVolume(h.rod.chamber, DEAD_VOLUME + (aCap - aRod) * (stroke - s.x));
  s.activeMarks = publishMarks(ctx, h.marks, s.x * 1000, s.v);
}

/** Explicación común con nombres de cámara y de movimiento propios de cada actuador. */
export function explainCyl(
  s: CylState,
  p: Params,
  names: {
    cap: string;
    rod: string;
    plus: string;
    minus: string;
    endPlus: string;
    endMinus: string;
  },
): string[] {
  const lines = [
    `${names.cap}: ${s.pCap.toFixed(2)} bar · ${names.rod}: ${s.pRod.toFixed(2)} bar.`,
    `Fuerza neumática neta: ${s.force.toFixed(0)} N${num(p, 'load') ? ` (carga: ${num(p, 'load')} N)` : ''}.`,
  ];
  if (s.v > 0.002) lines.push(`${names.plus} a ${(s.v * 1000).toFixed(0)} mm/s.`);
  else if (s.v < -0.002) lines.push(`${names.minus} a ${(-s.v * 1000).toFixed(0)} mm/s.`);
  else if (s.pos > 0.995) lines.push(names.endPlus);
  else if (s.pos < 0.005) lines.push(names.endMinus);
  else lines.push(`Detenido al ${(s.pos * 100).toFixed(0)} % de la carrera.`);
  if (s.cushionCap || s.cushionRod)
    lines.push(
      `Amortiguación actuando: el aire de la ${s.cushionRod ? names.rod.toLowerCase() : names.cap.toLowerCase()} sólo puede salir por el estrangulador, frenando el final del movimiento.`,
    );
  if (s.activeMarks.length)
    lines.push(`La leva acciona el final de carrera ${s.activeMarks.join(', ')}.`);
  return lines;
}

export const commonCylParams = (d: { bore: number; stroke: number; mass?: number }): ParamDef[] => [
  {
    key: 'bore',
    label: 'Diámetro del émbolo',
    unit: 'mm',
    type: 'number',
    default: d.bore,
    min: 6,
    max: 200,
    step: 1,
  },
  {
    key: 'stroke',
    label: 'Carrera',
    unit: 'mm',
    type: 'number',
    default: d.stroke,
    min: 5,
    max: 2000,
    step: 5,
  },
  {
    key: 'mass',
    label: 'Masa en movimiento',
    unit: 'kg',
    type: 'number',
    default: d.mass ?? 1,
    min: 0.05,
    max: 1000,
    step: 0.05,
  },
  {
    key: 'load',
    label: 'Fuerza de carga (opuesta al avance)',
    unit: 'N',
    type: 'number',
    default: 0,
    min: -10000,
    max: 10000,
    step: 1,
  },
  {
    key: 'startPos',
    label: 'Posición inicial',
    unit: '%',
    type: 'number',
    default: 0,
    min: 0,
    max: 100,
    step: 1,
  },
];

export const areaOf = (dMm: number) => circleArea(mm(dMm));

/**
 * Descripción de las válvulas de vías como DATOS: puertos y conexiones de cada posición.
 * El mismo dato genera la física (orificios), el símbolo ISO 1219, el modelo 3D y la explicación.
 */

export interface ValvePortCfg {
  id: string;
  side: 'top' | 'bottom';
  /** Desplazamiento horizontal respecto al centro de la casilla. */
  col: number;
  exhaust?: boolean;
  role: string;
}

export interface ValvePositionCfg {
  /** Conexiones abiertas [desde, hacia] (sentido normal del flujo). */
  paths: [string, string][];
  /** Puertos bloqueados en esta posición. */
  blocked: string[];
}

export interface WayValveConfig {
  type: string;
  name: string;
  short: string;
  description: string;
  boxW: number;
  ports: ValvePortCfg[];
  /** Casillas de izquierda a derecha. La izquierda la impone el accionamiento izquierdo. */
  positions: ValvePositionCfg[];
  /** Índice de la casilla de reposo (bajo la que se dibujan los puertos). */
  rest: number;
  /** Puertos de pilotaje de cada lado (si el accionamiento es neumático). */
  pilots: { left: string; right: string };
  /**
   * Corredera real (ver spool.ts): orden de las ranuras a lo largo del taladro (un puerto puede
   * repetirse si tiene dos ranuras unidas por dentro), resaltes en reposo en medios pasos y
   * carrera por casilla. Está precalculada con `solveSpool` y la comprueba spool.test.ts; si
   * falta, se calcula al cargar. `null`: la corredera real necesita un taladro interior (4/3 en
   * tándem o en H) y la válvula se dibuja en 3D con el esquema ISO.
   */
  spool?: { bore: string[]; lands: number[]; stroke: number } | null;
  /** Fluido: aire (por defecto) o aceite. */
  medium?: 'pneu' | 'hyd';
}

export const BOX_H = 40;
export const PORT_STUB = 10;

const P52_PORTS: ValvePortCfg[] = [
  { id: '4', side: 'top', col: -20, role: 'utilización' },
  { id: '2', side: 'top', col: 20, role: 'utilización' },
  { id: '5', side: 'bottom', col: -20, exhaust: true, role: 'escape' },
  { id: '1', side: 'bottom', col: 0, role: 'alimentación' },
  { id: '3', side: 'bottom', col: 20, exhaust: true, role: 'escape' },
];
const P52_LEFT: ValvePositionCfg = {
  paths: [
    ['1', '4'],
    ['2', '3'],
  ],
  blocked: ['5'],
};
const P52_RIGHT: ValvePositionCfg = {
  paths: [
    ['1', '2'],
    ['4', '5'],
  ],
  blocked: ['3'],
};

export const VALVE_52: WayValveConfig = {
  type: 'pneu-valve-52',
  name: 'Válvula 5/2',
  short: '5/2',
  description:
    '5 vías y 2 posiciones. Alimenta alternativamente las salidas 2 y 4 y descarga la otra por 3 o 5. Típica para mandar cilindros de doble efecto.',
  boxW: 60,
  ports: P52_PORTS,
  positions: [P52_LEFT, P52_RIGHT],
  rest: 1,
  pilots: { left: '14', right: '12' },
  spool: { bore: ['5', '4', '1', '2', '3'], lands: [-2, 3, 8], stroke: 2 },
};

const P32_PORTS: ValvePortCfg[] = [
  { id: '2', side: 'top', col: 0, role: 'utilización' },
  { id: '1', side: 'bottom', col: -10, role: 'alimentación' },
  { id: '3', side: 'bottom', col: 10, exhaust: true, role: 'escape' },
];

export const VALVE_32NC: WayValveConfig = {
  type: 'pneu-valve-32nc',
  name: 'Válvula 3/2 normalmente cerrada',
  short: '3/2 NC',
  description:
    '3 vías y 2 posiciones. En reposo la salida 2 está a escape y la alimentación 1 bloqueada; al accionarla, 1 alimenta a 2.',
  boxW: 40,
  ports: P32_PORTS,
  positions: [
    { paths: [['1', '2']], blocked: ['3'] },
    { paths: [['2', '3']], blocked: ['1'] },
  ],
  rest: 1,
  pilots: { left: '12', right: '10' },
  spool: { bore: ['1', '2', '3'], lands: [-3, 1, 5], stroke: 2 },
};

export const VALVE_32NO: WayValveConfig = {
  type: 'pneu-valve-32no',
  name: 'Válvula 3/2 normalmente abierta',
  short: '3/2 NA',
  description:
    '3 vías y 2 posiciones. En reposo 1 alimenta a 2; al accionarla, 2 se descarga por 3 y 1 queda bloqueada.',
  boxW: 40,
  ports: P32_PORTS,
  positions: [
    { paths: [['2', '3']], blocked: ['1'] },
    { paths: [['1', '2']], blocked: ['3'] },
  ],
  rest: 1,
  pilots: { left: '10', right: '12' },
  spool: { bore: ['1', '2', '3'], lands: [-2, 4], stroke: 2 },
};

export const VALVE_22NC: WayValveConfig = {
  type: 'pneu-valve-22nc',
  name: 'Válvula 2/2 normalmente cerrada',
  short: '2/2 NC',
  description: '2 vías y 2 posiciones: abre o cierra el paso entre 1 y 2.',
  boxW: 40,
  ports: [
    { id: '2', side: 'top', col: 0, role: 'utilización' },
    { id: '1', side: 'bottom', col: 0, role: 'alimentación' },
  ],
  positions: [
    { paths: [['1', '2']], blocked: [] },
    { paths: [], blocked: ['1', '2'] },
  ],
  rest: 1,
  pilots: { left: '12', right: '10' },
  spool: { bore: ['2', '1'], lands: [-3, 2], stroke: 2 },
};

export const VALVE_42: WayValveConfig = {
  type: 'pneu-valve-42',
  name: 'Válvula 4/2',
  short: '4/2',
  description:
    '4 vías y 2 posiciones con un único escape (3). Alterna la alimentación entre las salidas 2 y 4.',
  boxW: 40,
  ports: [
    { id: '4', side: 'top', col: -10, role: 'utilización' },
    { id: '2', side: 'top', col: 10, role: 'utilización' },
    { id: '1', side: 'bottom', col: -10, role: 'alimentación' },
    { id: '3', side: 'bottom', col: 10, exhaust: true, role: 'escape' },
  ],
  positions: [
    {
      paths: [
        ['1', '4'],
        ['2', '3'],
      ],
      blocked: [],
    },
    {
      paths: [
        ['1', '2'],
        ['4', '3'],
      ],
      blocked: [],
    },
  ],
  rest: 1,
  pilots: { left: '14', right: '12' },
  // Un único escape con dos ranuras unidas por dentro, como una 5/2 con 3 y 5 comunicados.
  spool: { bore: ['3', '4', '1', '2', '3'], lands: [-2, 3, 8], stroke: 2 },
};

function valve53(kind: 'closed' | 'exhaust' | 'pressure'): WayValveConfig {
  const center: ValvePositionCfg =
    kind === 'closed'
      ? { paths: [], blocked: ['1', '2', '3', '4', '5'] }
      : kind === 'exhaust'
        ? {
            paths: [
              ['2', '3'],
              ['4', '5'],
            ],
            blocked: ['1'],
          }
        : {
            paths: [
              ['1', '2'],
              ['1', '4'],
            ],
            blocked: ['3', '5'],
          };
  const spool = {
    closed: { lands: [-3, 2, 6, 11], stroke: 3 },
    exhaust: { lands: [-1, 4, 9], stroke: 1 },
    pressure: { lands: [-4, 1, 7, 12], stroke: 4 },
  }[kind];
  const names = {
    closed: 'centro cerrado',
    exhaust: 'centro a escape',
    pressure: 'centro a presión',
  };
  const what = {
    closed: 'En el centro bloquea todas las vías: el cilindro queda detenido donde esté.',
    exhaust: 'En el centro descarga 2 y 4: el cilindro queda libre (sin presión).',
    pressure: 'En el centro alimenta 2 y 4 a la vez.',
  };
  return {
    type: `pneu-valve-53-${kind}`,
    name: `Válvula 5/3 ${names[kind]}`,
    short: `5/3 ${kind === 'closed' ? 'CC' : kind === 'exhaust' ? 'CE' : 'CP'}`,
    description: `5 vías y 3 posiciones, centrada por muelles. ${what[kind]}`,
    boxW: 60,
    ports: P52_PORTS,
    positions: [P52_LEFT, center, P52_RIGHT],
    rest: 1,
    pilots: { left: '14', right: '12' },
    spool: { bore: ['5', '4', '1', '2', '3'], ...spool },
  };
}

export const VALVE_53_CLOSED = valve53('closed');
export const VALVE_53_EXHAUST = valve53('exhaust');
export const VALVE_53_PRESSURE = valve53('pressure');

/** Posición del puerto en coordenadas locales del símbolo (sobre la casilla de reposo). */
export function valvePortPos(cfg: WayValveConfig, port: ValvePortCfg) {
  return {
    x: cfg.boxW / 2 + port.col,
    y: port.side === 'top' ? -BOX_H / 2 - PORT_STUB : BOX_H / 2 + PORT_STUB,
  };
}

/** Extremos izquierdo y derecho del conjunto de casillas (en reposo). */
export function boxesExtent(cfg: WayValveConfig) {
  return { left: -cfg.rest * cfg.boxW, right: (cfg.positions.length - cfg.rest) * cfg.boxW };
}

/**
 * Apertura de una conexión de la casilla `box` cuando la corredera está en `pos`
 * (índice continuo de la casilla bajo los puertos). Recubrimiento positivo: a medio
 * camino entre dos casillas todas las vías están cerradas.
 */
export function pathOpening(pos: number, box: number): number {
  return Math.min(1, Math.max(0, (0.45 - Math.abs(pos - box)) / 0.35));
}

/** Desplazamiento de las casillas (o de la corredera) respecto al reposo, en unidades de dibujo. */
export function spoolShift(cfg: WayValveConfig, pos: number) {
  return (cfg.rest - pos) * cfg.boxW;
}

/* ───────────── Válvulas hidráulicas (P presión, T tanque, A y B utilización) ───────────── */

const H4_PORTS: ValvePortCfg[] = [
  { id: 'A', side: 'top', col: -10, role: 'utilización' },
  { id: 'B', side: 'top', col: 10, role: 'utilización' },
  { id: 'P', side: 'bottom', col: -10, role: 'presión' },
  { id: 'T', side: 'bottom', col: 10, exhaust: false, role: 'tanque' },
];
const H4_LEFT: ValvePositionCfg = {
  paths: [
    ['P', 'A'],
    ['B', 'T'],
  ],
  blocked: [],
};
const H4_RIGHT: ValvePositionCfg = {
  paths: [
    ['P', 'B'],
    ['A', 'T'],
  ],
  blocked: [],
};

export const HVALVE_42: WayValveConfig = {
  type: 'hyd-valve-42',
  name: 'Válvula hidráulica 4/2',
  short: '4/2 hidr.',
  description:
    '4 vías y 2 posiciones: en una posición manda el aceite a A y descarga B al tanque; en la otra, al revés.',
  boxW: 40,
  ports: H4_PORTS,
  positions: [H4_LEFT, H4_RIGHT],
  rest: 1,
  pilots: { left: 'X', right: 'Y' },
  medium: 'hyd',
  spool: { bore: ['T', 'A', 'P', 'B', 'T'], lands: [-2, 3, 8], stroke: 2 },
};

function hvalve43(kind: 'closed' | 'tandem' | 'float' | 'open'): WayValveConfig {
  const center: ValvePositionCfg = {
    closed: { paths: [], blocked: ['P', 'T', 'A', 'B'] },
    tandem: { paths: [['P', 'T']], blocked: ['A', 'B'] },
    float: {
      paths: [
        ['A', 'T'],
        ['B', 'T'],
      ],
      blocked: ['P'],
    },
    open: {
      paths: [
        ['P', 'T'],
        ['A', 'T'],
        ['B', 'T'],
      ],
      blocked: [],
    },
  }[kind] as ValvePositionCfg;
  const spool = {
    closed: { bore: ['T', 'A', 'P', 'B', 'T'], lands: [-3, 2, 6, 11], stroke: 3 },
    float: { bore: ['T', 'A', 'P', 'B', 'T'], lands: [-1, 4, 9], stroke: 1 },
    tandem: null,
    open: null,
  }[kind];
  const names = {
    closed: 'centro cerrado',
    tandem: 'centro en tándem',
    float: 'centro flotante',
    open: 'centro abierto (H)',
  };
  const what = {
    closed:
      'En el centro bloquea todo: el cilindro queda inmovilizado y la bomba descarga por la limitadora.',
    tandem:
      'En el centro bloquea A y B (el cilindro queda inmovilizado) y une P con T: la bomba descarga al tanque sin presión.',
    float: 'En el centro une A y B con el tanque: el cilindro queda libre; P está bloqueado.',
    open: 'En el centro une todas las vías con el tanque: el cilindro queda libre y la bomba descarga sin presión.',
  };
  return {
    type: `hyd-valve-43-${kind}`,
    name: `Válvula hidráulica 4/3 ${names[kind]}`,
    short: `4/3 ${kind === 'closed' ? 'cerr.' : kind === 'tandem' ? 'tándem' : kind === 'float' ? 'flot.' : 'H'}`,
    description: `4 vías y 3 posiciones, centrada por muelles. ${what[kind]}`,
    boxW: 40,
    ports: H4_PORTS,
    positions: [H4_LEFT, center, H4_RIGHT],
    rest: 1,
    pilots: { left: 'X', right: 'Y' },
    medium: 'hyd',
    spool,
  };
}

export const HVALVE_43_CLOSED = hvalve43('closed');
export const HVALVE_43_TANDEM = hvalve43('tandem');
export const HVALVE_43_FLOAT = hvalve43('float');
export const HVALVE_43_OPEN = hvalve43('open');

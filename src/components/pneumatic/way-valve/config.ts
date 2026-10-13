/**
 * Descripción de las válvulas de vías como DATOS: puertos y conexiones de cada posición.
 * El mismo dato genera la física (orificios), el símbolo ISO 1219 y la explicación.
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
  /** [0] = casilla izquierda (posición accionada «a»), [1] = casilla derecha (reposo «b»). */
  positions: [ValvePositionCfg, ValvePositionCfg];
}

export const BOX_H = 40;
export const PORT_STUB = 10;

export const VALVE_52: WayValveConfig = {
  type: 'pneu-valve-52',
  name: 'Válvula 5/2',
  short: '5/2',
  description:
    '5 vías y 2 posiciones. Alimenta alternativamente las salidas 2 y 4 y descarga la otra por 3 o 5. Típica para mandar cilindros de doble efecto.',
  boxW: 60,
  ports: [
    { id: '4', side: 'top', col: -20, role: 'utilización' },
    { id: '2', side: 'top', col: 20, role: 'utilización' },
    { id: '5', side: 'bottom', col: -20, exhaust: true, role: 'escape' },
    { id: '1', side: 'bottom', col: 0, role: 'alimentación' },
    { id: '3', side: 'bottom', col: 20, exhaust: true, role: 'escape' },
  ],
  positions: [
    {
      paths: [
        ['1', '4'],
        ['2', '3'],
      ],
      blocked: ['5'],
    },
    {
      paths: [
        ['1', '2'],
        ['4', '5'],
      ],
      blocked: ['3'],
    },
  ],
};

export const VALVE_32NC: WayValveConfig = {
  type: 'pneu-valve-32nc',
  name: 'Válvula 3/2 normalmente cerrada',
  short: '3/2 NC',
  description:
    '3 vías y 2 posiciones. En reposo la salida 2 está a escape y la alimentación 1 bloqueada; al accionarla, 1 alimenta a 2.',
  boxW: 40,
  ports: [
    { id: '2', side: 'top', col: 0, role: 'utilización' },
    { id: '1', side: 'bottom', col: -10, role: 'alimentación' },
    { id: '3', side: 'bottom', col: 10, exhaust: true, role: 'escape' },
  ],
  positions: [
    { paths: [['1', '2']], blocked: ['3'] },
    { paths: [['2', '3']], blocked: ['1'] },
  ],
};

export const VALVE_32NO: WayValveConfig = {
  type: 'pneu-valve-32no',
  name: 'Válvula 3/2 normalmente abierta',
  short: '3/2 NA',
  description:
    '3 vías y 2 posiciones. En reposo 1 alimenta a 2; al accionarla, 2 se descarga por 3 y 1 queda bloqueada.',
  boxW: 40,
  ports: [
    { id: '2', side: 'top', col: 0, role: 'utilización' },
    { id: '1', side: 'bottom', col: -10, role: 'alimentación' },
    { id: '3', side: 'bottom', col: 10, exhaust: true, role: 'escape' },
  ],
  positions: [
    { paths: [['2', '3']], blocked: ['1'] },
    { paths: [['1', '2']], blocked: ['3'] },
  ],
};

/** Posición del puerto en coordenadas locales del símbolo (sobre la casilla de reposo). */
export function valvePortPos(cfg: WayValveConfig, port: ValvePortCfg) {
  return {
    x: cfg.boxW / 2 + port.col,
    y: port.side === 'top' ? -BOX_H / 2 - PORT_STUB : BOX_H / 2 + PORT_STUB,
  };
}

/** Apertura de una conexión según la posición de la corredera (con recubrimiento positivo). */
export function pathOpening(spool: number, positionIndex: 0 | 1): number {
  const s = positionIndex === 0 ? spool : 1 - spool;
  return Math.min(1, Math.max(0, (s - 0.55) / 0.35));
}

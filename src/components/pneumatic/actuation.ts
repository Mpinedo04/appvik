/**
 * Accionamientos de las válvulas (uno por cada lado). Lógica compartida por las válvulas de
 * vías, el temporizador y la válvula de secuencia.
 */
import type { Params } from '../../core/model/types';
import { num, str } from '../../core/registry';

export type ActuatorType =
  | 'none'
  | 'pushbutton'
  | 'lever'
  | 'pedal'
  | 'roller'
  | 'roller-oneway'
  | 'pilot'
  | 'servo'
  | 'solenoid'
  | 'solenoid-servo'
  | 'spring';

export const ACTUATOR_OPTIONS: { value: ActuatorType; label: string }[] = [
  { value: 'pushbutton', label: 'Pulsador' },
  { value: 'lever', label: 'Palanca con enclavamiento' },
  { value: 'pedal', label: 'Pedal' },
  { value: 'roller', label: 'Rodillo (final de carrera)' },
  { value: 'roller-oneway', label: 'Rodillo abatible (un sentido)' },
  { value: 'pilot', label: 'Pilotaje neumático' },
  { value: 'servo', label: 'Pulsador servopilotado' },
  { value: 'solenoid', label: 'Electroimán (bobina Y)' },
  { value: 'solenoid-servo', label: 'Electroimán servopilotado' },
  { value: 'spring', label: 'Muelle' },
  { value: 'none', label: 'Ninguno' },
];

export const MANUAL: ActuatorType[] = ['pushbutton', 'lever', 'pedal', 'servo'];
export const ROLLERS: ActuatorType[] = ['roller', 'roller-oneway'];

export const isManual = (t: string) => MANUAL.includes(t as ActuatorType);
export const isRoller = (t: string) => ROLLERS.includes(t as ActuatorType);
export const isSolenoid = (t: string) => t === 'solenoid' || t === 'solenoid-servo';

export const ACT_NAME: Record<ActuatorType, string> = {
  none: 'nada',
  pushbutton: 'el pulsador',
  lever: 'la palanca',
  pedal: 'el pedal',
  roller: 'el rodillo',
  'roller-oneway': 'el rodillo abatible',
  pilot: 'la presión de pilotaje',
  servo: 'el pulsador servopilotado',
  solenoid: 'el electroimán',
  'solenoid-servo': 'el electroimán servopilotado',
  spring: 'el muelle',
};

export type Side = 'left' | 'right';

export interface ActuationState {
  /** Botón del ratón pulsado sobre cada lado del componente. */
  pressL: boolean;
  pressR: boolean;
  /** Palanca con enclavamiento accionada en cada lado. */
  latchL: boolean;
  latchR: boolean;
  /** Estado de cada lado en el último paso (para dibujar y explicar). */
  leftOn: boolean;
  rightOn: boolean;
  /** Última orden recibida (para las válvulas biestables). */
  memory: Side | null;
}

export const actuationParams = (defaults: { left: ActuatorType; right: ActuatorType }) => [
  {
    key: 'actLeft',
    label: 'Accionamiento izquierdo',
    type: 'select' as const,
    default: defaults.left,
    options: ACTUATOR_OPTIONS,
  },
  {
    key: 'actRight',
    label: 'Accionamiento derecho',
    type: 'select' as const,
    default: defaults.right,
    options: ACTUATOR_OPTIONS,
  },
  {
    key: 'sensor',
    label: 'Marca del cilindro que acciona el rodillo',
    type: 'text' as const,
    default: '1S1',
    placeholder: 'p. ej. 1S2',
    when: (p: Params) => isRoller(str(p, 'actLeft')) || isRoller(str(p, 'actRight')),
  },
  {
    key: 'rollerDir',
    label: 'El rodillo abatible actúa',
    type: 'select' as const,
    default: '+',
    options: [
      { value: '+', label: 'Al avanzar el vástago' },
      { value: '-', label: 'Al retroceder el vástago' },
    ],
    when: (p: Params) =>
      str(p, 'actLeft') === 'roller-oneway' || str(p, 'actRight') === 'roller-oneway',
  },
  {
    key: 'solLeft',
    label: 'Bobina izquierda',
    help: 'Etiqueta de la bobina del esquema eléctrico que acciona este lado.',
    type: 'text' as const,
    default: 'Y1',
    placeholder: 'p. ej. Y1',
    when: (p: Params) => isSolenoid(str(p, 'actLeft')),
  },
  {
    key: 'solRight',
    label: 'Bobina derecha',
    help: 'Etiqueta de la bobina del esquema eléctrico que acciona este lado.',
    type: 'text' as const,
    default: 'Y2',
    placeholder: 'p. ej. Y2',
    when: (p: Params) => isSolenoid(str(p, 'actRight')),
  },
  {
    key: 'pilotBar',
    label: 'Presión mínima de pilotaje',
    unit: 'bar',
    type: 'number' as const,
    default: 1.5,
    min: 0.2,
    max: 8,
    step: 0.1,
    when: (p: Params) =>
      ['pilot', 'servo', 'solenoid-servo'].includes(str(p, 'actLeft')) ||
      ['pilot', 'servo', 'solenoid-servo'].includes(str(p, 'actRight')),
  },
];

export const initActuation = (): ActuationState => ({
  pressL: false,
  pressR: false,
  latchL: false,
  latchR: false,
  leftOn: false,
  rightOn: false,
  memory: null,
});

/** Lecturas que necesita un accionamiento en cada paso. */
export interface ActuationInputs {
  /** Presión relativa en el puerto de pilotaje de ese lado [bar]. */
  pilotBar(side: Side): number;
  /** Presión relativa de alimentación interna (servopilotado) [bar]. */
  supplyBar(): number;
  /** Señal del final de carrera (0/1) y sentido del vástago al pasar (+1/−1). */
  sensor(label: string): { on: boolean; dir: number };
}

/** ¿Está el lado accionado ahora? */
export function sideActive(side: Side, s: ActuationState, p: Params, io: ActuationInputs): boolean {
  const t = str(p, side === 'left' ? 'actLeft' : 'actRight') as ActuatorType;
  const pressed = side === 'left' ? s.pressL : s.pressR;
  const latched = side === 'left' ? s.latchL : s.latchR;
  const threshold = num(p, 'pilotBar');
  switch (t) {
    case 'pushbutton':
    case 'pedal':
      return pressed;
    case 'lever':
      return latched;
    case 'servo':
      return pressed && io.supplyBar() >= threshold;
    case 'pilot':
      return io.pilotBar(side) >= threshold;
    case 'solenoid':
      return io.sensor(str(p, side === 'left' ? 'solLeft' : 'solRight')).on;
    case 'solenoid-servo':
      return (
        io.sensor(str(p, side === 'left' ? 'solLeft' : 'solRight')).on &&
        io.supplyBar() >= threshold
      );
    case 'roller':
      return io.sensor(str(p, 'sensor')).on;
    case 'roller-oneway': {
      const r = io.sensor(str(p, 'sensor'));
      return r.on && r.dir === (str(p, 'rollerDir') === '-' ? -1 : 1);
    }
    default:
      return false;
  }
}

/**
 * Lado que recibe un clic del usuario: el lado pulsado si es manual; si no, el único lado
 * manual que haya (el izquierdo tiene prioridad).
 */
export function manualSideOf(p: Params, clicked?: Side): Side | null {
  const l = isManual(str(p, 'actLeft'));
  const r = isManual(str(p, 'actRight'));
  if (clicked === 'left' && l) return 'left';
  if (clicked === 'right' && r) return 'right';
  if (l) return 'left';
  if (r) return 'right';
  return null;
}

/**
 * Posición objetivo (índice de casilla) según los accionamientos.
 * El izquierdo lleva a la casilla 0 y el derecho a la última; sin accionar, los muelles
 * devuelven al reposo y, sin muelles, la válvula se queda donde está (memoria).
 */
export function targetBox(
  current: number,
  n: number,
  rest: number,
  left: boolean,
  right: boolean,
  p: Params,
  /** Última orden recibida (memoria de las válvulas biestables). */
  memory: Side | null = null,
): number {
  if (left && !right) return 0;
  if (right && !left) return n - 1;
  if (left && right) return Math.round(current);
  const sL = str(p, 'actLeft') === 'spring';
  const sR = str(p, 'actRight') === 'spring';
  if (n >= 3) return p.springs || sL || sR ? rest : Math.round(current);
  if (sL && sR) return rest;
  if (sR) return n - 1;
  if (sL) return 0;
  // Biestable: completa el cambio que ordenó el último impulso aunque éste ya haya terminado.
  if (memory) return memory === 'left' ? 0 : n - 1;
  return Math.round(current);
}

export function onUserPress(
  s: ActuationState,
  p: Params,
  action: 'press' | 'release',
  clicked?: Side,
) {
  if (action === 'release') {
    s.pressL = false;
    s.pressR = false;
    return;
  }
  const side = manualSideOf(p, clicked);
  if (!side) return;
  if (side === 'left') {
    s.pressL = true;
    if (str(p, 'actLeft') === 'lever') s.latchL = !s.latchL;
  } else {
    s.pressR = true;
    if (str(p, 'actRight') === 'lever') s.latchR = !s.latchR;
  }
}

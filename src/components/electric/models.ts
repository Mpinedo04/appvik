/**
 * Componentes eléctricos de mando (24 V DC) con su comportamiento. Como en los simuladores
 * didácticos, la etiqueta de cada uno es su enlace: los contactos «K1» siguen a la bobina K1,
 * la bobina «Y1» acciona el lado de la válvula configurado con Y1 y los sensores «1B1» siguen
 * a la marca 1B1 del cilindro.
 */
import type { Params } from '../../core/model/types';
import {
  num,
  str,
  type CategoryId,
  type ComponentModel,
  type ParamDef,
  type PortDef,
  type StepCtx,
} from '../../core/registry';
import { cm3, paToBarGauge } from '../../core/units';

const P = (id: string, x: number, y: number, dir: PortDef['dir'], label?: string): PortDef => ({
  id,
  medium: 'elec',
  x,
  y,
  dir,
  label: label ?? id,
});

/* ───────────── Alimentación ───────────── */

function railModel(kind: '+24' | '0'): ComponentModel<{ label: string }, null> {
  const plus = kind === '+24';
  return {
    type: plus ? 'elec-24v' : 'elec-0v',
    category: 'electric',
    name: plus ? 'Alimentación +24 V' : 'Alimentación 0 V',
    description: plus
      ? 'Polo positivo de la fuente de 24 V de corriente continua. Todos los +24 V del esquema son el mismo punto.'
      : 'Polo negativo (0 V) de la fuente de 24 V. Todos los 0 V del esquema son el mismo punto.',
    autoLabel: () => (plus ? '+24V' : '0V'),
    sharedLabel: true,
    hideLabel: true,
    params: [],
    ports: () => [plus ? P('1', 0, 20, 'down', '+24 V') : P('1', 0, -20, 'up', '0 V')],
    bbox: () =>
      plus ? { x0: -16, y0: -16, x1: 16, y1: 20 } : { x0: -16, y0: -20, x1: 16, y1: 16 },
    initState: () => ({ label: '' }),
    build(b) {
      b.addRail(b.ePort('1'), kind);
      return null;
    },
    update() {},
    explain: () => [
      plus
        ? 'Polo positivo (+24 V) de la fuente de alimentación de mando.'
        : 'Polo negativo (0 V): cierra el circuito de cada bobina y lámpara.',
    ],
  };
}

export const plus24Model = railModel('+24');
export const zero0Model = railModel('0');

/* ───────────── Contactos ───────────── */

export type ContactKind = 'no' | 'nc' | 'co';

export const CONTACT_PORTS: Record<ContactKind, PortDef[]> = {
  no: [P('3', 0, -30, 'up'), P('4', 0, 30, 'down')],
  nc: [P('1', 0, -30, 'up'), P('2', 0, 30, 'down')],
  co: [
    P('1', 0, -30, 'up', '1 (común)'),
    P('2', -10, 30, 'down', '2 (NC)'),
    P('4', 10, 30, 'down', '4 (NA)'),
  ],
};

const KIND_PARAM: ParamDef = {
  key: 'kind',
  label: 'Tipo de contacto',
  type: 'select',
  default: 'no',
  options: [
    { value: 'no', label: 'Normalmente abierto (NA)' },
    { value: 'nc', label: 'Normalmente cerrado (NC)' },
    { value: 'co', label: 'Conmutado' },
  ],
};

export interface ContactState {
  label: string;
  /** El elemento que mueve los contactos está accionado. */
  actuated: boolean;
  /** Botón del ratón pulsado (mandos manuales). */
  pressed: boolean;
  /** Enclavado (interruptor, seta de emergencia). */
  latched: boolean;
  /** Valor medido (presostato). */
  bar: number;
}

interface ContactHandles {
  label: string;
  /** Contacto que se cierra al accionar (NA) y el que se abre (NC); −1 si no hay. */
  no: number;
  nc: number;
  pneu: number;
}

function buildContacts(b: Parameters<ComponentModel['build']>[0], kind: ContactKind) {
  const e = (id: string) => b.ePort(id);
  if (kind === 'no') return { no: b.addContact(e('3'), e('4')), nc: -1 };
  if (kind === 'nc') return { no: -1, nc: b.addContact(e('1'), e('2')) };
  return { no: b.addContact(e('1'), e('4')), nc: b.addContact(e('1'), e('2')) };
}

export type ActuatorKind =
  | 'button'
  | 'switch'
  | 'estop'
  | 'relay'
  | 'limit'
  | 'proximity'
  | 'pressure';

interface ContactSpec {
  type: string;
  category: CategoryId;
  name: string;
  description: string;
  autoLabel: (n: number) => string;
  sharedLabel?: boolean;
  actuator: ActuatorKind;
  /** Tipo fijo de contacto; si falta, se elige en las propiedades. */
  kind?: ContactKind;
  defaultKind?: ContactKind;
  params?: ParamDef[];
  /** ¿Está accionado ahora? (los mandos manuales usan pressed/latched). */
  actuated?: (ctx: StepCtx, s: ContactState, h: ContactHandles, p: Params) => boolean;
  /** Qué acciona los contactos, para la explicación. */
  why: (s: ContactState, p: Params) => string;
}

export const kindOf = (p: Params, fixed?: ContactKind): ContactKind =>
  fixed ?? ((p.kind as ContactKind) || 'no');

function contactModel(spec: ContactSpec): ComponentModel<ContactState, ContactHandles> {
  const manual = ['button', 'switch', 'estop'].includes(spec.actuator);
  const params = [
    ...(spec.kind ? [] : [{ ...KIND_PARAM, default: spec.defaultKind ?? 'no' } as ParamDef]),
    ...(spec.params ?? []),
  ];
  return {
    type: spec.type,
    category: spec.category,
    name: spec.name,
    description: spec.description,
    autoLabel: spec.autoLabel,
    sharedLabel: spec.sharedLabel,
    params,
    ports: (p) => [
      ...CONTACT_PORTS[kindOf(p, spec.kind)],
      ...(spec.actuator === 'pressure'
        ? [
            {
              id: 'X',
              medium: 'pneu' as const,
              x: -40,
              y: 0,
              dir: 'left' as const,
              label: 'X (presión)',
            },
          ]
        : []),
    ],
    bbox: (p) => ({
      x0: spec.actuator === 'pressure' ? -40 : -30,
      y0: -30,
      x1: kindOf(p, spec.kind) === 'co' ? 16 : 12,
      y1: 30,
    }),
    interactive: () => manual,
    initState: () => ({ label: '', actuated: false, pressed: false, latched: false, bar: 0 }),
    build(b, p) {
      let pneu = -1;
      if (spec.actuator === 'pressure') {
        pneu = b.port('X');
        b.addBaseVolume(pneu, cm3(0.3));
      }
      return { label: b.label, pneu, ...buildContacts(b, kindOf(p, spec.kind)) };
    },
    update(ctx, s, h, p) {
      s.label = h.label;
      if (spec.actuator === 'button') s.actuated = s.pressed;
      else if (spec.actuator === 'switch' || spec.actuator === 'estop') s.actuated = s.latched;
      else s.actuated = spec.actuated!(ctx, s, h, p);
      if (h.no >= 0) ctx.setContact(h.no, s.actuated);
      if (h.nc >= 0) ctx.setContact(h.nc, !s.actuated);
    },
    onUserAction(s, _p, action) {
      if (spec.actuator === 'button') s.pressed = action === 'press';
      else if (action === 'press') s.latched = !s.latched;
    },
    explain(s, p) {
      const kind = kindOf(p, spec.kind);
      const lines = [spec.why(s, p)];
      if (kind === 'no')
        lines.push(
          s.actuated
            ? 'Contacto NA (3-4) cerrado: deja pasar la corriente.'
            : 'Contacto NA (3-4) abierto: corta la corriente.',
        );
      else if (kind === 'nc')
        lines.push(
          s.actuated
            ? 'Contacto NC (1-2) abierto: corta la corriente.'
            : 'Contacto NC (1-2) cerrado: deja pasar la corriente.',
        );
      else
        lines.push(
          s.actuated
            ? 'Contacto conmutado: el común 1 está unido a 4 (NA); 2 queda abierto.'
            : 'Contacto conmutado en reposo: el común 1 está unido a 2 (NC); 4 queda abierto.',
        );
      return lines;
    },
  };
}

export const buttonNoModel = contactModel({
  type: 'elec-button-no',
  category: 'electric',
  name: 'Pulsador NA',
  description:
    'Pulsador con contacto normalmente abierto (3-4): conduce mientras se mantiene pulsado.',
  autoLabel: (n) => `S${n}`,
  actuator: 'button',
  kind: 'no',
  why: (s) =>
    s.actuated ? 'Pulsador apretado.' : 'Pulsador en reposo (el muelle lo mantiene fuera).',
});

export const buttonNcModel = contactModel({
  type: 'elec-button-nc',
  category: 'electric',
  name: 'Pulsador NC',
  description:
    'Pulsador con contacto normalmente cerrado (1-2): conduce en reposo y corta mientras se pulsa (típico pulsador de paro).',
  autoLabel: (n) => `S${n}`,
  actuator: 'button',
  kind: 'nc',
  why: (s) => (s.actuated ? 'Pulsador apretado.' : 'Pulsador en reposo.'),
});

export const switchModel = contactModel({
  type: 'elec-switch',
  category: 'electric',
  name: 'Interruptor',
  description: 'Interruptor con enclavamiento: cada clic cambia de posición y se queda así.',
  autoLabel: (n) => `S${n}`,
  actuator: 'switch',
  defaultKind: 'no',
  why: (s) => (s.actuated ? 'Interruptor conectado (enclavado).' : 'Interruptor desconectado.'),
});

export const estopModel = contactModel({
  type: 'elec-estop',
  category: 'electric',
  name: 'Seta de emergencia',
  description:
    'Pulsador de parada de emergencia con enclavamiento y contacto NC: al pulsarla corta y se queda enclavada; otro clic la rearma.',
  autoLabel: (n) => `S${n}`,
  actuator: 'estop',
  kind: 'nc',
  why: (s) =>
    s.actuated
      ? '¡Parada de emergencia enclavada! Haz clic otra vez para rearmarla.'
      : 'Seta de emergencia rearmada.',
});

export const relayContactModel = contactModel({
  type: 'elec-contact',
  category: 'relays',
  name: 'Contacto de relé',
  description:
    'Contacto accionado por la bobina del relé (o contador) con su misma etiqueta: pon K1 para que lo mueva la bobina K1.',
  autoLabel: () => 'K1',
  sharedLabel: true,
  actuator: 'relay',
  defaultKind: 'no',
  actuated: (ctx, _s, h) => ctx.signal(h.label) > 0,
  why: (s) =>
    s.actuated
      ? `La bobina ${s.label} está activada y ha movido este contacto.`
      : `La bobina ${s.label} no está activada: contacto en reposo.`,
});

export const limitSwitchModel = contactModel({
  type: 'elec-limit',
  category: 'electric-sensors',
  name: 'Final de carrera eléctrico',
  description:
    'Interruptor de posición con rodillo. Se acciona cuando la leva del cilindro pasa por la marca con su misma etiqueta (p. ej. 1S1).',
  autoLabel: () => '1S1',
  sharedLabel: true,
  actuator: 'limit',
  defaultKind: 'no',
  actuated: (ctx, _s, h) => ctx.signal(h.label) > 0,
  why: (s) =>
    s.actuated
      ? `La leva del cilindro está sobre la marca ${s.label} y aprieta el rodillo.`
      : `La leva no está en la marca ${s.label}.`,
});

const SENSOR_TYPES: Record<string, string> = {
  magnetic: 'magnético (detecta el imán del émbolo a través de la camisa)',
  inductive: 'inductivo (detecta metal sin contacto)',
  capacitive: 'capacitivo (detecta cualquier material cercano)',
  optical: 'óptico (detecta la interrupción de un haz de luz)',
};

export const proximityModel = contactModel({
  type: 'elec-proximity',
  category: 'electric-sensors',
  name: 'Sensor de proximidad',
  description:
    'Detector sin contacto: se activa cuando el émbolo o la leva del cilindro está en la marca con su misma etiqueta (p. ej. 1B1).',
  autoLabel: () => '1B1',
  sharedLabel: true,
  actuator: 'proximity',
  kind: 'no',
  params: [
    {
      key: 'sensorType',
      label: 'Tipo de sensor',
      type: 'select',
      default: 'magnetic',
      options: [
        { value: 'magnetic', label: 'Magnético (en el cilindro)' },
        { value: 'inductive', label: 'Inductivo' },
        { value: 'capacitive', label: 'Capacitivo' },
        { value: 'optical', label: 'Óptico' },
      ],
    },
  ],
  actuated: (ctx, _s, h) => ctx.signal(h.label) > 0,
  why: (s, p) =>
    `Sensor ${SENSOR_TYPES[str(p, 'sensorType')] ?? ''}: ${s.actuated ? `detecta el cilindro en la marca ${s.label}` : `no detecta nada en la marca ${s.label}`}.`,
});

export const pressureSwitchModel = contactModel({
  type: 'elec-pressure-switch',
  category: 'electric-sensors',
  name: 'Presostato',
  description:
    'Convierte una presión en una señal eléctrica: conmuta su contacto cuando la presión en X alcanza el valor ajustado y lo devuelve al bajar por debajo del valor menos la histéresis.',
  autoLabel: (n) => `B${n}`,
  actuator: 'pressure',
  kind: 'co',
  params: [
    {
      key: 'setBar',
      label: 'Presión de conmutación',
      unit: 'bar',
      type: 'number',
      default: 4,
      min: 0.2,
      max: 10,
      step: 0.1,
    },
    {
      key: 'hyst',
      label: 'Histéresis',
      unit: 'bar',
      type: 'number',
      default: 0.5,
      min: 0,
      max: 5,
      step: 0.1,
    },
  ],
  actuated: (ctx, s, h, p) => {
    s.bar = paToBarGauge(ctx.p(h.pneu));
    if (s.bar >= num(p, 'setBar')) return true;
    if (s.bar <= num(p, 'setBar') - num(p, 'hyst')) return false;
    return s.actuated;
  },
  why: (s, p) =>
    `Presión en X: ${s.bar.toFixed(2)} bar (conmuta a ${num(p, 'setBar')} bar y vuelve por debajo de ${(num(p, 'setBar') - num(p, 'hyst')).toFixed(1)} bar).`,
});

/* ───────────── Cargas: bobinas y lámparas ───────────── */

/** Retardo propio de un relé al conectar y desconectar [s]. */
export const RELAY_DELAY = 0.01;

export interface CoilState {
  label: string;
  /** Recibe 24 V. */
  energized: boolean;
  /** Estado de salida (contactos conmutados, válvula accionada, lámpara encendida). */
  on: boolean;
  /** Tiempo acumulado para los retardos [s]. */
  t: number;
  /** Contador */
  count: number;
  prevIn: boolean;
  reset: boolean;
}

const initCoil = (): CoilState => ({
  label: '',
  energized: false,
  on: false,
  t: 0,
  count: 0,
  prevIn: false,
  reset: false,
});

const COIL_PORTS = [P('A1', 0, -30, 'up'), P('A2', 0, 30, 'down')];

function relayModel(timed: boolean): ComponentModel<CoilState, { label: string; load: number }> {
  return {
    type: timed ? 'elec-relay-timer' : 'elec-relay',
    category: 'relays',
    name: timed ? 'Relé temporizado' : 'Relé',
    description: timed
      ? 'Relé con retardo: a la conexión (sus contactos conmutan un tiempo después de recibir tensión) o a la desconexión (vuelven un tiempo después de quitarla).'
      : 'Bobina de relé: al recibir 24 V atrae la armadura y conmuta todos los contactos con su misma etiqueta.',
    autoLabel: (n) => (timed ? `KT${n}` : `K${n}`),
    params: timed
      ? [
          {
            key: 'mode',
            label: 'Retardo',
            type: 'select',
            default: 'on-delay',
            options: [
              { value: 'on-delay', label: 'A la conexión' },
              { value: 'off-delay', label: 'A la desconexión' },
            ],
          },
          {
            key: 'delay',
            label: 'Tiempo',
            unit: 's',
            type: 'number',
            default: 2,
            min: 0.05,
            max: 100,
            step: 0.1,
          },
        ]
      : [],
    ports: () => COIL_PORTS,
    bbox: () => ({ x0: timed ? -26 : -14, y0: -30, x1: 14, y1: 30 }),
    initState: initCoil,
    build(b) {
      return { label: b.label, load: b.addLoad(b.ePort('A1'), b.ePort('A2')) };
    },
    update(ctx, s, h, p, dt) {
      s.label = h.label;
      s.energized = ctx.energized(h.load);
      const mode = timed ? str(p, 'mode') : 'normal';
      const delay = timed ? num(p, 'delay') : RELAY_DELAY;
      if (mode === 'on-delay') {
        if (!s.energized) {
          s.on = false;
          s.t = 0;
        } else if (!s.on) {
          s.t += dt;
          if (s.t >= delay) s.on = true;
        }
      } else if (mode === 'off-delay') {
        if (s.energized) {
          s.on = true;
          s.t = 0;
        } else if (s.on) {
          s.t += dt;
          if (s.t >= delay) s.on = false;
        }
      } else if (s.on !== s.energized) {
        s.t += dt;
        if (s.t >= delay) {
          s.on = s.energized;
          s.t = 0;
        }
      } else s.t = 0;
      ctx.setSignal(h.label, s.on);
    },
    explain(s, p) {
      const lines = [
        s.energized
          ? `La bobina ${s.label} recibe 24 V entre A1 y A2: crea un campo magnético.`
          : `La bobina ${s.label} no recibe tensión.`,
      ];
      if (timed) {
        const d = num(p, 'delay');
        if (str(p, 'mode') === 'on-delay')
          lines.push(
            s.energized && !s.on
              ? `Retardo a la conexión: faltan ${(d - s.t).toFixed(1)} s para conmutar.`
              : `Retardo a la conexión de ${d} s.`,
          );
        else
          lines.push(
            !s.energized && s.on
              ? `Retardo a la desconexión: faltan ${(d - s.t).toFixed(1)} s para volver.`
              : `Retardo a la desconexión de ${d} s.`,
          );
      }
      lines.push(
        s.on
          ? `La armadura está atraída: los contactos ${s.label} están conmutados (NA cerrados, NC abiertos).`
          : `Armadura en reposo: los contactos ${s.label} están en reposo (NA abiertos, NC cerrados).`,
      );
      return lines;
    },
  };
}

export const relayModelNormal = relayModel(false);
export const relayTimerModel = relayModel(true);

export const counterModel: ComponentModel<
  CoilState,
  { label: string; count: number; reset: number }
> = {
  type: 'elec-counter',
  category: 'relays',
  name: 'Contador',
  description:
    'Cuenta los impulsos que recibe en A1-A2. Al llegar a la preselección conmuta los contactos con su misma etiqueta; un impulso en R1-R2 lo pone a cero.',
  autoLabel: (n) => `C${n}`,
  params: [
    {
      key: 'preset',
      label: 'Preselección',
      type: 'number',
      default: 3,
      min: 1,
      max: 9999,
      step: 1,
    },
  ],
  ports: () => [
    P('A1', -10, -30, 'up', 'A1 (cuenta)'),
    P('A2', -10, 30, 'down', 'A2 (cuenta)'),
    P('R1', 10, -30, 'up', 'R1 (puesta a cero)'),
    P('R2', 10, 30, 'down', 'R2 (puesta a cero)'),
  ],
  bbox: () => ({ x0: -22, y0: -30, x1: 22, y1: 30 }),
  initState: initCoil,
  build(b) {
    return {
      label: b.label,
      count: b.addLoad(b.ePort('A1'), b.ePort('A2')),
      reset: b.addLoad(b.ePort('R1'), b.ePort('R2')),
    };
  },
  update(ctx, s, h, p) {
    s.label = h.label;
    s.energized = ctx.energized(h.count);
    s.reset = ctx.energized(h.reset);
    if (s.reset) s.count = 0;
    else if (s.energized && !s.prevIn) s.count++;
    s.prevIn = s.energized;
    s.on = s.count >= num(p, 'preset');
    ctx.setSignal(h.label, s.on);
  },
  explain(s, p) {
    return [
      `Cuenta ${s.count} de ${num(p, 'preset')} impulsos.`,
      s.reset ? 'Recibe la orden de puesta a cero (R1-R2).' : '',
      s.on
        ? `Preselección alcanzada: los contactos ${s.label} están conmutados.`
        : `Los contactos ${s.label} están en reposo.`,
    ].filter(Boolean);
  },
};

export const LAMP_COLORS: Record<string, string> = {
  green: '#22c55e',
  red: '#ef4444',
  yellow: '#facc15',
  white: '#f8fafc',
  blue: '#3b82f6',
};

export const lampModel: ComponentModel<CoilState, { label: string; load: number }> = {
  type: 'elec-lamp',
  category: 'electric',
  name: 'Lámpara',
  description: 'Piloto luminoso: se enciende cuando recibe 24 V entre sus bornes.',
  autoLabel: (n) => `H${n}`,
  params: [
    {
      key: 'color',
      label: 'Color',
      type: 'select',
      default: 'green',
      options: [
        { value: 'green', label: 'Verde' },
        { value: 'red', label: 'Rojo' },
        { value: 'yellow', label: 'Amarillo' },
        { value: 'white', label: 'Blanco' },
        { value: 'blue', label: 'Azul' },
      ],
    },
  ],
  ports: () => [P('X1', 0, -30, 'up'), P('X2', 0, 30, 'down')],
  bbox: () => ({ x0: -14, y0: -30, x1: 14, y1: 30 }),
  initState: initCoil,
  build(b) {
    return { label: b.label, load: b.addLoad(b.ePort('X1'), b.ePort('X2')) };
  },
  update(ctx, s, h) {
    s.label = h.label;
    s.energized = s.on = ctx.energized(h.load);
  },
  explain: (s) => [s.on ? 'Encendida: recibe 24 V.' : 'Apagada: no le llega tensión.'],
};

export const solenoidModel: ComponentModel<CoilState, { label: string; load: number }> = {
  type: 'elec-solenoid',
  category: 'relays',
  name: 'Bobina de electroválvula',
  description:
    'Bobina del electroimán de una válvula. Acciona el lado de la válvula cuyo accionamiento «Electroimán» tiene su misma etiqueta (Y1, Y2…).',
  autoLabel: (n) => `Y${n}`,
  params: [],
  ports: () => COIL_PORTS,
  bbox: () => ({ x0: -14, y0: -30, x1: 14, y1: 30 }),
  initState: initCoil,
  build(b) {
    return { label: b.label, load: b.addLoad(b.ePort('A1'), b.ePort('A2')) };
  },
  update(ctx, s, h) {
    s.label = h.label;
    s.energized = s.on = ctx.energized(h.load);
    ctx.setSignal(h.label, s.on);
  },
  explain: (s) => [
    s.on
      ? `La bobina ${s.label} recibe 24 V: el electroimán empuja la corredera de la válvula.`
      : `La bobina ${s.label} no recibe tensión: el electroimán no hace fuerza.`,
  ],
};

export const ELECTRIC_MODELS: ComponentModel[] = [
  plus24Model,
  zero0Model,
  buttonNoModel,
  buttonNcModel,
  switchModel,
  estopModel,
  lampModel,
  relayModelNormal,
  relayTimerModel,
  relayContactModel,
  counterModel,
  solenoidModel,
  limitSwitchModel,
  proximityModel,
  pressureSwitchModel,
];

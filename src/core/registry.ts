/**
 * Registro de tipos de componente (parte lógica, sin React).
 * Cada componente se define en su propia carpeta de `src/components` y se registra aquí;
 * su parte visual (símbolo 2D, modelo 3D) se registra aparte en `src/components/views.ts`.
 */
import type { GrafcetState } from './control/grafcet';
import type { LadderState } from './control/ladder';
import type { Dir, Grafcet, Ladder, Medium, ParamValue, Params } from './model/types';

/** Estado de los programas de mando para mostrarlo en los editores. */
export interface ControlStates {
  grafcet?: GrafcetState;
  ladder?: LadderState;
}

export type CategoryId =
  | 'supply'
  | 'actuators'
  | 'directional'
  | 'logic'
  | 'flowpressure'
  | 'sensors'
  | 'instruments'
  | 'electric'
  | 'relays'
  | 'electric-sensors'
  | 'hydraulic'
  | 'hyd-valves'
  | 'control';

export const CATEGORIES: { id: CategoryId; name: string }[] = [
  { id: 'supply', name: 'Alimentación' },
  { id: 'actuators', name: 'Actuadores' },
  { id: 'directional', name: 'Válvulas de vías' },
  { id: 'logic', name: 'Válvulas de bloqueo y lógicas' },
  { id: 'flowpressure', name: 'Válvulas de caudal y presión' },
  { id: 'sensors', name: 'Sensores' },
  { id: 'instruments', name: 'Instrumentos' },
  { id: 'electric', name: 'Eléctricos: alimentación y mando' },
  { id: 'relays', name: 'Relés, contadores y bobinas' },
  { id: 'electric-sensors', name: 'Sensores eléctricos' },
  { id: 'hydraulic', name: 'Hidráulica: alimentación y actuadores' },
  { id: 'hyd-valves', name: 'Hidráulica: válvulas' },
  { id: 'control', name: 'Autómata programable (PLC)' },
];

export interface PortDef {
  id: string;
  medium: Medium;
  /** Posición en coordenadas locales del símbolo (sin rotar). Múltiplo de la cuadrícula. */
  x: number;
  y: number;
  /** Hacia dónde sale la tubería del puerto (sin rotar). */
  dir: Dir;
  label?: string;
  /** Escape: si queda sin conectar es normal (descarga a la atmósfera sin aviso). */
  exhaust?: boolean;
}

export type ParamDef = {
  key: string;
  label: string;
  unit?: string;
  help?: string;
  /** Sólo se muestra en el panel si se cumple la condición (p. ej. según el accionamiento). */
  when?: (p: Params) => boolean;
} & (
  | { type: 'number'; default: number; min?: number; max?: number; step?: number }
  | { type: 'select'; default: string; options: { value: string; label: string }[] }
  | { type: 'boolean'; default: boolean }
  | { type: 'text'; default: string; placeholder?: string }
);

export interface BBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Contexto para declarar la red física de un componente al compilar el circuito. */
export interface BuildCtx {
  /** Nodo de fluido al que pertenece un puerto del componente. */
  port(portId: string): number;
  /** Crea un nodo interno (volumen propio o presión fija). */
  addNode(opts?: {
    volume?: number;
    fixedPressure?: number;
    /** Presión absoluta inicial [Pa] (depósitos que empiezan llenos). */
    initialPressure?: number;
    name?: string;
    /** Fluido del nodo (aire por defecto). */
    kind?: 'gas' | 'oil' | 'accumulator';
    /** Acumulador: volumen de gas [m³] y presión de precarga absoluta [Pa]. */
    gasVolume?: number;
    precharge?: number;
  }): number;
  /** Nodo de la atmósfera (presión fija P_ATM). */
  readonly atmosphere: number;
  /**
   * Crea un orificio entre dos nodos y devuelve su índice. Aire: conductancia ISO 6358 `C`
   * (y relación crítica `b`). Aceite: coeficiente `K` (q = K·√Δp, ver oilKFromNominalFlow).
   */
  addOrifice(
    a: number,
    b: number,
    opts: { C: number; b?: number; name?: string } | { K: number; name?: string },
  ): number;
  /** Fuente de caudal de a → b (bombas); su caudal se fija en cada paso con setSource. */
  addSource(a: number, b: number): number;
  /** Añade volumen muerto fijo a un nodo [m³]. */
  addBaseVolume(node: number, volume: number): void;
  /** Etiqueta del componente (en los eléctricos es el enlace: K1, Y1, 1B1…). */
  readonly label: string;
  /** Nodo eléctrico de un borne. */
  ePort(portId: string): number;
  /** Contacto entre dos nodos eléctricos (abierto al crearlo). Devuelve su índice. */
  addContact(a: number, b: number): number;
  /** Carga (bobina, lámpara) entre dos nodos eléctricos. Devuelve su índice. */
  addLoad(a: number, b: number): number;
  /** Une un nodo al potencial de +24 V o de 0 V. */
  addRail(node: number, kind: '+24' | '0'): void;
  /** Programa de mando del proyecto (GRAFCET o contactos), si lo hay. */
  program(kind: 'grafcet'): Grafcet | undefined;
  program(kind: 'ladder'): Ladder | undefined;
}

/** Contexto disponible en cada paso de integración. */
export interface StepCtx {
  readonly t: number;
  /** Presión absoluta de un nodo [Pa]. */
  p(node: number): number;
  /** Apertura relativa (0..1) de un orificio. */
  setOpening(orifice: number, fraction: number): void;
  /** Añade volumen variable a un nodo en este paso (cámaras de cilindros) [m³]. */
  addVolume(node: number, volume: number): void;
  /** Caudal másico del último paso por un orificio [kg/s] (positivo de a→b). */
  massFlow(orifice: number): number;
  /** Fija el caudal másico de una fuente [kg/s]. */
  setSource(source: number, mdot: number): void;
  /** Rigidez de un nodo frente a un cambio de volumen, −dp/dV [Pa/m³]. */
  dpdV(node: number): number;
  /** Aceite almacenado en un nodo acumulador [m³]. */
  storedOil(node: number): number;
  /** Lee una señal publicada en el paso anterior (0 si no existe). */
  signal(name: string): number;
  /** Publica una señal para el paso siguiente (finales de carrera, sensores…). */
  setSignal(name: string, value: number | boolean): void;
  /** Abre o cierra un contacto eléctrico. */
  setContact(contact: number, closed: boolean): void;
  /** ¿Recibió la carga 24 V en la última resolución de la red eléctrica? */
  energized(load: number): boolean;
  /** Nivel de un nodo eléctrico: +1 = +24 V, −1 = 0 V, 0 = sin tensión. */
  eLevel(node: number): number;
  /** Publica el estado de un programa de mando para los editores. */
  publishControl(state: ControlStates): void;
}

export type UserAction = 'press' | 'release';

export interface ComponentModel<S = any, H = any> {
  type: string;
  category: CategoryId;
  name: string;
  description: string;
  /** Genera la etiqueta automática n-ésima (1A, 1V1…). */
  autoLabel(n: number): string;
  params: ParamDef[];
  ports(p: Params): PortDef[];
  /** Caja envolvente del símbolo en coordenadas locales (para selección). */
  bbox(p: Params): BBox;
  initState(p: Params): S;
  build(b: BuildCtx, p: Params): H;
  /** Actualiza mecánica/estado interno y declara aperturas y volúmenes para este paso. */
  update(ctx: StepCtx, s: S, h: H, p: Params, dt: number): void;
  /** El usuario hace clic sobre el componente durante la simulación (`side`: mitad pulsada). */
  onUserAction?(s: S, p: Params, action: UserAction, side?: 'left' | 'right'): void;
  /** Explicación en lenguaje natural de lo que ocurre dentro del componente. */
  explain(s: S, p: Params, ctx: { p(portId: string): number }): string[];
  /** Si es true, el componente reacciona a clics durante la simulación. */
  interactive?(p: Params): boolean;
  /**
   * La etiqueta es un enlace y puede repetirse (los contactos K1 de un relé K1): al añadir uno
   * nuevo se le da `autoLabel(1)` y el renumerado no la cambia.
   */
  sharedLabel?: boolean;
  /** No dibujar la etiqueta (el símbolo ya lleva su texto, p. ej. +24 V). */
  hideLabel?: boolean;
}

const models = new Map<string, ComponentModel>();

export function registerModel(m: ComponentModel) {
  models.set(m.type, m);
}

export function getModel(type: string): ComponentModel {
  const m = models.get(type);
  if (!m) throw new Error(`Tipo de componente desconocido: ${type}`);
  return m;
}

export function hasModel(type: string) {
  return models.has(type);
}

export function allModels(): ComponentModel[] {
  return [...models.values()];
}

/** Combina los valores por defecto con los parámetros guardados en la instancia. */
export function resolveParams(m: ComponentModel, given: Params): Params {
  const out: Params = {};
  for (const d of m.params) {
    const v: ParamValue | undefined = given[d.key];
    out[d.key] = v === undefined ? d.default : v;
  }
  return out;
}

export function defaultParams(m: ComponentModel): Params {
  return resolveParams(m, {});
}

export const num = (p: Params, k: string) => Number(p[k]);
export const str = (p: Params, k: string) => String(p[k]);
export const bool = (p: Params, k: string) => Boolean(p[k]);

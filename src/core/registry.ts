/**
 * Registro de tipos de componente (parte lógica, sin React).
 * Cada componente se define en su propia carpeta de `src/components` y se registra aquí;
 * su parte visual (símbolo 2D, modelo 3D) se registra aparte en `src/components/views.ts`.
 */
import type { Dir, Medium, ParamValue, Params } from './model/types';

export type CategoryId =
  | 'supply'
  | 'actuators'
  | 'directional'
  | 'logic'
  | 'flowpressure'
  | 'sensors'
  | 'instruments'
  | 'electric'
  | 'hydraulic';

export const CATEGORIES: { id: CategoryId; name: string }[] = [
  { id: 'supply', name: 'Alimentación' },
  { id: 'actuators', name: 'Actuadores' },
  { id: 'directional', name: 'Válvulas de vías' },
  { id: 'logic', name: 'Válvulas de bloqueo y lógicas' },
  { id: 'flowpressure', name: 'Válvulas de caudal y presión' },
  { id: 'sensors', name: 'Sensores' },
  { id: 'instruments', name: 'Instrumentos' },
  { id: 'electric', name: 'Eléctricos' },
  { id: 'hydraulic', name: 'Hidráulica' },
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
  addNode(opts?: { volume?: number; fixedPressure?: number; name?: string }): number;
  /** Nodo de la atmósfera (presión fija P_ATM). */
  readonly atmosphere: number;
  /** Crea un orificio (restricción ISO 6358) entre dos nodos. Devuelve su índice. */
  addOrifice(a: number, b: number, opts: { C: number; b?: number; name?: string }): number;
  /** Añade volumen muerto fijo a un nodo [m³]. */
  addBaseVolume(node: number, volume: number): void;
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
  /** Lee una señal publicada en el paso anterior (0 si no existe). */
  signal(name: string): number;
  /** Publica una señal para el paso siguiente (finales de carrera, sensores…). */
  setSignal(name: string, value: number | boolean): void;
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

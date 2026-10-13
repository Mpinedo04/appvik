/** Modelo de datos del proyecto: topología + disposición 2D. Es la única fuente de verdad. */

export type Medium = 'pneu' | 'hyd' | 'elec';
export type Rotation = 0 | 90 | 180 | 270;
export type Dir = 'up' | 'down' | 'left' | 'right';
export type ParamValue = number | string | boolean;
export type Params = Record<string, ParamValue>;

export interface Vec2 {
  x: number;
  y: number;
}

export interface ComponentInstance {
  id: string;
  type: string;
  /** Posición del origen del símbolo en el lienzo (coordenadas de mundo). */
  x: number;
  y: number;
  rot: Rotation;
  flip: boolean;
  label: string;
  params: Params;
}

export type Endpoint =
  | { kind: 'port'; comp: string; port: string }
  | { kind: 'junction'; id: string };

/** Punto de unión (derivación en T) sobre una tubería o cable. */
export interface Junction {
  id: string;
  x: number;
  y: number;
  medium: Medium;
}

export interface Connection {
  id: string;
  a: Endpoint;
  b: Endpoint;
  /** Puntos de codo intermedios (sin incluir los extremos). */
  points: Vec2[];
  medium: Medium;
}

export interface Circuit {
  components: Record<string, ComponentInstance>;
  connections: Record<string, Connection>;
  junctions: Record<string, Junction>;
}

export const PROJECT_FORMAT = 'fluidlab-3d';
export const PROJECT_VERSION = 1;

export interface Project {
  format: typeof PROJECT_FORMAT;
  version: number;
  name: string;
  circuit: Circuit;
}

export const emptyCircuit = (): Circuit => ({ components: {}, connections: {}, junctions: {} });

export function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

export function endpointKey(e: Endpoint): string {
  return e.kind === 'port' ? `p:${e.comp}:${e.port}` : `j:${e.id}`;
}

export function sameEndpoint(a: Endpoint, b: Endpoint): boolean {
  return endpointKey(a) === endpointKey(b);
}

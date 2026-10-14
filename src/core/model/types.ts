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
  /** Programa GRAFCET (mando directo o programa del PLC). */
  grafcet?: Grafcet;
  /** Esquema de contactos (Ladder) del PLC o de mando directo. */
  ladder?: Ladder;
}

/* ───────────── GRAFCET ───────────── */

/**
 * Acción de una etapa: N continua (mientras la etapa está activa), S/R memorizada (activar /
 * desactivar), D retardada y L limitada (`time` en s), CU cuenta al activarse la etapa
 * (`time` = preselección) y CR pone el contador a cero.
 */
export type GrafcetActionKind = 'N' | 'S' | 'R' | 'D' | 'L' | 'CU' | 'CR';

export interface GrafcetAction {
  kind: GrafcetActionKind;
  target: string;
  time?: number;
}

export interface GrafcetStep {
  id: string;
  n: number;
  x: number;
  y: number;
  initial: boolean;
  actions: GrafcetAction[];
}

export interface GrafcetTransition {
  id: string;
  x: number;
  y: number;
  /** Receptividad, p. ej. «S1 · 1B1» o «t/X2/2s». */
  cond: string;
}

/** Enlace orientado etapa → transición o transición → etapa. */
export interface GrafcetLink {
  id: string;
  from: string;
  to: string;
}

export interface Grafcet {
  steps: Record<string, GrafcetStep>;
  transitions: Record<string, GrafcetTransition>;
  links: Record<string, GrafcetLink>;
}

/* ───────────── Esquema de contactos ───────────── */

export type LadderCoilKind = 'coil' | 'set' | 'reset' | 'TON' | 'TOF' | 'CTU';

export interface LadderRung {
  id: string;
  /** Condición del segmento como expresión: «(I0.0 + M0.0) · !I0.1». Se dibuja en contactos. */
  cond: string;
  coil: { kind: LadderCoilKind; target: string; preset?: number };
  comment?: string;
}

export interface Ladder {
  rungs: LadderRung[];
}

export const PROJECT_FORMAT = 'fluidlab-3d';
/** 2: GRAFCET y esquema de contactos (los proyectos de la versión 1 se abren igual). */
export const PROJECT_VERSION = 2;

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

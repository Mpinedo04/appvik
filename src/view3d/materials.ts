/**
 * Materiales compartidos de la escena 3D y sus variantes por modo de visualización.
 * - normal: PBR opaco
 * - xray: carcasas casi transparentes
 * - cut: carcasas recortadas por un plano horizontal (se ve la sección por dentro)
 * Las piezas internas (émbolo, corredera, muelles…) nunca se recortan ni se transparentan.
 */
import * as THREE from 'three';
import type { Render3D } from '../store/view';
import { AXIS_Y, S } from './layout';

/** Plano de corte global: conserva lo que está por debajo de `constant` (en Y). */
export const CUT_PLANE = new THREE.Plane(new THREE.Vector3(0, -1, 0), AXIS_Y * S);

export function setCutOffset(offsetUnits: number) {
  CUT_PLANE.constant = (AXIS_Y + offsetUnits) * S;
}

export type MatKey =
  | 'aluminium'
  | 'anodizedBlue'
  | 'steel'
  | 'dark'
  | 'brass'
  | 'bronze'
  | 'red'
  | 'black'
  | 'white'
  | 'glass'
  | 'spool';

const BASE: Record<MatKey, THREE.MeshStandardMaterialParameters> = {
  aluminium: { color: '#c9d0d8', metalness: 0.55, roughness: 0.38 },
  anodizedBlue: { color: '#3768c4', metalness: 0.45, roughness: 0.42 },
  steel: { color: '#e6e9ee', metalness: 0.92, roughness: 0.18 },
  dark: { color: '#1f2733', metalness: 0.1, roughness: 0.7 },
  brass: { color: '#c7a23a', metalness: 0.85, roughness: 0.3 },
  bronze: { color: '#a8834f', metalness: 0.4, roughness: 0.95 },
  red: { color: '#d63a32', metalness: 0.1, roughness: 0.5 },
  black: { color: '#2a2f38', metalness: 0.2, roughness: 0.6 },
  white: { color: '#f4f6f8', metalness: 0, roughness: 0.6 },
  glass: {
    color: '#dbe8f7',
    metalness: 0,
    roughness: 0.05,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
  },
  spool: { color: '#9aa5b4', metalness: 0.8, roughness: 0.28 },
};

const cache = new Map<string, THREE.Material>();

/** Material de pieza interna (no le afecta el modo de visualización). */
export function partMat(key: MatKey): THREE.Material {
  const k = `part:${key}`;
  let m = cache.get(k);
  if (!m) {
    m = new THREE.MeshStandardMaterial(BASE[key]);
    cache.set(k, m);
  }
  return m;
}

/** Material de carcasa según el modo de visualización. */
export function shellMat(key: MatKey, mode: Render3D): THREE.Material {
  const k = `shell:${key}:${mode}`;
  let m = cache.get(k);
  if (!m) {
    const params: THREE.MeshStandardMaterialParameters = { ...BASE[key] };
    if (mode === 'xray')
      Object.assign(params, { transparent: true, opacity: 0.13, depthWrite: false });
    if (mode === 'cut') Object.assign(params, { clippingPlanes: [CUT_PLANE], clipShadows: true });
    m = new THREE.MeshStandardMaterial(params);
    cache.set(k, m);
  }
  return m;
}

/** Cara interior que se ve a través del corte (color de sección). */
export function sectionMat(): THREE.Material {
  let m = cache.get('section');
  if (!m) {
    m = new THREE.MeshBasicMaterial({
      color: '#e7a54a',
      side: THREE.BackSide,
      clippingPlanes: [CUT_PLANE],
    });
    cache.set('section', m);
  }
  return m;
}

/** Material de aristas para el modo rayos X. */
export function edgeMat(): THREE.LineBasicMaterial {
  let m = cache.get('edges') as THREE.LineBasicMaterial | undefined;
  if (!m) {
    m = new THREE.LineBasicMaterial({ color: '#5b6b82', transparent: true, opacity: 0.55 });
    cache.set('edges', m);
  }
  return m;
}

/** Material propio (no compartido) para piezas cuyo color cambia con la presión. */
export function tintMat(opacity = 0.42): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: '#2f6fde',
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity >= 1,
    roughness: 0.4,
    metalness: 0,
  });
}

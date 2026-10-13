/**
 * Registro de los modelos 3D. Va aparte de views.ts para que Three.js sólo se descargue al
 * abrir la vista 3D (el editor 2D arranca sin él).
 */
import type { FC } from 'react';
import { WAY_VALVES } from './models';
import type { Model3DProps } from './parts3d';
import { CylinderDouble3D } from './pneumatic/cylinder-double/Model3D';
import { Silencer3D } from './pneumatic/exhaust/Model3D';
import { Gauge3D } from './pneumatic/gauge/Model3D';
import { Supply3D } from './pneumatic/supply/Model3D';
import { makeWayValve3D } from './pneumatic/way-valve/Model3D';

const models = new Map<string, FC<Model3DProps>>([
  ['pneu-supply', Supply3D],
  ['pneu-silencer', Silencer3D],
  ['pneu-cyl-double', CylinderDouble3D],
  ['pneu-gauge', Gauge3D],
  ...WAY_VALVES.map((cfg) => [cfg.type, makeWayValve3D(cfg)] as [string, FC<Model3DProps>]),
]);

export function getModel3D(type: string): FC<Model3DProps> | null {
  return models.get(type) ?? null;
}

export function registerModel3D(type: string, comp: FC<Model3DProps>) {
  models.set(type, comp);
}

/**
 * Registro de los modelos 3D. Va aparte de views.ts para que Three.js sólo se descargue al
 * abrir la vista 3D (el editor 2D arranca sin él).
 */
import { createElement, type FC } from 'react';
import { useView } from '../store/view';
import { ALL_WAY_VALVES } from './models';
import type { Model3DProps } from './parts3d';
import { CylinderDouble3D, CylinderSingle3D } from './pneumatic/cylinder-double/Model3D';
import { Silencer3D } from './pneumatic/exhaust/Model3D';
import { Gauge3D } from './pneumatic/gauge/Model3D';
import {
  Check3D,
  Compressor3D,
  Flowmeter3D,
  Frl3D,
  Gripper3D,
  Motor3D,
  QuickExhaust3D,
  Relief3D,
  Rodless3D,
  Rotary3D,
  Shuttle3D,
  Tank3D,
  Throttle3D,
  Timer3D,
} from './pneumatic/models3d';
import { Supply3D } from './pneumatic/supply/Model3D';
import { makeWayValve3D } from './pneumatic/way-valve/Model3D';
import { makeWayValveIso3D } from './pneumatic/way-valve/ModelIso3D';
import type { WayValveConfig } from './pneumatic/way-valve/config';

const variant =
  <K extends string>(C: FC<Model3DProps & Record<K, boolean>>, key: K): FC<Model3DProps> =>
  (p) =>
    createElement(C, { ...p, [key]: true } as Model3DProps & Record<K, boolean>);

/** Válvula de vías: corredera real o esquema ISO según la preferencia de la vista. */
function wayValve3D(cfg: WayValveConfig): FC<Model3DProps> {
  const Real = makeWayValve3D(cfg);
  const Iso = makeWayValveIso3D(cfg);
  return function WayValve(p) {
    const style = useView((s) => s.valveStyle);
    return createElement(style === 'iso' ? Iso : Real, p);
  };
}

const models = new Map<string, FC<Model3DProps>>([
  ['pneu-supply', Supply3D],
  ['pneu-compressor', Compressor3D],
  ['pneu-frl', Frl3D],
  ['pneu-tank', Tank3D],
  ['pneu-silencer', Silencer3D],
  ['pneu-cyl-single', CylinderSingle3D],
  ['pneu-cyl-double', CylinderDouble3D],
  ['pneu-cyl-rodless', Rodless3D],
  ['pneu-rotary', Rotary3D],
  ['pneu-motor', Motor3D],
  ['pneu-gripper', Gripper3D],
  ['pneu-check', Check3D],
  ['pneu-shuttle-or', Shuttle3D],
  ['pneu-shuttle-and', variant(Shuttle3D, 'and')],
  ['pneu-quick-exhaust', QuickExhaust3D],
  ['pneu-throttle', Throttle3D],
  ['pneu-throttle-oneway', variant(Throttle3D, 'oneWay')],
  ['pneu-relief', Relief3D],
  ['pneu-regulator', variant(Relief3D, 'regulator')],
  ['pneu-timer', Timer3D],
  ['pneu-gauge', Gauge3D],
  ['pneu-flowmeter', Flowmeter3D],
  ...ALL_WAY_VALVES.map(({ cfg }) => [cfg.type, wayValve3D(cfg)] as [string, FC<Model3DProps>]),
]);

export function getModel3D(type: string): FC<Model3DProps> | null {
  return models.get(type) ?? null;
}

/**
 * Registro de los modelos 3D. Va aparte de views.ts para que Three.js sólo se descargue al
 * abrir la vista 3D (el editor 2D arranca sin él).
 */
import { createElement, type FC } from 'react';
import {
  Accumulator3D,
  HydCylinder3D,
  HydCylinderSingle3D,
  HydFilter3D,
  HydMotor3D,
  HydRelief3D,
  HydTank3D,
  HydThrottle3D,
  makeHydCheck3D,
  PowerUnit3D,
  Pump3D,
} from './hydraulic/models3d';
import {
  Counter3D,
  Lamp3D,
  makeContact3D,
  makeRail3D,
  makeRelay3D,
  Solenoid3D,
} from './electric/models3d';
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
  const Iso = makeWayValveIso3D(cfg);
  // Las 4/3 en tándem o en H tienen la corredera con taladro interior: sólo esquema ISO.
  const Real = cfg.spool === null ? Iso : makeWayValve3D(cfg);
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
  // Hidráulicos
  ['hyd-power-unit', PowerUnit3D],
  ['hyd-pump', Pump3D],
  ['hyd-tank', HydTank3D],
  ['hyd-accumulator', Accumulator3D],
  ['hyd-cyl-double', HydCylinder3D],
  ['hyd-cyl-single', HydCylinderSingle3D],
  ['hyd-motor', HydMotor3D],
  ['hyd-relief', HydRelief3D],
  ['hyd-filter', HydFilter3D],
  ['hyd-check', makeHydCheck3D(false)],
  ['hyd-pilot-check', makeHydCheck3D(true)],
  ['hyd-throttle', HydThrottle3D],
  ['hyd-flow-control', HydThrottle3D],
  ['hyd-gauge', Gauge3D],
  // Eléctricos
  ['elec-24v', makeRail3D('+24')],
  ['elec-0v', makeRail3D('0')],
  ['elec-button-no', makeContact3D('elec-button-no', 'button', 'no')],
  ['elec-button-nc', makeContact3D('elec-button-nc', 'button', 'nc')],
  ['elec-switch', makeContact3D('elec-switch', 'switch')],
  ['elec-estop', makeContact3D('elec-estop', 'estop', 'nc')],
  ['elec-contact', makeContact3D('elec-contact', 'relay')],
  ['elec-limit', makeContact3D('elec-limit', 'limit')],
  ['elec-proximity', makeContact3D('elec-proximity', 'proximity', 'no')],
  ['elec-pressure-switch', makeContact3D('elec-pressure-switch', 'pressure', 'co')],
  ['elec-relay', makeRelay3D(false)],
  ['elec-relay-timer', makeRelay3D(true)],
  ['elec-counter', Counter3D],
  ['elec-solenoid', Solenoid3D],
  ['elec-lamp', Lamp3D],
]);

export function getModel3D(type: string): FC<Model3DProps> | null {
  return models.get(type) ?? null;
}

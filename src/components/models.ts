/** Registro de la parte lógica de todos los componentes. Importar una vez al arrancar. */
import { registerModel } from '../core/registry';
import { cylinderDoubleModel } from './pneumatic/cylinder-double/model';
import { exhaustModel } from './pneumatic/exhaust/model';
import { gaugeModel } from './pneumatic/gauge/model';
import { supplyModel } from './pneumatic/supply/model';
import {
  VALVE_22NC,
  VALVE_32NC,
  VALVE_32NO,
  VALVE_42,
  VALVE_52,
  VALVE_53_CLOSED,
  VALVE_53_EXHAUST,
  VALVE_53_PRESSURE,
} from './pneumatic/way-valve/config';
import { makeWayValveModel } from './pneumatic/way-valve/model';

export const WAY_VALVES = [
  VALVE_32NC,
  VALVE_32NO,
  VALVE_52,
  VALVE_53_CLOSED,
  VALVE_53_EXHAUST,
  VALVE_53_PRESSURE,
  VALVE_42,
  VALVE_22NC,
];

let done = false;
export function registerAllModels() {
  if (done) return;
  done = true;
  registerModel(supplyModel);
  registerModel(exhaustModel);
  registerModel(cylinderDoubleModel);
  for (const cfg of WAY_VALVES) registerModel(makeWayValveModel(cfg));
  registerModel(gaugeModel);
}

/** Registro de la parte lógica de todos los componentes. Importar una vez al arrancar. */
import { registerModel } from '../core/registry';
import { cylinderDoubleModel } from './pneumatic/cylinder-double/model';
import { exhaustModel } from './pneumatic/exhaust/model';
import { gaugeModel } from './pneumatic/gauge/model';
import { supplyModel } from './pneumatic/supply/model';
import { VALVE_32NC, VALVE_32NO, VALVE_52 } from './pneumatic/way-valve/config';
import { makeWayValveModel } from './pneumatic/way-valve/model';

export const WAY_VALVES = [VALVE_52, VALVE_32NC, VALVE_32NO];

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

/** Registro de la parte lógica de todos los componentes. Importar una vez al arrancar. */
import { registerModel } from '../core/registry';
import { compressorModel } from './pneumatic/compressor/model';
import { cylinderDoubleModel } from './pneumatic/cylinder-double/model';
import { cylinderRodlessModel } from './pneumatic/cylinder-rodless/model';
import { cylinderSingleModel } from './pneumatic/cylinder-single/model';
import { exhaustModel } from './pneumatic/exhaust/model';
import { flowmeterModel } from './pneumatic/flowmeter/model';
import {
  regulatorModel,
  reliefModel,
  throttleModel,
  throttleOneWayModel,
} from './pneumatic/flowpressure/models';
import { frlModel } from './pneumatic/frl/model';
import { gaugeModel } from './pneumatic/gauge/model';
import { gripperModel } from './pneumatic/gripper/model';
import {
  checkValveModel,
  quickExhaustModel,
  shuttleAndModel,
  shuttleOrModel,
} from './pneumatic/logic/models';
import { motorModel } from './pneumatic/motor/model';
import { rotaryModel } from './pneumatic/rotary/model';
import { supplyModel } from './pneumatic/supply/model';
import { tankModel } from './pneumatic/tank/model';
import { timerModel } from './pneumatic/timer/model';
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
import { VALVE_PRESETS } from './pneumatic/way-valve/presets';

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

/** Todas las configuraciones de válvula de vías con su preajuste (genéricas + preconfiguradas). */
export const ALL_WAY_VALVES = [...WAY_VALVES.map((cfg) => ({ cfg, preset: {} })), ...VALVE_PRESETS];

let done = false;
export function registerAllModels() {
  if (done) return;
  done = true;
  // Alimentación
  registerModel(supplyModel);
  registerModel(compressorModel);
  registerModel(frlModel);
  registerModel(tankModel);
  registerModel(exhaustModel);
  // Actuadores
  registerModel(cylinderSingleModel);
  registerModel(cylinderDoubleModel);
  registerModel(cylinderRodlessModel);
  registerModel(rotaryModel);
  registerModel(motorModel);
  registerModel(gripperModel);
  // Válvulas de vías (y preconfiguradas: finales de carrera, pilotadas, secuencia)
  for (const { cfg, preset } of ALL_WAY_VALVES) registerModel(makeWayValveModel(cfg, preset));
  // Bloqueo y lógica
  registerModel(checkValveModel);
  registerModel(shuttleOrModel);
  registerModel(shuttleAndModel);
  registerModel(quickExhaustModel);
  // Caudal y presión
  registerModel(throttleModel);
  registerModel(throttleOneWayModel);
  registerModel(reliefModel);
  registerModel(regulatorModel);
  registerModel(timerModel);
  // Instrumentos
  registerModel(gaugeModel);
  registerModel(flowmeterModel);
}

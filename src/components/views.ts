/** Registro de la parte visual de los componentes (símbolo 2D; el modelo 3D llega en la fase 2). */
import { WAY_VALVES } from './models';
import { CylinderDoubleSymbol } from './pneumatic/cylinder-double/Symbol2D';
import { SilencerSymbol } from './pneumatic/exhaust/Symbol2D';
import { GaugeSymbol } from './pneumatic/gauge/Symbol2D';
import { SupplySymbol } from './pneumatic/supply/Symbol2D';
import { makeWayValveSymbol } from './pneumatic/way-valve/Symbol2D';
import type { ComponentView } from './symbols';

const views = new Map<string, ComponentView>([
  ['pneu-supply', { Symbol2D: SupplySymbol }],
  ['pneu-silencer', { Symbol2D: SilencerSymbol }],
  ['pneu-cyl-double', { Symbol2D: CylinderDoubleSymbol }],
  ['pneu-gauge', { Symbol2D: GaugeSymbol }],
  ...WAY_VALVES.map(
    (cfg) => [cfg.type, { Symbol2D: makeWayValveSymbol(cfg) }] as [string, ComponentView],
  ),
]);

export function getView(type: string): ComponentView {
  const v = views.get(type);
  if (!v) throw new Error(`Sin vista para ${type}`);
  return v;
}

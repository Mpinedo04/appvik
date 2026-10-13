/** Registro de la parte visual 2D de los componentes (el 3D está en views3d.ts). */
import { createElement } from 'react';
import { getModel, resolveParams } from '../core/registry';
import { ALL_WAY_VALVES } from './models';
import { GripperSymbol, MotorSymbol, RodlessSymbol, RotarySymbol } from './pneumatic/actuators2d';
import { CylinderDoubleSymbol, CylinderSingleSymbol } from './pneumatic/cylinder-double/Symbol2D';
import { SilencerSymbol } from './pneumatic/exhaust/Symbol2D';
import { GaugeSymbol } from './pneumatic/gauge/Symbol2D';
import { SupplySymbol } from './pneumatic/supply/Symbol2D';
import {
  CheckSymbol,
  CompressorSymbol,
  FlowmeterSymbol,
  FrlSymbol,
  QuickExhaustSymbol,
  RegulatorSymbol,
  ReliefSymbol,
  ShuttleAndSymbol,
  ShuttleOrSymbol,
  TankSymbol,
  ThrottleOneWaySymbol,
  ThrottleSymbol,
  TimerSymbol,
} from './pneumatic/symbols2d';
import { makeWayValveSymbol } from './pneumatic/way-valve/Symbol2D';
import { INK, type ComponentView, type SymbolProps } from './symbols';

const views = new Map<string, ComponentView>([
  ['pneu-supply', { Symbol2D: SupplySymbol }],
  ['pneu-compressor', { Symbol2D: CompressorSymbol }],
  ['pneu-frl', { Symbol2D: FrlSymbol }],
  ['pneu-tank', { Symbol2D: TankSymbol }],
  ['pneu-silencer', { Symbol2D: SilencerSymbol }],
  ['pneu-cyl-single', { Symbol2D: CylinderSingleSymbol }],
  ['pneu-cyl-double', { Symbol2D: CylinderDoubleSymbol }],
  ['pneu-cyl-rodless', { Symbol2D: RodlessSymbol }],
  ['pneu-rotary', { Symbol2D: RotarySymbol }],
  ['pneu-motor', { Symbol2D: MotorSymbol }],
  ['pneu-gripper', { Symbol2D: GripperSymbol }],
  ['pneu-check', { Symbol2D: CheckSymbol }],
  ['pneu-shuttle-or', { Symbol2D: ShuttleOrSymbol }],
  ['pneu-shuttle-and', { Symbol2D: ShuttleAndSymbol }],
  ['pneu-quick-exhaust', { Symbol2D: QuickExhaustSymbol }],
  ['pneu-throttle', { Symbol2D: ThrottleSymbol }],
  ['pneu-throttle-oneway', { Symbol2D: ThrottleOneWaySymbol }],
  ['pneu-relief', { Symbol2D: ReliefSymbol }],
  ['pneu-regulator', { Symbol2D: RegulatorSymbol }],
  ['pneu-timer', { Symbol2D: TimerSymbol }],
  ['pneu-gauge', { Symbol2D: GaugeSymbol }],
  ['pneu-flowmeter', { Symbol2D: FlowmeterSymbol }],
  ...ALL_WAY_VALVES.map(
    ({ cfg }) => [cfg.type, { Symbol2D: makeWayValveSymbol(cfg) }] as [string, ComponentView],
  ),
]);

/** Símbolo de reserva: recuadro con el nombre (para tipos sin dibujo propio). */
function fallback(type: string): ComponentView {
  return {
    Symbol2D: ({ params }: SymbolProps) => {
      const m = getModel(type);
      const b = m.bbox(resolveParams(m, params));
      return createElement(
        'g',
        null,
        createElement('rect', {
          x: b.x0,
          y: b.y0,
          width: b.x1 - b.x0,
          height: b.y1 - b.y0,
          fill: '#fff',
          stroke: INK,
        }),
        createElement(
          'text',
          { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, fontSize: 8, textAnchor: 'middle' },
          m.name,
        ),
      );
    },
  };
}

export function getView(type: string): ComponentView {
  let v = views.get(type);
  if (!v) {
    v = fallback(type);
    views.set(type, v);
  }
  return v;
}

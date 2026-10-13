import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllModels } from '../../components/models';
import { CircuitBuilder } from './builder';
import { pruneDanglingConnections } from './edit';
import { computeLabels } from './labels';

beforeAll(registerAllModels);

describe('etiquetado según la norma', () => {
  it('mando indirecto: 1A, 1V1 (potencia), 1V2 (regulación), 1S1 (pulsador), 0Z1 (alimentación)', () => {
    const b = new CircuitBuilder();
    const cyl = b.add('pneu-cyl-double', 300, 100);
    const fc = b.add('pneu-throttle-oneway', 330, 180);
    const power = b.add('pneu-valve-52-pilot', 270, 260);
    const btn = b.add('pneu-valve-32nc', 100, 360);
    const src = b.add('pneu-supply', 300, 480);
    b.connect(power, '4', cyl, '1');
    b.connect(power, '2', fc, '1');
    b.connect(fc, '2', cyl, '2');
    b.connect(src, '1', power, '1');
    b.teeAt(300, 420, btn, '1');
    b.connect(btn, '2', power, '14');
    const l = computeLabels(b.circuit);
    expect([l[cyl], l[power], l[fc], l[btn], l[src]]).toEqual(['1A', '1V1', '1V2', '1S1', '0Z1']);
  });

  it('los cilindros se numeran de izquierda a derecha y los rodillos llevan la etiqueta de su marca', () => {
    const b = new CircuitBuilder();
    const right = b.add('pneu-cyl-double', 600, 100);
    const left = b.add('pneu-cyl-double', 100, 100);
    const sw = b.add('pneu-limit-32', 300, 300, { sensor: '2S2' });
    const l = computeLabels(b.circuit);
    expect([l[left], l[right], l[sw]]).toEqual(['1A', '2A', '2S2']);
  });

  it('al quitar un pilotaje se borra la tubería que llegaba a ese puerto', () => {
    const b = new CircuitBuilder();
    const v = b.add('pneu-valve-52-pilot', 300, 300);
    const btn = b.add('pneu-valve-32nc', 100, 300);
    b.connect(btn, '2', v, '14');
    b.circuit.components[v].params.actLeft = 'pushbutton';
    pruneDanglingConnections(b.circuit);
    expect(Object.keys(b.circuit.connections)).toHaveLength(0);
  });
});

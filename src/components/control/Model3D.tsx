/** PLC en 3D: módulo de carril DIN con los LEDs de entradas y salidas. */
import { useRef } from 'react';
import * as THREE from 'three';
import { box, sphere } from '../../view3d/geom';
import { ledMat } from '../../view3d/materials';
import { useLiveState } from '../../view3d/useLive';
import { Part, Shell, type Model3DProps } from '../parts3d';
import { PLC_IO, plcInputX, type PlcState } from './plc';

export function Plc3D({ compId, mode }: Model3DProps) {
  const leds = useRef<(THREE.Mesh | null)[]>([]);
  const power = useRef<THREE.Mesh>(null);
  useLiveState<PlcState>(compId, (s) => {
    for (let i = 0; i < PLC_IO; i++) {
      const a = leds.current[i];
      const b = leds.current[PLC_IO + i];
      if (a) a.material = ledMat(!!s?.inputs[i], '#22c55e');
      if (b) b.material = ledMat(!!s?.outputs[i], '#f59e0b');
    }
    if (power.current) power.current.material = ledMat(!!s?.powered, '#22c55e');
  });
  return (
    <group>
      <Shell geom={box(186, 22, 64)} mat="white" mode={mode} position={[-5, 11, 0]} />
      <Part geom={box(186, 3, 8)} mat="dark" position={[-5, 23, -26]} />
      <Part geom={box(186, 3, 8)} mat="dark" position={[-5, 23, 26]} />
      <Part geom={box(30, 1, 20)} mat="dark" position={[-80, 22.6, 0]} />
      <mesh ref={power} geometry={sphere(2)} material={ledMat(false)} position={[-92, 24, -6]} />
      {Array.from({ length: PLC_IO }, (_, i) => (
        <group key={i}>
          <mesh
            ref={(m) => (leds.current[i] = m)}
            geometry={sphere(2.2)}
            material={ledMat(false, '#22c55e')}
            position={[plcInputX(i), 24, -14]}
          />
          <mesh
            ref={(m) => (leds.current[PLC_IO + i] = m)}
            geometry={sphere(2.2)}
            material={ledMat(false, '#f59e0b')}
            position={[plcInputX(i), 24, 14]}
          />
          <Part geom={box(5, 3, 6)} mat="brass" position={[plcInputX(i), 3, -36]} />
          <Part geom={box(5, 3, 6)} mat="brass" position={[plcInputX(i), 3, 36]} />
        </group>
      ))}
      <Part geom={box(5, 3, 6)} mat="brass" position={[-90, 3, -36]} />
      <Part geom={box(5, 3, 6)} mat="brass" position={[-90, 3, 36]} />
    </group>
  );
}

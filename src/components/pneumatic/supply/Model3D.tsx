import { useMemo, useRef } from 'react';
import type * as THREE from 'three';
import { num } from '../../../core/registry';
import { useSim } from '../../../store/sim';
import { setPressureColor } from '../../../view3d/colors';
import { box, cylX, cylY, cylZ, sphere } from '../../../view3d/geom';
import { AXIS_Y } from '../../../view3d/layout';
import { tintMat } from '../../../view3d/materials';
import { useLiveState } from '../../../view3d/useLive';
import { Fitting, Part, Shell, type Model3DProps } from '../../parts3d';

/** Toma de la red de aire: pequeño depósito con regulador y salida hacia el puerto 1. */
export function Supply3D({ compId, mode, params }: Model3DProps) {
  const air = useRef<THREE.Mesh>(null);
  const airMat = useMemo(() => tintMat(0.5), []);
  const pressure = num(params, 'pressure');

  useLiveState(compId, (s) => {
    if (air.current) air.current.visible = mode !== 'normal';
    // El depósito está siempre a la presión de la red mientras se simula.
    setPressureColor(airMat.color, s ? pressure : 0, useSim.getState().maxBar);
  });

  return (
    <group>
      <Shell geom={cylX(9, 22)} mat="anodizedBlue" mode={mode} position={[0, AXIS_Y - 2, 0]} />
      <Shell geom={sphere(9)} mat="anodizedBlue" mode={mode} position={[-11, AXIS_Y - 2, 0]} />
      <Shell geom={sphere(9)} mat="anodizedBlue" mode={mode} position={[11, AXIS_Y - 2, 0]} />
      <mesh ref={air} geometry={cylX(8, 30)} material={airMat} position={[0, AXIS_Y - 2, 0]} />
      {/* Regulador con mando */}
      <Part geom={box(10, 8, 10)} mat="aluminium" position={[0, AXIS_Y + 9, 0]} />
      <Part geom={cylY(4.5, 6)} mat="black" position={[0, AXIS_Y + 16, 0]} />
      {/* Salida */}
      <Part geom={cylZ(2.5, 8)} mat="brass" position={[0, AXIS_Y, -12]} />
      <Fitting at={[0, -20]} out="z-" />
    </group>
  );
}

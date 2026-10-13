import { useMemo, useRef } from 'react';
import type * as THREE from 'three';
import { box, cylX, oringX, pipeX } from '../../../view3d/geom';
import { AXIS_Y } from '../../../view3d/layout';
import { setPressureColor } from '../../../view3d/colors';
import { tintMat } from '../../../view3d/materials';
import { useLiveState } from '../../../view3d/useLive';
import { useSim } from '../../../store/sim';
import { Fitting, Part, Shell, type Model3DProps } from '../../parts3d';
import type { CylinderState } from './model';

/** Geometría (unidades de dibujo) coherente con el símbolo: camisa de x = −60 a 40. */
const X0 = -60;
const X1 = 40;
const R_OUT = 12;
const R_IN = 10.4;
const PISTON_W = 6;
const P_MIN = X0 + 4 + PISTON_W / 2;
const P_MAX = X1 - 4 - PISTON_W / 2;
const ROD_LEN = 100;

/**
 * Cilindro de doble efecto: camisa, culatas con tirantes, émbolo con juntas, vástago y las
 * dos cámaras teñidas según su presión (visibles en rayos X o en corte).
 */
export function CylinderDouble3D({ compId, mode, params }: Model3DProps) {
  const piston = useRef<THREE.Group>(null);
  const capCh = useRef<THREE.Mesh>(null);
  const rodCh = useRef<THREE.Mesh>(null);
  const capMat = useMemo(() => tintMat(0.45), []);
  const rodMat = useMemo(() => tintMat(0.45), []);
  const startPos = Number(params.startPos ?? 0) / 100;

  useLiveState<CylinderState>(compId, (s) => {
    const pos = s?.pos ?? startPos;
    const px = P_MIN + (P_MAX - P_MIN) * pos;
    if (piston.current) piston.current.position.x = px;
    const maxBar = useSim.getState().maxBar;
    const inner0 = X0 + 4;
    const inner1 = X1 - 4;
    const capLen = Math.max(0.01, px - PISTON_W / 2 - inner0);
    const rodLen = Math.max(0.01, inner1 - (px + PISTON_W / 2));
    if (capCh.current) {
      capCh.current.scale.x = capLen;
      capCh.current.position.x = inner0 + capLen / 2;
      capCh.current.visible = !!s && mode !== 'normal';
      setPressureColor(capMat.color, s?.pCap ?? 0, maxBar);
    }
    if (rodCh.current) {
      rodCh.current.scale.x = rodLen;
      rodCh.current.position.x = inner1 - rodLen / 2;
      rodCh.current.visible = !!s && mode !== 'normal';
      setPressureColor(rodMat.color, s?.pRod ?? 0, maxBar);
    }
  });

  const tie = (y: number, z: number) => (
    <Part
      key={`${y}${z}`}
      geom={cylX(1.2, X1 - X0 + 2)}
      mat="steel"
      position={[(X0 + X1) / 2, AXIS_Y + y, z]}
    />
  );

  return (
    <group>
      {/* Camisa y culatas */}
      <Shell
        geom={pipeX(R_OUT, R_IN, X1 - X0 - 8)}
        mat="aluminium"
        mode={mode}
        position={[(X0 + X1) / 2, AXIS_Y, 0]}
      />
      <Shell geom={box(8, 28, 28)} mat="aluminium" mode={mode} position={[X0 + 4, AXIS_Y, 0]} />
      <Shell geom={box(8, 28, 28)} mat="aluminium" mode={mode} position={[X1 - 4, AXIS_Y, 0]} />
      {tie(11, 11)}
      {tie(11, -11)}
      {tie(-11, 11)}
      {tie(-11, -11)}

      {/* Cámaras (aire a presión) */}
      <mesh
        ref={capCh}
        geometry={cylX(R_IN - 0.2, 1)}
        material={capMat}
        position={[0, AXIS_Y, 0]}
      />
      <mesh
        ref={rodCh}
        geometry={cylX(R_IN - 0.2, 1)}
        material={rodMat}
        position={[0, AXIS_Y, 0]}
      />

      {/* Émbolo + vástago (se mueven juntos) */}
      <group ref={piston} position={[P_MIN, 0, 0]}>
        <Part geom={cylX(R_IN - 0.3, PISTON_W)} mat="aluminium" position={[0, AXIS_Y, 0]} />
        <Part geom={oringX(R_IN - 0.6, 0.7)} mat="dark" position={[-1.6, AXIS_Y, 0]} />
        <Part geom={oringX(R_IN - 0.6, 0.7)} mat="dark" position={[1.6, AXIS_Y, 0]} />
        <Part geom={cylX(3.2, ROD_LEN)} mat="steel" position={[ROD_LEN / 2, AXIS_Y, 0]} shadow />
        <Part geom={cylX(4.5, 6, 6)} mat="steel" position={[ROD_LEN - 2, AXIS_Y, 0]} />
      </group>

      {/* Conexiones (puertos en x = −50 y x = 30, z = 30) con su conducto hasta la cámara */}
      <Shell geom={box(7, 8, 9)} mat="aluminium" mode={mode} position={[-50, AXIS_Y, 15.5]} />
      <Shell geom={box(7, 8, 9)} mat="aluminium" mode={mode} position={[30, AXIS_Y, 15.5]} />
      <Fitting at={[-50, 30]} out="z+" />
      <Fitting at={[30, 30]} out="z+" />
    </group>
  );
}

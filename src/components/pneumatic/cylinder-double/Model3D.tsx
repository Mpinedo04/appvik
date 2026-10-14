import { useMemo, useRef } from 'react';
import type * as THREE from 'three';
import { num } from '../../../core/registry';
import { maxBarFor } from '../../../store/sim';
import { setPressureColor } from '../../../view3d/colors';
import { box, cylX, oringX, pipeX } from '../../../view3d/geom';
import { AXIS_Y } from '../../../view3d/layout';
import { partMat, tintMat } from '../../../view3d/materials';
import { useLiveState } from '../../../view3d/useLive';
import { Fitting, Part, Shell, Spring, setSpring, type Model3DProps } from '../../parts3d';
import { parseMarks, type CylState } from '../cylinder-core';

/** Geometría (unidades de dibujo) coherente con el símbolo: camisa de x = −60 a 40. */
const X0 = -60;
const X1 = 40;
const R_OUT = 12;
const R_IN = 10.4;
const PISTON_W = 6;
const P_MIN = X0 + 4 + PISTON_W / 2;
const P_MAX = X1 - 4 - PISTON_W / 2;
const ROD_LEN = 100;
const RAIL_Z = -17;

/**
 * Cilindro con vástago: camisa, culatas con tirantes, émbolo con juntas, vástago y cámaras
 * teñidas según su presión (visibles en rayos X o en corte). En el de simple efecto, el muelle
 * de retorno se ve comprimirse dentro de la cámara delantera. Si tiene marcas de final de
 * carrera, una regla junto al vástago muestra las levas.
 */
export function CylinderRod3D({
  compId,
  mode,
  params,
  single,
  noSpring,
  medium,
}: Model3DProps & { single?: boolean; noSpring?: boolean }) {
  const piston = useRef<THREE.Group>(null);
  const capCh = useRef<THREE.Mesh>(null);
  const rodCh = useRef<THREE.Mesh>(null);
  const spring = useRef<THREE.InstancedMesh>(null);
  const capMat = useMemo(() => tintMat(0.45), []);
  const rodMat = useMemo(() => tintMat(0.45), []);
  const camMats = useRef<Map<string, THREE.MeshStandardMaterial>>(new Map());
  const startPos = Number(params.startPos ?? 0) / 100;
  const marks = parseMarks(String(params.marks ?? ''));
  const stroke = num(params, 'stroke');

  useLiveState<CylState>(compId, (s) => {
    const pos = s?.pos ?? startPos;
    const px = P_MIN + (P_MAX - P_MIN) * pos;
    if (piston.current) piston.current.position.x = px;
    const maxBar = maxBarFor(medium);
    const inner0 = X0 + 4;
    const inner1 = X1 - 4;
    const capLen = Math.max(0.01, px - PISTON_W / 2 - inner0);
    const rodLen = Math.max(0.01, inner1 - (px + PISTON_W / 2));
    if (capCh.current) {
      capCh.current.scale.x = capLen;
      capCh.current.position.x = inner0 + capLen / 2;
      capCh.current.visible = !!s && mode !== 'normal';
      setPressureColor(capMat.color, s?.pCap ?? 0, maxBar, medium);
    }
    if (rodCh.current) {
      rodCh.current.scale.x = rodLen;
      rodCh.current.position.x = inner1 - rodLen / 2;
      rodCh.current.visible = !single && !!s && mode !== 'normal';
      setPressureColor(rodMat.color, s?.pRod ?? 0, maxBar, medium);
    }
    setSpring(spring.current, px + PISTON_W / 2, rodLen);
    for (const [label, mat] of camMats.current) {
      const on = s?.activeMarks?.includes(label);
      mat.emissive.set(on ? '#2563eb' : '#000000');
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
  // La leva va en la punta del vástago: su recorrido es el mismo que el del émbolo.
  const tipX = (frac: number) => P_MIN + (P_MAX - P_MIN) * frac + ROD_LEN - 2;
  const camMat = (label: string) => {
    let m = camMats.current.get(label);
    if (!m) {
      m = (partMat('red') as THREE.MeshStandardMaterial).clone();
      camMats.current.set(label, m);
    }
    return m;
  };

  return (
    <group>
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
      {single && !noSpring && <Spring ref={spring} x0={0} length={1} radius={7} />}

      <group ref={piston} position={[P_MIN, 0, 0]}>
        <Part geom={cylX(R_IN - 0.3, PISTON_W)} mat="aluminium" position={[0, AXIS_Y, 0]} />
        <Part geom={oringX(R_IN - 0.6, 0.7)} mat="dark" position={[-1.6, AXIS_Y, 0]} />
        <Part geom={oringX(R_IN - 0.6, 0.7)} mat="dark" position={[1.6, AXIS_Y, 0]} />
        <Part geom={cylX(3.2, ROD_LEN)} mat="steel" position={[ROD_LEN / 2, AXIS_Y, 0]} shadow />
        <Part geom={cylX(4.5, 6, 6)} mat="steel" position={[ROD_LEN - 2, AXIS_Y, 0]} />
        {marks.length > 0 && (
          <Part geom={box(3, 3, 14)} mat="steel" position={[ROD_LEN - 2, AXIS_Y, RAIL_Z / 2]} />
        )}
      </group>

      {/* Regla de finales de carrera: marcas fijas donde la leva del vástago acciona los rodillos */}
      {marks.length > 0 && (
        <group>
          <Part
            geom={box(tipX(1) - tipX(0) + 10, 2, 3)}
            mat="aluminium"
            position={[(tipX(0) + tipX(1)) / 2, AXIS_Y - 6, RAIL_Z]}
          />
          {marks.map((m) => (
            <mesh
              key={m.label}
              geometry={box(3, 7, 5)}
              material={camMat(m.label)}
              position={[
                tipX(Math.max(0, Math.min(1, m.mm / Math.max(1, stroke)))),
                AXIS_Y - 2,
                RAIL_Z,
              ]}
            />
          ))}
        </group>
      )}

      <Shell geom={box(7, 8, 9)} mat="aluminium" mode={mode} position={[-50, AXIS_Y, 15.5]} />
      <Fitting at={[-50, 30]} out="z+" />
      {single ? (
        // Respiradero de la cámara del muelle
        <Part
          geom={cylX(2, 4)}
          mat="bronze"
          position={[30, AXIS_Y + 13, 0]}
          rotation={[0, 0, Math.PI / 2]}
        />
      ) : (
        <>
          <Shell geom={box(7, 8, 9)} mat="aluminium" mode={mode} position={[30, AXIS_Y, 15.5]} />
          <Fitting at={[30, 30]} out="z+" />
        </>
      )}
    </group>
  );
}

export const CylinderDouble3D = (p: Model3DProps) => <CylinderRod3D {...p} />;
export const CylinderSingle3D = (p: Model3DProps) => <CylinderRod3D {...p} single />;

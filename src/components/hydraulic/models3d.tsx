/**
 * Componentes hidráulicos en 3D. Carcasas de acero/fundición y, en rayos X o en corte, el aceite
 * teñido según su presión (escala ámbar → rojo) y las piezas que se mueven: engranajes de la
 * bomba, asiento de la limitadora, bola del antirretorno, vejiga del acumulador, eje del motor.
 */
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { maxBarFor } from '../../store/sim';
import { setPressureColor } from '../../view3d/colors';
import { box, cylX, cylY, sphere } from '../../view3d/geom';
import { AXIS_Y } from '../../view3d/layout';
import { coilMat, tintMat } from '../../view3d/materials';
import { useLiveState } from '../../view3d/useLive';
import { Fitting, Part, Shell, Spring, setSpring, type Model3DProps } from '../parts3d';
import { CylinderRod3D } from '../pneumatic/cylinder-double/Model3D';

const Y = AXIS_Y;
const oil = (c: THREE.Color, bar: number) => setPressureColor(c, bar, maxBarFor('hyd'), 'hyd');
const useOil = (opacity = 0.6) => useMemo(() => tintMat(opacity), [opacity]);

/** Engranaje sencillo (disco con dientes) en el plano XZ. */
function Gear({ r, teeth, mat }: { r: number; teeth: number; mat: 'steel' | 'aluminium' }) {
  return (
    <group>
      <Part geom={cylY(r, 4, 24)} mat={mat} />
      {Array.from({ length: teeth }, (_, i) => {
        const a = (i / teeth) * Math.PI * 2;
        return (
          <Part
            key={i}
            geom={box(2.2, 4, 2.2)}
            mat={mat}
            position={[Math.cos(a) * (r + 0.8), 0, Math.sin(a) * (r + 0.8)]}
            rotation={[0, -a, 0]}
          />
        );
      })}
    </group>
  );
}

/* ───────────── Grupo hidráulico ───────────── */

export function PowerUnit3D({ compId, mode }: Model3DProps) {
  const fan = useRef<THREE.Group>(null);
  const g1 = useRef<THREE.Group>(null);
  const g2 = useRef<THREE.Group>(null);
  const poppet = useRef<THREE.Mesh>(null);
  const oilTank = useOil(0.55);
  const oilP = useOil(0.8);
  const motorCoil = useRef<THREE.Mesh>(null);
  useLiveState<{ on: boolean; angle: number; pBar: number; relief: number }>(compId, (s) => {
    const a = s?.angle ?? 0;
    if (fan.current) fan.current.rotation.x = a;
    if (g1.current) g1.current.rotation.y = a;
    if (g2.current) g2.current.rotation.y = -a;
    if (poppet.current) poppet.current.position.x = 14 + (s?.relief ?? 0) * 3;
    oil(oilTank.color, 0);
    oil(oilP.color, s?.pBar ?? 0);
    if (motorCoil.current) motorCoil.current.material = coilMat(!!s?.on);
  });
  return (
    <group>
      {/* Depósito con el aceite dentro */}
      <Shell geom={box(76, 26, 56)} mat="steel" mode={mode} position={[0, 13, 4]} />
      <mesh
        geometry={box(72, 18, 52)}
        material={oilTank}
        position={[0, 10, 4]}
        visible={mode !== 'normal'}
      />
      {/* Tapa con motor y bomba */}
      <Part geom={box(78, 2, 58)} mat="aluminium" position={[0, 27, 4]} />
      <group position={[-22, 40, 6]}>
        <Shell geom={cylX(10, 26)} mat="anodizedBlue" mode={mode} />
        <mesh
          ref={motorCoil}
          geometry={cylX(7, 18, 24)}
          material={coilMat(false)}
          visible={mode !== 'normal'}
        />
        <group ref={fan} position={[-15, 0, 0]}>
          <Part geom={box(1.5, 18, 3)} mat="black" />
          <Part geom={box(1.5, 3, 18)} mat="black" />
        </group>
        <Part geom={cylX(1.8, 20)} mat="steel" position={[20, 0, 0]} />
      </group>
      {/* Bomba de engranajes (se ven girar en rayos X o en corte) */}
      <group position={[-10, 34, -10]}>
        <Shell geom={box(16, 12, 22)} mat="aluminium" mode={mode} />
        <group ref={g1} position={[0, 0, -4.5]}>
          <Gear r={3.6} teeth={10} mat="steel" />
        </group>
        <group ref={g2} position={[0, 0, 4.5]}>
          <Gear r={3.6} teeth={10} mat="steel" />
        </group>
      </group>
      {/* Bloque de válvulas con la limitadora y los racores P y T */}
      {/* Bloque de conexiones delante del depósito, a la altura de las tuberías */}
      <Shell geom={box(36, 12, 10)} mat="anodizedBlue" mode={mode} position={[0, Y, -25]} />
      <mesh
        geometry={cylX(2.4, 30)}
        material={oilP}
        position={[-4, Y, -25]}
        visible={mode !== 'normal'}
      />
      <mesh ref={poppet} geometry={cylX(2.6, 4)} material={tintMat(1)} position={[14, Y, -25]} />
      <Part geom={cylY(1.6, 20)} mat="steel" position={[-10, Y + 14, -14]} />
      <Fitting at={[-10, -40]} out="z-" />
      <Fitting at={[10, -40]} out="z-" />
    </group>
  );
}

export function Pump3D({ compId, mode }: Model3DProps) {
  const g1 = useRef<THREE.Group>(null);
  const g2 = useRef<THREE.Group>(null);
  useLiveState<{ angle: number }>(compId, (s) => {
    const a = s?.angle ?? 0;
    if (g1.current) g1.current.rotation.y = a;
    if (g2.current) g2.current.rotation.y = -a;
  });
  return (
    <group>
      <Shell geom={box(26, 20, 36)} mat="aluminium" mode={mode} position={[0, Y, 0]} />
      <group ref={g1} position={[-5, Y, 0]}>
        <Gear r={4.4} teeth={12} mat="steel" />
      </group>
      <group ref={g2} position={[5, Y, 0]}>
        <Gear r={4.4} teeth={12} mat="steel" />
      </group>
      <Part geom={cylX(2, 14)} mat="steel" position={[-20, Y, 0]} />
      <Fitting at={[0, -30]} out="z-" />
      <Fitting at={[0, 30]} out="z+" />
    </group>
  );
}

export function HydTank3D({ mode }: Model3DProps) {
  return (
    <group>
      <Shell geom={box(24, 12, 16)} mat="steel" mode={mode} position={[0, 6, 0]} />
      <Fitting at={[0, -20]} out="z-" y={9} />
    </group>
  );
}

/* ───────────── Válvulas ───────────── */

/** Cuerpo en línea a lo largo de X con racores en ±30. */
function InlineX({ mode, w = 36 }: { mode: Model3DProps['mode']; w?: number }) {
  return (
    <>
      <Shell geom={box(w, 22, 22)} mat="anodizedBlue" mode={mode} position={[0, Y, 0]} />
      <Fitting at={[-30, 0]} out="x-" />
      <Fitting at={[30, 0]} out="x+" />
    </>
  );
}

export function HydRelief3D({ compId, mode }: Model3DProps) {
  const poppet = useRef<THREE.Group>(null);
  const spring = useRef<THREE.InstancedMesh>(null);
  const p = useOil(0.75);
  useLiveState<{ open: number; p1: number }>(compId, (s) => {
    const lift = (s?.open ?? 0) * 4;
    if (poppet.current) poppet.current.position.y = Y + lift;
    // Muelle vertical (grupo girado): entre el asiento y la tapa.
    setSpring(spring.current, 4 + lift, 14 - lift);
    oil(p.color, s?.p1 ?? 0);
  });
  return (
    <group>
      <Shell geom={box(22, 40, 22)} mat="anodizedBlue" mode={mode} position={[0, Y + 6, 0]} />
      <Part geom={cylY(5, 6)} mat="black" position={[0, Y + 30, 0]} />
      <mesh
        geometry={cylX(2.5, 26)}
        material={p}
        position={[-13, Y, 0]}
        visible={mode !== 'normal'}
      />
      <group ref={poppet} position={[0, Y, 0]}>
        <Part geom={cylY(3.4, 4)} mat="steel" />
      </group>
      <group rotation={[0, 0, Math.PI / 2]} position={[0, Y, 0]}>
        <Spring ref={spring} x0={4} length={14} radius={3} />
      </group>
      <Fitting at={[-30, 0]} out="x-" />
      <Fitting at={[0, 30]} out="z+" />
    </group>
  );
}

export function HydFilter3D({ mode }: Model3DProps) {
  return (
    <group>
      <Part geom={box(30, 8, 16)} mat="aluminium" position={[0, Y + 6, 0]} />
      <Shell geom={cylY(9, 30, 24)} mat="steel" mode={mode} position={[0, Y - 8, 0]} />
      <Part geom={cylY(6, 26, 24)} mat="white" position={[0, Y - 8, 0]} />
      <Fitting at={[-30, 0]} out="x-" y={Y + 6} />
      <Fitting at={[30, 0]} out="x+" y={Y + 6} />
    </group>
  );
}

export function makeHydCheck3D(pilot: boolean) {
  return function HydCheck3D({ compId, mode }: Model3DProps) {
    const ball = useRef<THREE.Mesh>(null);
    const piston = useRef<THREE.Mesh>(null);
    const spring = useRef<THREE.InstancedMesh>(null);
    const o1 = useOil(0.7);
    const o2 = useOil(0.7);
    useLiveState<{ open: number; p1: number; p2: number; pX: number }>(compId, (s) => {
      const lift = (s?.open ?? 0) * 5;
      if (ball.current) ball.current.position.x = 1 + lift;
      if (piston.current) piston.current.position.x = -10 + (pilot && (s?.pX ?? 0) > 1 ? 6 : 0);
      setSpring(spring.current, 6 + lift, 10 - lift);
      oil(o1.color, s?.p1 ?? 0);
      oil(o2.color, s?.p2 ?? 0);
    });
    return (
      <group>
        <InlineX mode={mode} w={40} />
        <mesh
          geometry={cylX(3, 18)}
          material={o1}
          position={[-12, Y, 0]}
          visible={mode !== 'normal'}
        />
        <mesh
          geometry={cylX(3, 18)}
          material={o2}
          position={[12, Y, 0]}
          visible={mode !== 'normal'}
        />
        <Part geom={cylX(5, 2)} mat="brass" position={[-2, Y, 0]} />
        <mesh ref={ball} geometry={sphere(4)} material={ballMat()} position={[1, Y, 0]} />
        <Spring ref={spring} x0={6} length={10} radius={3} />
        {pilot && (
          <>
            <mesh ref={piston} geometry={cylX(2, 10)} material={ballMat()} position={[-10, Y, 0]} />
            <Fitting at={[0, 30]} out="z+" />
          </>
        )}
      </group>
    );
  };
}

let ball: THREE.Material | null = null;
const ballMat = () =>
  (ball ??= new THREE.MeshStandardMaterial({ color: '#cbd5e1', metalness: 0.9, roughness: 0.15 }));

export function HydThrottle3D({ compId, mode, params }: Model3DProps) {
  const needle = useRef<THREE.Mesh>(null);
  const o = useOil(0.7);
  const pct = Number(params.pct ?? params.qset ?? 50);
  useLiveState<{ p1: number; open: number }>(compId, (s) => {
    oil(o.color, s?.p1 ?? 0);
    if (needle.current && s?.open !== undefined && params.qset !== undefined)
      needle.current.position.y = Y + 2 + (1 - s.open) * -3;
  });
  return (
    <group>
      <InlineX mode={mode} />
      <mesh geometry={cylX(3, 50)} material={o} position={[0, Y, 0]} visible={mode !== 'normal'} />
      <mesh
        ref={needle}
        geometry={cylY(2.4, 12)}
        material={ballMat()}
        position={[0, Y + 2 + (1 - Math.min(100, pct) / 100) * -3, 0]}
      />
      <Part geom={cylY(6, 4)} mat="black" position={[0, Y + 14, 0]} />
    </group>
  );
}

export function Accumulator3D({ compId, mode }: Model3DProps) {
  const bladder = useRef<THREE.Mesh>(null);
  const o = useOil(0.7);
  const level = useRef<THREE.Mesh>(null);
  useLiveState<{ fill: number; pBar: number }>(compId, (s) => {
    const f = s?.fill ?? 0;
    if (bladder.current) {
      const k = Math.max(0.15, 1 - f);
      bladder.current.scale.set(Math.sqrt(k), k, Math.sqrt(k));
      bladder.current.position.y = 44 - (1 - k) * 16;
    }
    if (level.current) {
      level.current.scale.y = Math.max(0.02, f);
      level.current.position.y = 14 + (f * 34) / 2;
    }
    oil(o.color, s?.pBar ?? 0);
  });
  return (
    <group>
      <Shell geom={cylY(13, 50, 32)} mat="red" mode={mode} position={[0, 38, 0]} />
      <Part geom={sphere(13)} mat="red" position={[0, 63, 0]} scale={[1, 0.5, 1]} />
      <mesh
        ref={level}
        geometry={cylY(11.5, 34, 24)}
        material={o}
        position={[0, 14, 0]}
        visible={mode !== 'normal'}
      />
      <mesh
        ref={bladder}
        geometry={sphere(11)}
        material={partGas()}
        position={[0, 44, 0]}
        visible={mode !== 'normal'}
      />
      <Part geom={cylY(4, 10)} mat="steel" position={[0, 9, 0]} />
      <Fitting at={[0, 30]} out="z+" y={8} />
    </group>
  );
}

let gas: THREE.Material | null = null;
const partGas = () =>
  (gas ??= new THREE.MeshStandardMaterial({
    color: '#94a3b8',
    roughness: 0.6,
    transparent: true,
    opacity: 0.85,
  }));

/* ───────────── Actuadores ───────────── */

export function HydMotor3D({ compId, mode }: Model3DProps) {
  const shaft = useRef<THREE.Group>(null);
  useLiveState<{ angle: number }>(compId, (s) => {
    if (shaft.current) shaft.current.rotation.x = s?.angle ?? 0;
  });
  return (
    <group>
      <Shell geom={cylX(15, 28, 32)} mat="anodizedBlue" mode={mode} position={[0, Y + 4, 0]} />
      <Part geom={box(8, 34, 34)} mat="aluminium" position={[-14, Y + 4, 0]} />
      <group ref={shaft} position={[24, Y + 4, 0]}>
        <Part geom={cylX(3, 18)} mat="steel" />
        <Part geom={box(2, 22, 4)} mat="red" position={[8, 0, 0]} />
      </group>
      <Fitting at={[-10, 30]} out="z+" />
      <Fitting at={[10, 30]} out="z+" />
    </group>
  );
}

export const HydCylinder3D = (p: Model3DProps) => <CylinderRod3D {...p} />;
export const HydCylinderSingle3D = (p: Model3DProps) => <CylinderRod3D {...p} single noSpring />;

/**
 * Modelos 3D de la biblioteca neumática ampliada (fase 3). Todos se construyen con las mismas
 * piezas (carcasas que admiten rayos X / corte, piezas internas que se mueven con el estado).
 */
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { num } from '../../core/registry';
import { useSim } from '../../store/sim';
import { setPressureColor } from '../../view3d/colors';
import { box, cylX, cylY, cylZ, pipeX, sphere } from '../../view3d/geom';
import { AXIS_Y } from '../../view3d/layout';
import { tintMat } from '../../view3d/materials';
import { useLiveState } from '../../view3d/useLive';
import { Fitting, Part, Shell, Spring, setSpring, type Model3DProps } from '../parts3d';
import { TIMER_CFG, TIMER_SIGNAL_X } from './timer/model';
import { boxesExtent } from './way-valve/config';
import { makeWayValve3D } from './way-valve/Model3D';

const Y = AXIS_Y;
const maxBar = () => useSim.getState().maxBar;

/** Material teñido por presión que se actualiza en cada fotograma. */
function useTint(opacity = 0.5) {
  return useMemo(() => tintMat(opacity), [opacity]);
}

/** Cuerpo en línea vertical del esquema (1 abajo → 2 arriba), que en 3D va a lo largo de Z. */
function InlineBody({
  mode,
  len = 36,
  w = 18,
  h = 22,
  mat = 'aluminium' as const,
}: {
  mode: Model3DProps['mode'];
  len?: number;
  w?: number;
  h?: number;
  mat?: 'aluminium' | 'anodizedBlue';
}) {
  return (
    <>
      <Shell geom={box(w, h, len)} mat={mat} mode={mode} position={[0, Y, 0]} />
      <Fitting at={[0, 30]} out="z+" />
      <Fitting at={[0, -30]} out="z-" />
    </>
  );
}

// ------------------------------------------------------------------ Antirretorno
export function Check3D({ compId, mode }: Model3DProps) {
  const ball = useRef<THREE.Mesh>(null);
  const spring = useRef<THREE.InstancedMesh>(null);
  const air = useTint(0.35);
  useLiveState(compId, (s: { lift: number; dp: number } | undefined) => {
    const lift = s?.lift ?? 0;
    // El aire entra por 1 (z+) y empuja la bola hacia 2 (z−).
    const bz = 2 - lift * 6;
    if (ball.current) ball.current.position.z = bz;
    // Muelle entre la bola y el fondo (lado de 2); el grupo está girado: x local = −z.
    setSpring(spring.current, 5 - bz, bz + 9);
    setPressureColor(air.color, s ? Math.max(0, s.dp) : 0, maxBar());
  });
  return (
    <group>
      <InlineBody mode={mode} />
      <Part geom={cylZ(6, 3)} mat="brass" position={[0, Y, 7]} />
      <mesh
        ref={ball}
        geometry={sphere(5)}
        material={
          new THREE.MeshStandardMaterial({ color: '#cbd5e1', metalness: 0.9, roughness: 0.15 })
        }
        position={[0, Y, 2]}
      />
      <group rotation={[0, Math.PI / 2, 0]}>
        <Spring ref={spring} x0={-14} length={8} radius={3.5} />
      </group>
      <mesh
        geometry={cylZ(3, 14)}
        material={air}
        position={[0, Y, 13]}
        visible={mode !== 'normal'}
      />
    </group>
  );
}

// ------------------------------------------------------------------ Estranguladoras
export function Throttle3D({ compId, mode, params, oneWay }: Model3DProps & { oneWay?: boolean }) {
  const pct = num(params, 'pct');
  const ball = useRef<THREE.Mesh>(null);
  const air = useTint(0.35);
  useLiveState(compId, (s: { flowLmin: number; freeLmin: number } | undefined) => {
    if (ball.current) ball.current.position.z = 2 - (s && s.freeLmin > 1 ? 5 : 0);
    setPressureColor(
      air.color,
      s && (Math.abs(s.flowLmin) > 1 || s.freeLmin > 1) ? maxBar() * 0.6 : 0,
      maxBar(),
    );
  });
  // La aguja baja más cuanto más cerrada está.
  const needleY = Y + 2 + (pct / 100) * 8;
  return (
    <group>
      <InlineBody mode={mode} w={20} />
      <mesh
        geometry={cylZ(2.4, 34)}
        material={air}
        position={[0, Y, 0]}
        visible={mode !== 'normal'}
      />
      <Part
        geom={new THREE.ConeGeometry(3, 8, 20).rotateX(Math.PI)}
        mat="steel"
        position={[0, needleY, 0]}
      />
      <Part geom={cylY(1.5, 14)} mat="steel" position={[0, needleY + 10, 0]} />
      <Part geom={cylY(5, 4)} mat="black" position={[0, Y + 20, 0]} />
      {oneWay && (
        <group>
          <Shell geom={box(12, 16, 30)} mat="aluminium" mode={mode} position={[-15, Y, 0]} />
          <mesh
            ref={ball}
            geometry={sphere(3.5)}
            material={
              new THREE.MeshStandardMaterial({ color: '#cbd5e1', metalness: 0.9, roughness: 0.15 })
            }
            position={[-15, Y, 2]}
          />
          <Part geom={cylZ(4.5, 2)} mat="brass" position={[-15, Y, 6]} />
        </group>
      )}
    </group>
  );
}

// ------------------------------------------------------------------ Limitadora / reguladora
export function Relief3D({ compId, mode, regulator }: Model3DProps & { regulator?: boolean }) {
  const poppet = useRef<THREE.Mesh>(null);
  const spring = useRef<THREE.InstancedMesh>(null);
  const diaphragm = useTint(0.9);
  useLiveState(
    compId,
    (s: { open: number; relief?: number; p1: number; p2?: number } | undefined) => {
      const open = s?.open ?? (regulator ? 1 : 0);
      const lift = regulator ? 1 - open : open;
      if (poppet.current) poppet.current.position.y = Y + 4 + lift * 4;
      // Muelle entre el obturador y el tope del bonete (el grupo está girado: x local = y).
      setSpring(spring.current, 4 * lift - 6, 20 - 4 * lift);
      setPressureColor(diaphragm.color, s ? (regulator ? (s.p2 ?? 0) : s.p1) : 0, maxBar());
    },
  );
  return (
    <group>
      <InlineBody mode={mode} w={22} mat="anodizedBlue" />
      {regulator && (
        <>
          <Shell geom={box(10, 14, 12)} mat="anodizedBlue" mode={mode} position={[16, Y, 0]} />
          <Fitting at={[30, 0]} out="x+" />
        </>
      )}
      {/* Bonete con muelle y mando de ajuste */}
      <Shell geom={cylY(10, 16)} mat="aluminium" mode={mode} position={[0, Y + 18, 0]} />
      <mesh geometry={cylY(9, 1.5)} material={diaphragm} position={[0, Y + 11, 0]} />
      <mesh
        ref={poppet}
        geometry={cylY(4, 4)}
        material={
          new THREE.MeshStandardMaterial({ color: '#94a3b8', metalness: 0.8, roughness: 0.3 })
        }
        position={[0, Y + 4, 0]}
      />
      <group position={[0, Y + 12, 0]} rotation={[0, 0, Math.PI / 2]}>
        <Spring ref={spring} x0={0} length={12} radius={5} y={0} />
      </group>
      <Part geom={cylY(6, 5)} mat="black" position={[0, Y + 29, 0]} />
    </group>
  );
}

// ------------------------------------------------------------------ Selectora / simultaneidad
export function Shuttle3D({ compId, mode, and }: Model3DProps & { and?: boolean }) {
  const ball = useRef<THREE.Group>(null);
  const out = useTint(0.5);
  useLiveState(compId, (s: { ball: number; p2: number } | undefined) => {
    const b = s?.ball ?? (and ? 1 : -1);
    if (ball.current) ball.current.position.x = b < 0 ? -9 : 9;
    setPressureColor(out.color, s?.p2 ?? 0, maxBar());
  });
  return (
    <group>
      <Shell geom={box(40, 18, 20)} mat="aluminium" mode={mode} position={[0, Y, 0]} />
      <Fitting at={[-30, 0]} out="x-" />
      <Fitting at={[30, 0]} out="x+" />
      <Fitting at={[0, -20]} out="z-" />
      <mesh
        geometry={cylZ(2.5, 10)}
        material={out}
        position={[0, Y, -5]}
        visible={mode !== 'normal'}
      />
      <Part geom={pipeX(5, 4.2, 32)} mat="brass" position={[0, Y, 0]} />
      <group ref={ball}>
        {and ? (
          <>
            <Part geom={cylX(4, 3)} mat="dark" position={[-7, Y, 0]} />
            <Part geom={cylX(4, 3)} mat="dark" position={[7, Y, 0]} />
            <Part geom={cylX(1.2, 14)} mat="steel" position={[0, Y, 0]} />
          </>
        ) : (
          <Part geom={sphere(4)} mat="red" position={[0, Y, 0]} />
        )}
      </group>
    </group>
  );
}

// ------------------------------------------------------------------ Escape rápido
export function QuickExhaust3D({ compId, mode }: Model3DProps) {
  const disc = useRef<THREE.Group>(null);
  useLiveState(compId, (s: { filling: boolean } | undefined) => {
    if (disc.current) disc.current.rotation.y = s && !s.filling ? 0 : Math.PI / 2;
  });
  return (
    <group>
      <InlineBody mode={mode} w={22} />
      <Shell geom={box(10, 14, 12)} mat="aluminium" mode={mode} position={[16, Y, 0]} />
      <Part geom={cylX(4, 8)} mat="bronze" position={[26, Y, 0]} />
      <group ref={disc} position={[0, Y, 0]}>
        <Part geom={cylZ(6, 1.6)} mat="dark" position={[0, 0, 4]} />
      </group>
    </group>
  );
}

// ------------------------------------------------------------------ Caudalímetro
export function Flowmeter3D({ compId, mode, params }: Model3DProps) {
  const float = useRef<THREE.Mesh>(null);
  const range = num(params, 'range');
  useLiveState(compId, (s: { lmin: number } | undefined) => {
    const f = Math.min(1, Math.abs(s?.lmin ?? 0) / range);
    if (float.current) float.current.position.y = Y + 6 + f * 22;
  });
  return (
    <group>
      <InlineBody mode={mode} w={16} len={30} />
      <Part geom={cylY(5, 34)} mat="glass" position={[0, Y + 22, 0]} />
      <mesh
        ref={float}
        geometry={new THREE.ConeGeometry(4, 5, 16).rotateX(Math.PI)}
        material={new THREE.MeshStandardMaterial({ color: '#2563eb' })}
        position={[0, Y + 6, 0]}
      />
      <Part geom={box(12, 3, 12)} mat="aluminium" position={[0, Y + 40, 0]} />
    </group>
  );
}

// ------------------------------------------------------------------ Depósito
export function Tank3D({ compId, mode }: Model3DProps) {
  const air = useTint(0.5);
  useLiveState(compId, (s: { bar: number } | undefined) =>
    setPressureColor(air.color, s?.bar ?? 0, maxBar()),
  );
  return (
    <group>
      <Shell geom={cylX(13, 40)} mat="anodizedBlue" mode={mode} position={[0, Y, 0]} />
      <Shell geom={sphere(13)} mat="anodizedBlue" mode={mode} position={[-20, Y, 0]} />
      <Shell geom={sphere(13)} mat="anodizedBlue" mode={mode} position={[20, Y, 0]} />
      <mesh
        geometry={cylX(12, 50)}
        material={air}
        position={[0, Y, 0]}
        visible={mode !== 'normal'}
      />
      <Fitting at={[-40, 0]} out="x-" />
      <Fitting at={[40, 0]} out="x+" />
    </group>
  );
}

// ------------------------------------------------------------------ Unidad de mantenimiento
export function Frl3D({ compId, mode }: Model3DProps) {
  const needle = useRef<THREE.Mesh>(null);
  const air = useTint(0.5);
  useLiveState(compId, (s: { p2: number } | undefined) => {
    const p = s?.p2 ?? 0;
    if (needle.current)
      needle.current.rotation.z = -((-135 + 270 * Math.min(1, p / 10)) * Math.PI) / 180;
    setPressureColor(air.color, p, maxBar());
  });
  return (
    <group>
      <Shell geom={box(76, 16, 18)} mat="aluminium" mode={mode} position={[0, Y + 6, 0]} />
      <Fitting at={[-50, 0]} out="x-" />
      <Fitting at={[50, 0]} out="x+" />
      {/* Vaso del filtro y del lubricador (transparentes) */}
      <Part geom={cylY(7, 18)} mat="glass" position={[-24, Y - 6, 0]} />
      <Part geom={cylY(7, 18)} mat="glass" position={[24, Y - 6, 0]} />
      <Part geom={cylY(5, 8)} mat="bronze" position={[-24, Y - 6, 0]} />
      <mesh
        geometry={cylY(5, 6)}
        material={
          new THREE.MeshStandardMaterial({ color: '#d4a017', transparent: true, opacity: 0.8 })
        }
        position={[24, Y - 10, 0]}
      />
      {/* Regulador con mando y manómetro */}
      <Part geom={cylY(6, 10)} mat="black" position={[0, Y + 19, 0]} />
      <mesh
        geometry={cylX(1, 76)}
        material={air}
        position={[0, Y + 6, 0]}
        visible={mode !== 'normal'}
      />
      <group position={[0, Y + 8, -12]}>
        <Part geom={cylZ(8, 4)} mat="black" />
        <Part geom={cylZ(7, 0.5)} mat="white" position={[0, 0, -2.3]} />
        <mesh
          ref={needle}
          geometry={box(0.8, 6, 0.4)}
          material={new THREE.MeshStandardMaterial({ color: '#d63a32' })}
          position={[0, 0, -2.7]}
        />
      </group>
    </group>
  );
}

// ------------------------------------------------------------------ Compresor
export function Compressor3D({ compId, mode }: Model3DProps) {
  const wheel = useRef<THREE.Group>(null);
  const piston = useRef<THREE.Mesh>(null);
  const air = useTint(0.5);
  useLiveState(compId, (s: { crank: number; pTank: number; running: boolean } | undefined) => {
    const a = s?.crank ?? 0;
    if (wheel.current) wheel.current.rotation.x = a;
    if (piston.current) piston.current.position.y = Y + 18 + Math.cos(a) * 3;
    setPressureColor(air.color, s?.pTank ?? 0, maxBar());
  });
  return (
    <group>
      {/* Depósito horizontal */}
      <Shell geom={cylX(10, 44)} mat="red" mode={mode} position={[0, Y - 2, 4]} />
      <Shell geom={sphere(10)} mat="red" mode={mode} position={[-22, Y - 2, 4]} />
      <Shell geom={sphere(10)} mat="red" mode={mode} position={[22, Y - 2, 4]} />
      <mesh
        geometry={cylX(9, 60)}
        material={air}
        position={[0, Y - 2, 4]}
        visible={mode !== 'normal'}
      />
      {/* Bloque compresor: cilindro con pistón y volante */}
      <Shell geom={cylY(5, 12)} mat="aluminium" mode={mode} position={[-12, Y + 16, 4]} />
      <mesh
        ref={piston}
        geometry={cylY(4.5, 3)}
        material={new THREE.MeshStandardMaterial({ color: '#94a3b8', metalness: 0.8 })}
        position={[-12, Y + 18, 4]}
      />
      <group ref={wheel} position={[-24, Y + 12, 4]}>
        <Part geom={cylX(8, 2.5)} mat="black" />
        <Part geom={box(2.6, 12, 2)} mat="steel" />
      </group>
      <Part geom={box(14, 10, 12)} mat="anodizedBlue" position={[10, Y + 13, 4]} />
      {/* Salida hacia el puerto 1 */}
      <Part geom={cylY(2.4, 10)} mat="brass" position={[0, Y + 9, -10]} />
      <Part geom={cylZ(2.4, 14)} mat="brass" position={[0, Y, -7]} />
      <Fitting at={[0, -30]} out="z-" />
      <Part geom={cylZ(2.4, 10)} mat="brass" position={[0, Y, -17]} />
    </group>
  );
}

// ------------------------------------------------------------------ Cilindro sin vástago
export function Rodless3D({ compId, mode, params }: Model3DProps) {
  const carriage = useRef<THREE.Group>(null);
  const a = useTint(0.45);
  const b = useTint(0.45);
  const chA = useRef<THREE.Mesh>(null);
  const chB = useRef<THREE.Mesh>(null);
  const start = Number(params.startPos ?? 0) / 100;
  useLiveState(compId, (s: { pos: number; pCap: number; pRod: number } | undefined) => {
    const x = -66 + 132 * (s?.pos ?? start);
    if (carriage.current) carriage.current.position.x = x;
    const la = Math.max(0.01, x - 3 + 82);
    const lb = Math.max(0.01, 82 - x - 3);
    if (chA.current) {
      chA.current.scale.x = la;
      chA.current.position.x = -82 + la / 2;
      chA.current.visible = !!s && mode !== 'normal';
    }
    if (chB.current) {
      chB.current.scale.x = lb;
      chB.current.position.x = 82 - lb / 2;
      chB.current.visible = !!s && mode !== 'normal';
    }
    setPressureColor(a.color, s?.pCap ?? 0, maxBar());
    setPressureColor(b.color, s?.pRod ?? 0, maxBar());
  });
  return (
    <group>
      <Shell geom={pipeX(10, 8.6, 164)} mat="aluminium" mode={mode} position={[0, Y, 0]} />
      <Shell geom={box(8, 24, 24)} mat="aluminium" mode={mode} position={[-86, Y, 0]} />
      <Shell geom={box(8, 24, 24)} mat="aluminium" mode={mode} position={[86, Y, 0]} />
      <mesh ref={chA} geometry={cylX(8.4, 1)} material={a} position={[0, Y, 0]} />
      <mesh ref={chB} geometry={cylX(8.4, 1)} material={b} position={[0, Y, 0]} />
      <group ref={carriage}>
        <Part geom={cylX(8.4, 6)} mat="dark" position={[0, Y, 0]} />
        <Part geom={box(26, 6, 22)} mat="anodizedBlue" position={[0, Y + 13, 0]} shadow />
      </group>
      <Fitting at={[-80, 20]} out="z+" />
      <Fitting at={[80, 20]} out="z+" />
      <Part geom={cylZ(2.4, 8)} mat="brass" position={[-80, Y, 10]} />
      <Part geom={cylZ(2.4, 8)} mat="brass" position={[80, Y, 10]} />
    </group>
  );
}

// ------------------------------------------------------------------ Actuador de giro
export function Rotary3D({ compId, mode, params }: Model3DProps) {
  const flag = useRef<THREE.Group>(null);
  const rack = useRef<THREE.Mesh>(null);
  const range = (num(params, 'angle') * Math.PI) / 180;
  useLiveState(compId, (s: { pos: number } | undefined) => {
    const pos = s?.pos ?? 0;
    if (flag.current) flag.current.rotation.y = -range / 2 + range * pos;
    if (rack.current) rack.current.position.x = -10 + 20 * pos;
  });
  return (
    <group>
      <Shell geom={box(52, 20, 26)} mat="aluminium" mode={mode} position={[0, Y, 0]} />
      <mesh
        ref={rack}
        geometry={box(18, 3, 4)}
        material={new THREE.MeshStandardMaterial({ color: '#94a3b8', metalness: 0.8 })}
        position={[0, Y, 4]}
      />
      <Part geom={cylY(5, 8)} mat="steel" position={[0, Y + 2, 0]} />
      <group ref={flag} position={[0, Y + 14, 0]}>
        <Part geom={cylY(3, 8)} mat="steel" />
        <Part geom={box(4, 3, 24)} mat="red" position={[0, 3, -12]} shadow />
      </group>
      <Fitting at={[-20, 30]} out="z+" />
      <Fitting at={[20, 30]} out="z+" />
      <Part geom={cylZ(2.4, 10)} mat="brass" position={[-20, Y, 16]} />
      <Part geom={cylZ(2.4, 10)} mat="brass" position={[20, Y, 16]} />
    </group>
  );
}

// ------------------------------------------------------------------ Pinza
export function Gripper3D({ compId, mode }: Model3DProps) {
  const left = useRef<THREE.Mesh>(null);
  const right = useRef<THREE.Mesh>(null);
  useLiveState(compId, (s: { pos: number } | undefined) => {
    const gap = 4 + 10 * (1 - (s?.pos ?? 0));
    if (left.current) left.current.position.x = -gap - 3;
    if (right.current) right.current.position.x = gap + 3;
  });
  return (
    <group>
      <Shell geom={box(44, 20, 24)} mat="anodizedBlue" mode={mode} position={[0, Y, 2]} />
      <Part ref={left} geom={box(6, 14, 26)} mat="steel" position={[-17, Y, -22]} shadow />
      <Part ref={right} geom={box(6, 14, 26)} mat="steel" position={[17, Y, -22]} shadow />
      <Fitting at={[-10, 30]} out="z+" />
      <Fitting at={[10, 30]} out="z+" />
      <Part geom={cylZ(2.4, 8)} mat="brass" position={[-10, Y, 17]} />
      <Part geom={cylZ(2.4, 8)} mat="brass" position={[10, Y, 17]} />
    </group>
  );
}

// ------------------------------------------------------------------ Motor neumático
export function Motor3D({ compId, mode }: Model3DProps) {
  const rotor = useRef<THREE.Group>(null);
  useLiveState(compId, (s: { angle: number } | undefined) => {
    if (rotor.current) rotor.current.rotation.y = -(s?.angle ?? 0);
  });
  return (
    <group>
      <Shell geom={cylY(18, 18)} mat="anodizedBlue" mode={mode} position={[0, Y, 0]} />
      <group ref={rotor} position={[0, Y, 0]}>
        <Part geom={cylY(9, 16)} mat="steel" />
        {[0, 1, 2, 3].map((i) => (
          <Part
            key={i}
            geom={box(1.5, 15, 16)}
            mat="dark"
            position={[Math.cos((i * Math.PI) / 2) * 12, 0, Math.sin((i * Math.PI) / 2) * 12]}
            rotation={[0, -(i * Math.PI) / 2, 0]}
          />
        ))}
        <Part geom={cylY(3, 30)} mat="steel" position={[0, 12, 0]} />
        <Part geom={box(26, 3, 4)} mat="red" position={[0, 26, 0]} shadow />
      </group>
      <Fitting at={[-10, 30]} out="z+" />
      <Fitting at={[10, 30]} out="z+" />
      <Part geom={cylZ(2.4, 6)} mat="brass" position={[-10, Y, 18]} />
      <Part geom={cylZ(2.4, 6)} mat="brass" position={[10, Y, 18]} />
    </group>
  );
}

// ------------------------------------------------------------------ Temporizador
const TimerValve3D = makeWayValve3D(TIMER_CFG);

export function Timer3D(props: Model3DProps) {
  const { compId, mode } = props;
  const res = useTint(0.6);
  useLiveState(compId, (s: { pRes: number } | undefined) =>
    setPressureColor(res.color, s?.pRes ?? 0, maxBar()),
  );
  const pilotX = boxesExtent(TIMER_CFG).left - 30;
  return (
    <group>
      <TimerValve3D {...props} params={{ ...props.params, actLeft: 'pilot', actRight: 'spring' }} />
      {/* Señal 12 → estrangulador → depósito → pilotaje de la válvula */}
      <Fitting at={[TIMER_SIGNAL_X, 0]} out="x-" />
      <Shell
        geom={box(14, 16, 14)}
        mat="aluminium"
        mode={mode}
        position={[TIMER_SIGNAL_X + 17, Y, 0]}
      />
      <Part geom={cylY(1.5, 12)} mat="steel" position={[TIMER_SIGNAL_X + 17, Y + 12, 0]} />
      <Part geom={cylY(4, 4)} mat="black" position={[TIMER_SIGNAL_X + 17, Y + 19, 0]} />
      <Shell
        geom={cylX(9, 18)}
        mat="aluminium"
        mode={mode}
        position={[TIMER_SIGNAL_X + 40, Y, 0]}
      />
      <mesh geometry={cylX(8, 17)} material={res} position={[TIMER_SIGNAL_X + 40, Y, 0]} />
      <Part
        geom={cylX(2.4, pilotX - (TIMER_SIGNAL_X + 49))}
        mat="brass"
        position={[(pilotX + TIMER_SIGNAL_X + 49) / 2, Y, 0]}
      />
    </group>
  );
}

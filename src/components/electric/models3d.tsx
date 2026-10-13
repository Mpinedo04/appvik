/**
 * Componentes eléctricos en 3D: módulos sobre el tablero con sus bornes a la altura de los
 * cables. Lo que interesa ver se mueve: el botón que baja, la armadura del relé que se pega a
 * la bobina (que brilla al recibir 24 V), el contacto que se cierra, los pilotos que se encienden.
 */
import { useMemo, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { str } from '../../core/registry';
import { box, cylX, cylY, sphere } from '../../view3d/geom';
import { coilMat, ledMat, partMat } from '../../view3d/materials';
import { useLiveState } from '../../view3d/useLive';
import { Fitting, Part, Shell, type Model3DProps } from '../parts3d';
import { CONTACT_PORTS, kindOf, LAMP_COLORS, type ActuatorKind, type ContactKind } from './models';

/** Altura de los bornes y de los cables sobre el tablero. */
export const WIRE_Y = 3;
const BODY_H = 16;

/** Borne con tornillo y la pletina que lo une al cuerpo. */
function Terminal({ x, z }: { x: number; z: number }) {
  const toward = z > 0 ? -1 : 1;
  return (
    <group>
      <Part geom={box(5, 2, 9)} mat="brass" position={[x, WIRE_Y - 0.5, z + toward * 3.5]} />
      <Part geom={cylY(1.8, 2.2, 12)} mat="steel" position={[x, WIRE_Y + 1, z]} />
    </group>
  );
}

function Terminals({ ports }: { ports: { x: number; y: number; medium: string }[] }) {
  return (
    <>
      {ports
        .filter((p) => p.medium === 'elec')
        .map((p, i) => (
          <Terminal key={i} x={p.x} z={p.y} />
        ))}
    </>
  );
}

/** Cambia el material de una malla sólo si hace falta. */
function setMat(mesh: THREE.Mesh | null, m: THREE.Material) {
  if (mesh && mesh.material !== m) mesh.material = m;
}

/* ───────────── Alimentación ───────────── */

export function makeRail3D(kind: '+24' | '0') {
  const plus = kind === '+24';
  return function Rail3D({ mode }: Model3DProps) {
    const z = plus ? 20 : -20;
    return (
      <group>
        <Shell
          geom={box(18, 10, 18)}
          mat={plus ? 'red' : 'anodizedBlue'}
          mode={mode}
          position={[0, 5, 0]}
        />
        <Terminal x={0} z={z} />
      </group>
    );
  };
}

/* ───────────── Contactos ───────────── */

interface ContactLive {
  actuated: boolean;
}

/** Ventana superior con el contacto: puente móvil que une (o no) las dos pletinas fijas. */
function ContactWindow({ kind, bridge }: { kind: ContactKind; bridge: RefObject<THREE.Group> }) {
  const y = BODY_H + 0.6;
  return (
    <group>
      <Part geom={box(14, 0.6, 26)} mat="dark" position={[0, BODY_H + 0.1, 0]} />
      {/* Pletinas fijas */}
      <Part geom={box(4, 1, 4)} mat="brass" position={[0, y, -9]} />
      {kind === 'co' ? (
        <>
          <Part geom={box(4, 1, 4)} mat="brass" position={[-4, y, 9]} />
          <Part geom={box(4, 1, 4)} mat="brass" position={[4, y, 9]} />
        </>
      ) : (
        <Part geom={box(4, 1, 4)} mat="brass" position={[0, y, 9]} />
      )}
      {/* Puente móvil, gira alrededor de la pletina superior */}
      <group ref={bridge} position={[0, y + 0.8, -9]}>
        <Part geom={box(2.2, 0.8, 18)} mat="steel" position={[0, 0, 9]} />
      </group>
    </group>
  );
}

const BUTTON_COLOR: Record<string, string> = {
  'elec-button-no': '#16a34a',
  'elec-button-nc': '#dc2626',
};

export function makeContact3D(type: string, actuator: ActuatorKind, fixed?: ContactKind) {
  return function Contact3D({ compId, mode, params }: Model3DProps) {
    const kind = kindOf(params, fixed);
    const ports = CONTACT_PORTS[kind];
    const cap = useRef<THREE.Group>(null);
    const bridge = useRef<THREE.Group>(null);
    const led = useRef<THREE.Mesh>(null);
    const capMat = useMemo(
      () =>
        new THREE.MeshStandardMaterial({
          color: BUTTON_COLOR[type] ?? '#334155',
          roughness: 0.35,
        }),
      [],
    );
    useLiveState<ContactLive>(compId, (s) => {
      const on = !!s?.actuated;
      // El puente apunta a la pletina NA (cerrado) o se separa (abierto).
      if (bridge.current) {
        const closed = kind === 'no' ? on : !on;
        bridge.current.rotation.y = kind === 'co' ? (on ? -0.42 : 0.42) : closed ? 0 : 0.5;
      }
      if (cap.current) {
        if (actuator === 'button') cap.current.position.y = on ? -2 : 0;
        if (actuator === 'switch') cap.current.rotation.y = on ? -Math.PI / 4 : 0;
        if (actuator === 'estop') cap.current.position.y = on ? -2.5 : 0;
        if (actuator === 'limit') cap.current.rotation.z = on ? -0.45 : 0;
      }
      setMat(led.current, ledMat(on, actuator === 'proximity' ? '#facc15' : '#22c55e'));
    });
    const bodyMat = actuator === 'relay' ? 'dark' : 'aluminium';
    return (
      <group>
        <Shell geom={box(22, BODY_H, 40)} mat={bodyMat} mode={mode} position={[0, BODY_H / 2, 0]} />
        <ContactWindow kind={kind} bridge={bridge} />
        <Terminals ports={ports} />
        {/* Mando, a la izquierda del cuerpo */}
        {(actuator === 'button' || actuator === 'switch') && (
          <group position={[-20, 0, 0]}>
            <Part geom={box(14, 12, 14)} mat="dark" position={[0, 6, 0]} />
            <Part geom={cylY(6, 2)} mat="aluminium" position={[0, 13, 0]} />
            <group ref={cap}>
              {actuator === 'button' ? (
                <mesh geometry={cylY(5, 4)} material={capMat} position={[0, 15.5, 0]} />
              ) : (
                <>
                  <Part geom={cylY(4.5, 3)} mat="black" position={[0, 15, 0]} />
                  <Part geom={box(9, 2.5, 2)} mat="white" position={[0, 17, 0]} />
                </>
              )}
            </group>
          </group>
        )}
        {actuator === 'estop' && (
          <group position={[-20, 0, 0]}>
            <Part geom={box(16, 12, 16)} mat="dark" position={[0, 6, 0]} />
            <mesh geometry={box(18, 1, 18)} material={yellow()} position={[0, 12.5, 0]} />
            <group ref={cap}>
              <Part geom={cylY(2.5, 4)} mat="steel" position={[0, 15, 0]} />
              <Part geom={sphere(8)} mat="red" position={[0, 17, 0]} scale={[1, 0.45, 1]} />
            </group>
          </group>
        )}
        {actuator === 'limit' && (
          <group position={[-16, 0, 0]}>
            <Part geom={box(10, 12, 14)} mat="aluminium" position={[0, 6, 0]} />
            <group ref={cap} position={[0, 12, 0]}>
              <Part geom={box(2, 12, 3)} mat="steel" position={[0, 6, 0]} />
              <Part
                geom={cylX(3.5, 3)}
                mat="black"
                position={[0, 12, 0]}
                rotation={[0, Math.PI / 2, 0]}
              />
            </group>
          </group>
        )}
        {actuator === 'proximity' && (
          <group position={[-24, 7, 0]}>
            <Part geom={cylX(4.5, 22)} mat="steel" position={[0, 0, 0]} />
            <Part geom={cylX(4.8, 3)} mat="dark" position={[-12, 0, 0]} />
            <mesh
              geometry={cylX(4, 1)}
              material={sensorFace(str(params, 'sensorType'))}
              position={[-13.8, 0, 0]}
            />
          </group>
        )}
        {actuator === 'pressure' && (
          <group>
            <Part geom={box(14, 12, 14)} mat="anodizedBlue" position={[-28, 6, 0]} />
            <Part geom={cylY(5, 2)} mat="white" position={[-28, 13, 0]} />
            <Fitting at={[-40, 0]} out="x-" y={6} />
          </group>
        )}
        {actuator !== 'relay' && actuator !== 'estop' && (
          <mesh
            ref={led}
            geometry={sphere(1.6)}
            material={ledMat(false)}
            position={[6, BODY_H + 1, -15]}
          />
        )}
      </group>
    );
  };
}

let yellowMat: THREE.Material | null = null;
const yellow = () =>
  (yellowMat ??= new THREE.MeshStandardMaterial({ color: '#facc15', roughness: 0.5 }));

const faceMats = new Map<string, THREE.Material>();
function sensorFace(type: string) {
  const color =
    { magnetic: '#64748b', inductive: '#2563eb', capacitive: '#f97316', optical: '#111827' }[
      type
    ] ?? '#64748b';
  let m = faceMats.get(color);
  if (!m) faceMats.set(color, (m = new THREE.MeshStandardMaterial({ color, roughness: 0.5 })));
  return m;
}

/* ───────────── Relés, bobinas y pilotos ───────────── */

interface CoilLive {
  energized: boolean;
  on: boolean;
  count: number;
}

/** Relé en zócalo con tapa transparente: bobina, armadura y contacto móvil a la vista. */
export function makeRelay3D(timed: boolean) {
  return function Relay3D({ compId, mode }: Model3DProps) {
    const coil = useRef<THREE.Mesh>(null);
    const armature = useRef<THREE.Group>(null);
    const led = useRef<THREE.Mesh>(null);
    useLiveState<CoilLive>(compId, (s) => {
      setMat(coil.current, coilMat(!!s?.energized));
      if (armature.current) armature.current.rotation.z = s?.on ? 0 : 0.28;
      setMat(led.current, ledMat(!!s?.on, '#facc15'));
    });
    return (
      <group>
        <Shell geom={box(26, 6, 40)} mat="dark" mode={mode} position={[0, 3, 0]} />
        {/* Tapa transparente */}
        <mesh geometry={box(24, 18, 30)} material={partMat('glass')} position={[0, 15, 0]} />
        {/* Núcleo con la bobina de cobre */}
        <Part geom={cylY(2.5, 14)} mat="steel" position={[-5, 13, 0]} />
        <mesh
          ref={coil}
          geometry={cylY(5.5, 11, 24)}
          material={coilMat(false)}
          position={[-5, 12, 0]}
        />
        {/* Armadura que bascula y empuja el contacto */}
        <group ref={armature} position={[-11, 21, 0]}>
          <Part geom={box(16, 1.5, 9)} mat="steel" position={[8, 0, 0]} />
          <Part geom={box(1.5, 12, 3)} mat="brass" position={[16, -6, 0]} />
        </group>
        <Part geom={box(1.5, 10, 6)} mat="brass" position={[8, 12, -6]} />
        <Part geom={box(1.5, 10, 6)} mat="brass" position={[8, 12, 6]} />
        <mesh ref={led} geometry={sphere(1.6)} material={ledMat(false)} position={[8, 24.5, -10]} />
        {timed && <Part geom={cylY(3, 2)} mat="white" position={[-4, 24.5, 9]} />}
        <Terminals
          ports={[
            { x: 0, y: -30, medium: 'elec' },
            { x: 0, y: 30, medium: 'elec' },
          ]}
        />
      </group>
    );
  };
}

/** Conector de la bobina de una electroválvula (la bobina está en la propia válvula). */
export function Solenoid3D({ compId, mode }: Model3DProps) {
  const led = useRef<THREE.Mesh>(null);
  useLiveState<CoilLive>(compId, (s) => setMat(led.current, ledMat(!!s?.on, '#facc15')));
  return (
    <group>
      <Shell geom={box(18, 12, 26)} mat="dark" mode={mode} position={[0, 6, 0]} />
      <Part geom={box(10, 4, 10)} mat="black" position={[0, 14, 0]} />
      <mesh ref={led} geometry={sphere(2)} material={ledMat(false)} position={[0, 16.5, 0]} />
      <Terminals
        ports={[
          { x: 0, y: -30, medium: 'elec' },
          { x: 0, y: 30, medium: 'elec' },
        ]}
      />
    </group>
  );
}

export function Lamp3D({ compId, mode, params }: Model3DProps) {
  const dome = useRef<THREE.Mesh>(null);
  const color = LAMP_COLORS[str(params, 'color')] ?? '#22c55e';
  useLiveState<CoilLive>(compId, (s) => setMat(dome.current, ledMat(!!s?.on, color)));
  return (
    <group>
      <Shell geom={cylY(10, 10, 24)} mat="dark" mode={mode} position={[0, 5, 0]} />
      <Part geom={cylY(9, 2, 24)} mat="aluminium" position={[0, 11, 0]} />
      <mesh
        ref={dome}
        geometry={sphere(8)}
        material={ledMat(false, color)}
        position={[0, 12, 0]}
        scale={[1, 0.8, 1]}
      />
      <Terminals
        ports={[
          { x: 0, y: -30, medium: 'elec' },
          { x: 0, y: 30, medium: 'elec' },
        ]}
      />
    </group>
  );
}

/** Contador con su visualizador (textura que se redibuja al cambiar la cuenta). */
export function Counter3D({ compId, mode, params }: Model3DProps) {
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 64;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ map: tex }), [tex]);
  const shown = useRef(-1);
  const draw = (n: number, on: boolean) => {
    const g = (tex.image as HTMLCanvasElement).getContext('2d')!;
    g.fillStyle = on ? '#14532d' : '#0b1220';
    g.fillRect(0, 0, 128, 64);
    g.fillStyle = on ? '#4ade80' : '#f87171';
    g.font = 'bold 40px monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(`${n}/${params.preset}`, 64, 34);
    tex.needsUpdate = true;
  };
  useLiveState<CoilLive>(compId, (s) => {
    const n = s?.count ?? 0;
    const key = n * 2 + (s?.on ? 1 : 0);
    if (key !== shown.current) {
      shown.current = key;
      draw(n, !!s?.on);
    }
  });
  return (
    <group>
      <Shell geom={box(40, 14, 40)} mat="aluminium" mode={mode} position={[0, 7, 0]} />
      <mesh material={mat} position={[0, 14.2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[30, 15]} />
      </mesh>
      <Terminals
        ports={[
          { x: -10, y: -30, medium: 'elec' },
          { x: -10, y: 30, medium: 'elec' },
          { x: 10, y: -30, medium: 'elec' },
          { x: 10, y: 30, medium: 'elec' },
        ]}
      />
    </group>
  );
}

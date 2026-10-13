/**
 * Vista 3D sincronizada con el esquema: misma topología, mismas posiciones y mismo estado
 * de simulación. Aquí no se edita la topología; se observa y se acciona.
 */
import { CameraControls, Environment, Lightformer, Stats } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { connectionPolyline, worldBBox } from '../core/model/geometry';
import type { Circuit } from '../core/model/types';
import type { BBox } from '../core/registry';
import { useProject } from '../store/project';
import { useView } from '../store/view';
import { Board } from './Board';
import { ComponentNode } from './ComponentNode';
import { S } from './layout';
import { setCutOffset } from './materials';
import { sceneApi } from './sceneApi';
import { Tubes3D } from './Tubes3D';
import { ViewOverlay } from './ViewOverlay';

const SHOW_FPS = typeof location !== 'undefined' && new URLSearchParams(location.search).has('fps');

function circuitBounds(c: Circuit): BBox {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const comp of Object.values(c.components)) {
    const b = worldBBox(comp);
    xs.push(b.x0, b.x1);
    ys.push(b.y0, b.y1);
  }
  for (const id of Object.keys(c.connections))
    for (const p of connectionPolyline(c, id)) {
      xs.push(p.x);
      ys.push(p.y);
    }
  if (!xs.length) return { x0: -200, y0: -150, x1: 200, y1: 150 };
  const m = 50;
  return {
    x0: Math.min(...xs) - m,
    y0: Math.min(...ys) - m,
    x1: Math.max(...xs) + m,
    y1: Math.max(...ys) + m,
  };
}

function toBox3(b: BBox, h = 40) {
  return new THREE.Box3(
    new THREE.Vector3(b.x0 * S, 0, b.y0 * S),
    new THREE.Vector3(b.x1 * S, h * S, b.y1 * S),
  );
}

/**
 * Encuadra la escena unos fotogramas después de montarse (y al cambiar de proyecto o de vista),
 * cuando el lienzo ya tiene su tamaño y los controles de cámara están registrados.
 */
function InitialFit({ trigger }: { trigger: string }) {
  const ctrl = useThree((s) => s.controls);
  const size = useThree((s) => s.size);
  const frames = useRef(0);
  useEffect(() => {
    frames.current = 0;
  }, [ctrl, trigger, size.width, size.height]);
  useFrame(() => {
    if (frames.current < 0 || !ctrl) return;
    if (++frames.current >= 3) {
      frames.current = -1;
      sceneApi.fitAll(false);
    }
  });
  return null;
}

export default function Scene3D() {
  const circuit = useProject((s) => s.circuit);
  const selection = useProject((s) => s.selection);
  const labels = useView((s) => s.labels);
  const layout = useView((s) => s.layout);
  const cutOffset = useView((s) => s.cutOffset);
  const controls = useRef<CameraControls>(null);
  const bounds = useMemo(() => circuitBounds(circuit), [circuit]);
  const boundsRef = useRef(bounds);
  boundsRef.current = bounds;
  const selected = new Set(selection.comps);

  useEffect(() => setCutOffset(cutOffset), [cutOffset]);

  sceneApi.fitAll = (smooth = true) => {
    const cc = controls.current;
    if (!cc) return;
    // Vista en perspectiva desde delante y arriba, centrada en el tablero.
    const b = boundsRef.current;
    const cx = ((b.x0 + b.x1) / 2) * S;
    const cz = ((b.y0 + b.y1) / 2) * S;
    const span = Math.max((b.x1 - b.x0) * 0.75, b.y1 - b.y0) * S;
    void cc.setLookAt(cx, span * 1.05, cz + span * 0.95, cx, 0, cz, false);
    // fitToSphere conserva la inclinación de la cámara (fitToBox la pondría cenital).
    const sphere = toBox3(b, 10).getBoundingSphere(new THREE.Sphere());
    sphere.radius *= 0.62;
    void cc.fitToSphere(sphere, smooth);
  };
  sceneApi.focus = (id: string) => {
    const comp = useProject.getState().circuit.components[id];
    const cc = controls.current;
    if (!comp || !cc) return;
    const b = worldBBox(comp);
    const sphere = toBox3(
      { x0: b.x0 - 20, y0: b.y0 - 20, x1: b.x1 + 20, y1: b.y1 + 20 },
      30,
    ).getBoundingSphere(new THREE.Sphere());
    void cc.fitToSphere(sphere, true);
  };

  // Encuadre inicial (y al cargar otro proyecto).
  const nComp = Object.keys(circuit.components).length;

  const span = Math.max(bounds.x1 - bounds.x0, bounds.y1 - bounds.y0) * S;

  return (
    <div className="scene3d" data-testid="scene3d">
      <Canvas
        shadows
        dpr={[1, 1.5]}
        camera={{ fov: 38, near: 0.01, far: 200, position: [0, 4, 5] }}
        onCreated={({ gl }) => {
          gl.localClippingEnabled = true;
        }}
        onPointerMissed={() => useProject.getState().clearSelection()}
      >
        <color attach="background" args={['#e9eef4']} />
        <hemisphereLight args={['#ffffff', '#aab4c2', 0.7]} />
        <directionalLight
          position={[span * 0.4, span * 1.2, span * 0.8]}
          intensity={1.7}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-span}
          shadow-camera-right={span}
          shadow-camera-top={span}
          shadow-camera-bottom={-span}
          shadow-bias={-0.0004}
        />
        <Environment resolution={128}>
          <Lightformer
            intensity={1.6}
            position={[0, 6, 0]}
            rotation-x={Math.PI / 2}
            scale={[12, 12, 1]}
          />
          <Lightformer
            intensity={0.8}
            position={[-6, 2, 3]}
            rotation-y={Math.PI / 2}
            scale={[8, 3, 1]}
          />
          <Lightformer
            intensity={0.8}
            position={[6, 2, -3]}
            rotation-y={-Math.PI / 2}
            scale={[8, 3, 1]}
          />
        </Environment>
        <InitialFit trigger={`${nComp}:${layout}`} />
        <CameraControls
          ref={controls}
          makeDefault
          maxPolarAngle={Math.PI / 2 - 0.05}
          minDistance={0.3}
          maxDistance={40}
        />
        <group scale={S}>
          <Board bounds={bounds} />
          <Tubes3D circuit={circuit} />
          {Object.values(circuit.components).map((c) => (
            <ComponentNode key={c.id} c={c} selected={selected.has(c.id)} showLabel={labels} />
          ))}
        </group>
        {SHOW_FPS && <Stats />}
      </Canvas>
      <ViewOverlay />
    </div>
  );
}

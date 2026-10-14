/**
 * Piezas 3D comunes (en unidades de dibujo). Los modelos de cada componente se componen con
 * ellas; el modo de visualización (normal / rayos X / corte) se aplica a las carcasas.
 */
import { Edges } from '@react-three/drei';
import { forwardRef, type ReactNode } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Render3D } from '../store/view';
import { box, cylX, oringX } from '../view3d/geom';
import { AXIS_Y } from '../view3d/layout';
import { partMat, sectionMat, shellMat, type MatKey } from '../view3d/materials';

type Vec3 = [number, number, number];

export interface Model3DProps {
  params: import('../core/model/types').Params;
  compId: string;
  mode: Render3D;
  /** Fluido del componente (escala de colores de presión). */
  medium?: 'pneu' | 'hyd';
}

/** Carcasa: le afectan los modos rayos X y corte. */
export function Shell({
  geom,
  mat,
  mode,
  position,
  rotation,
}: {
  geom: THREE.BufferGeometry;
  mat: MatKey;
  mode: Render3D;
  position?: Vec3;
  rotation?: Vec3;
}) {
  return (
    <group position={position} rotation={rotation}>
      <mesh
        geometry={geom}
        material={shellMat(mat, mode)}
        castShadow={mode === 'normal'}
        receiveShadow
      >
        {mode === 'xray' && <Edges threshold={25} color="#64748b" />}
      </mesh>
      {mode === 'cut' && <mesh geometry={geom} material={sectionMat()} />}
    </group>
  );
}

/** Pieza interna: siempre opaca y sin recortar. */
export const Part = forwardRef<
  THREE.Mesh,
  {
    geom: THREE.BufferGeometry;
    mat: MatKey | THREE.Material;
    position?: Vec3;
    rotation?: Vec3;
    scale?: Vec3;
    /** Sólo las piezas grandes proyectan sombra (cada sombra es otra pasada de dibujo). */
    shadow?: boolean;
    children?: ReactNode;
  }
>(function Part({ geom, mat, position, rotation, scale, shadow = false, children }, ref) {
  return (
    <mesh
      ref={ref}
      geometry={geom}
      material={typeof mat === 'string' ? partMat(mat) : mat}
      position={position}
      rotation={rotation}
      scale={scale}
      castShadow={shadow}
    >
      {children}
    </mesh>
  );
});

/** Geometrías del racor (latón y anillo azul) fusionadas, con el puerto en el origen y saliendo por +X. */
const fittingGeoms = (() => {
  let cache: { brass: THREE.BufferGeometry; ring: THREE.BufferGeometry } | null = null;
  return () => {
    if (!cache) {
      const at = (g: THREE.BufferGeometry, d: number) => g.clone().translate(-d, 0, 0);
      cache = {
        brass: mergeGeometries([
          at(cylX(2.6, 3), 1.5),
          at(cylX(3, 3.5), 5.8),
          at(cylX(4.2, 2.5, 6), 8.7),
        ])!,
        ring: at(cylX(3.4, 1.4), 3.4),
      };
    }
    return cache;
  };
})();

const FITTING_ROT: Record<'x+' | 'x-' | 'z+' | 'z-', number> = {
  'x+': 0,
  'x-': Math.PI,
  'z+': -Math.PI / 2,
  'z-': Math.PI / 2,
};

/**
 * Racor instantáneo. `at` es la posición del puerto (x, z) y `out` la dirección hacia la que
 * sale la tubería. El racor ocupa 10 unidades desde el puerto hacia el cuerpo.
 */
export function Fitting({
  at,
  out,
  y = AXIS_Y,
}: {
  at: [number, number];
  out: 'x+' | 'x-' | 'z+' | 'z-';
  y?: number;
}) {
  const g = fittingGeoms();
  return (
    <group position={[at[0], y, at[1]]} rotation={[0, FITTING_ROT[out], 0]}>
      <mesh geometry={g.brass} material={partMat('brass')} />
      <mesh geometry={g.ring} material={partMat('anodizedBlue')} />
    </group>
  );
}

const SPRING_COILS = 9;
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0.18));
const tmpS = new THREE.Vector3(1, 1, 1);
const tmpP = new THREE.Vector3();

/**
 * Muelle a lo largo de X formado por espiras independientes (así, al comprimirlo, el alambre
 * no se deforma). Una sola malla instanciada; se coloca y estira con `setSpring`.
 */
export const Spring = forwardRef<
  THREE.InstancedMesh,
  { x0: number; length: number; radius?: number; y?: number; z?: number }
>(function Spring({ x0, length, radius = 6, y = AXIS_Y, z = 0 }, ref) {
  return (
    <instancedMesh
      ref={(im) => {
        if (im) setSpring(im, x0, length);
        if (typeof ref === 'function') ref(im);
        else if (ref) ref.current = im;
      }}
      args={[oringX(radius, 0.8), partMat('steel'), SPRING_COILS]}
      position={[0, y, z]}
      frustumCulled={false}
    />
  );
});

/** Reparte las espiras de un muelle entre x0 y x0 + length. */
export function setSpring(im: THREE.InstancedMesh | null, x0: number, length: number) {
  if (!im) return;
  const n = im.count;
  const L = Math.max(n * 1.7, length);
  for (let i = 0; i < n; i++) {
    tmpP.set(x0 + (i * L) / (n - 1), 0, 0);
    im.setMatrixAt(i, tmpM.compose(tmpP, tmpQ, tmpS));
  }
  im.instanceMatrix.needsUpdate = true;
}

/** Pie de apoyo sobre el tablero. */
export function Foot({
  x,
  z = 0,
  w = 10,
  d = 22,
  top = AXIS_Y - 8,
}: {
  x: number;
  z?: number;
  w?: number;
  d?: number;
  top?: number;
}) {
  return <Part geom={box(w, top, d)} mat="aluminium" position={[x, top / 2, z]} />;
}

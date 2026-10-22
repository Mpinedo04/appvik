import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { decodeMesh } from '../../cad/mesh';
import { useProject } from '../../store/project';
import { anchorMotion } from '../../view3d/anchors';
import { CUT_PLANE } from '../../view3d/materials';
import type { Model3DProps } from '../parts3d';
import { cadPlacement } from './model';

interface CadGeom {
  geom: THREE.BufferGeometry;
  color: THREE.Color;
}

/** Mallas ya decodificadas (la misma pieza copiada varias veces se decodifica una vez). */
const cache = new Map<string, Promise<CadGeom[]>>();

function loadGeoms(text: string): Promise<CadGeom[]> {
  let p = cache.get(text);
  if (!p) {
    p = decodeMesh(text).then((mesh) =>
      mesh.groups.map((g) => {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(g.positions, 3));
        geo.setIndex(new THREE.BufferAttribute(g.indices, 1));
        // Normales suaves en las superficies curvas y aristas vivas a partir de 30°.
        const geom = toCreasedNormals(geo, Math.PI / 6);
        geo.dispose();
        geom.computeBoundingSphere();
        return { geom, color: new THREE.Color().setRGB(...g.color, THREE.SRGBColorSpace) };
      }),
    );
    cache.set(text, p);
    p.catch(() => cache.delete(text));
  }
  return p;
}

const placeholder = new THREE.BoxGeometry(40, 40, 40).translate(0, 20, 0);

/** Pieza CAD: la malla importada, colocada sobre el tablero y, si se pide, unida a un actuador. */
export function CadPart3D({ params, mode }: Model3DProps) {
  const text = String(params.mesh ?? '');
  const [geoms, setGeoms] = useState<CadGeom[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    setError(false);
    if (!text) {
      setGeoms(null);
      return;
    }
    loadGeoms(text).then(
      (g) => alive && setGeoms(g),
      () => alive && setError(true),
    );
    return () => {
      alive = false;
    };
  }, [text]);

  const pl = cadPlacement(params);
  const opacity = Math.max(0.1, Math.min(1, Number(params.opacity ?? 100) / 100));
  const mats = useMemo(
    () =>
      (geoms ?? [{ color: new THREE.Color(error ? '#ef4444' : '#94a3b8') }]).map(({ color }) => {
        const m = new THREE.MeshStandardMaterial({
          color,
          metalness: 0.25,
          roughness: 0.55,
          side: THREE.DoubleSide,
        });
        const op = mode === 'xray' ? Math.min(opacity, 0.22) : opacity;
        if (op < 1) Object.assign(m, { transparent: true, opacity: op, depthWrite: false });
        if (mode === 'cut') m.clippingPlanes = [CUT_PLANE];
        return m;
      }),
    [geoms, error, mode, opacity],
  );
  useEffect(() => () => mats.forEach((m) => m.dispose()), [mats]);

  // Actuador al que va unida (por su etiqueta).
  const follow = String(params.follow ?? '').trim();
  const followId = useProject((s) =>
    follow
      ? (Object.values(s.circuit.components).find((c) => c.label === follow)?.id ?? null)
      : null,
  );
  const wrapper = useRef<THREE.Group>(null);
  const tmp = useMemo(() => ({ motion: new THREE.Matrix4(), g: new THREE.Matrix4() }), []);
  useFrame(() => {
    const w = wrapper.current;
    if (!w?.parent) return;
    if (followId && anchorMotion(followId, tmp.motion)) {
      // Movimiento del actuador (mundo) llevado al sistema del componente: G⁻¹·M·G.
      w.parent.updateWorldMatrix(true, false);
      tmp.g.copy(w.parent.matrixWorld);
      w.matrix.copy(tmp.g).invert().multiply(tmp.motion).multiply(tmp.g);
    } else w.matrix.identity();
    w.matrixWorldNeedsUpdate = true;
  });

  const shadow = mode === 'normal' && opacity >= 1;
  return (
    <group ref={wrapper} matrixAutoUpdate={false}>
      <group rotation={[0, pl.yaw, 0]}>
        {geoms ? (
          <group position={pl.offset} rotation={[pl.rotX, 0, 0]} scale={pl.k}>
            {geoms.map((g, i) => (
              <mesh
                key={i}
                geometry={g.geom}
                material={mats[i]}
                castShadow={shadow}
                receiveShadow
              />
            ))}
          </group>
        ) : (
          <mesh geometry={placeholder} material={mats[0]} />
        )}
      </group>
    </group>
  );
}

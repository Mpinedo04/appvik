/**
 * Tuberías 3D (siguen la misma polilínea que en el esquema, a la altura de los racores) y
 * partículas que circulan por ellas con el caudal calculado por el motor.
 */
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { connectionPolyline } from '../core/model/geometry';
import type { Circuit } from '../core/model/types';
import { paToBarGauge } from '../core/units';
import { connectionFlows } from '../core/sim/flows';
import { useSim } from '../store/sim';
import { setPressureColor, TUBE_IDLE } from './colors';
import { box, polylineTube, PolylineSampler, sphere } from './geom';
import { AXIS_Y } from './layout';
import { partMat } from './materials';

interface TubeData {
  id: string;
  geom: THREE.BufferGeometry;
  mat: THREE.MeshStandardMaterial;
  sampler: PolylineSampler;
  count: number;
}

const PARTICLE_SPACING = 14;

export function Tubes3D({ circuit }: { circuit: Circuit }) {
  const tubes = useMemo<TubeData[]>(
    () =>
      Object.values(circuit.connections)
        .filter((c) => c.medium === 'pneu')
        .map((c) => {
          const pts = connectionPolyline(circuit, c.id).map(
            (p) => new THREE.Vector3(p.x, AXIS_Y, p.y),
          );
          const sampler = new PolylineSampler(pts);
          return {
            id: c.id,
            geom: polylineTube(pts, 2.3, 6, 10),
            mat: new THREE.MeshStandardMaterial({
              color: TUBE_IDLE.clone(),
              transparent: true,
              opacity: 0.5,
              depthWrite: false,
              roughness: 0.25,
            }),
            sampler,
            count: Math.max(2, Math.round(sampler.length / PARTICLE_SPACING)),
          };
        }),
    [circuit],
  );
  const total = tubes.reduce((s, t) => s + t.count, 0);
  const particles = useRef<THREE.InstancedMesh>(null);
  const phases = useMemo(() => tubes.map(() => 0), [tubes]);
  const lastT = useRef<number | null>(null);
  const tmp = useMemo(
    () => ({ v: new THREE.Vector3(), m: new THREE.Matrix4(), c: new THREE.Color() }),
    [],
  );

  useFrame(() => {
    const { snapshot: snap, maxBar } = useSim.getState();
    const flows = snap ? connectionFlows(circuit, snap) : null;
    const dt =
      snap && lastT.current !== null ? Math.min(0.2, Math.max(0, snap.t - lastT.current)) : 0;
    lastT.current = snap ? snap.t : null;
    const im = particles.current;
    let idx = 0;
    tubes.forEach((t, i) => {
      const node = snap?.connNode[t.id];
      const bar = snap && node !== undefined ? paToBarGauge(snap.nodeP[node]) : 0;
      if (snap) setPressureColor(t.mat.color, bar, maxBar);
      else t.mat.color.copy(TUBE_IDLE);
      if (!im) return;
      const flow = flows?.[t.id] ?? 0;
      const visible = Math.abs(flow) > 2e-6;
      const speed = Math.sign(flow) * 300 * Math.sqrt(Math.abs(flow) / 1e-3);
      phases[i] = (phases[i] + (speed * dt) / Math.max(1, t.sampler.length) + 1) % 1;
      setPressureColor(tmp.c, bar, maxBar).offsetHSL(0, 0, 0.22);
      for (let k = 0; k < t.count; k++, idx++) {
        if (visible) {
          t.sampler.at((phases[i] + k / t.count) % 1, tmp.v);
          tmp.m.makeTranslation(tmp.v.x, tmp.v.y, tmp.v.z);
        } else tmp.m.makeScale(0, 0, 0);
        im.setMatrixAt(idx, tmp.m);
        im.setColorAt(idx, tmp.c);
      }
    });
    if (im) {
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  });

  return (
    <group>
      {tubes.map((t) => (
        <mesh key={t.id} geometry={t.geom} material={t.mat} />
      ))}
      {Object.values(circuit.junctions)
        .filter((j) => j.medium === 'pneu')
        .map((j) => (
          <mesh
            key={j.id}
            geometry={box(7, 7, 7)}
            material={partMat('brass')}
            position={[j.x, AXIS_Y, j.y]}
            castShadow
          />
        ))}
      {total > 0 && (
        <instancedMesh
          key={total}
          ref={particles}
          args={[sphere(1.5), partMat('white'), total]}
          frustumCulled={false}
        />
      )}
    </group>
  );
}

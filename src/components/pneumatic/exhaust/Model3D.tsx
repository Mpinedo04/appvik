import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { cylZ, sphere } from '../../../view3d/geom';
import { AXIS_Y } from '../../../view3d/layout';
import { useLiveState, useSimDelta } from '../../../view3d/useLive';
import { Fitting, Part, Shell, type Model3DProps } from '../../parts3d';

const PUFFS = 10;

/** Silenciador de bronce sinterizado; al descargar se ve salir el aire. */
export function Silencer3D({ compId, mode }: Model3DProps) {
  const puffs = useRef<THREE.InstancedMesh>(null);
  const seeds = useMemo(
    () => Array.from({ length: PUFFS }, (_, i) => ({ a: (i / PUFFS) * Math.PI * 2, t: i / PUFFS })),
    [],
  );
  const mat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#9cc3f5',
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      }),
    [],
  );
  const simDelta = useSimDelta();
  const tmp = useMemo(() => new THREE.Matrix4(), []);

  useLiveState(compId, (s: { flowLmin: number } | undefined, snap) => {
    const im = puffs.current;
    if (!im) return;
    const dt = simDelta(snap);
    const flow = s?.flowLmin ?? 0;
    const on = flow > 5;
    seeds.forEach((sd, i) => {
      sd.t = (sd.t + dt * (2 + flow / 60)) % 1;
      if (!on) tmp.makeScale(0, 0, 0);
      else {
        const r = 4 + sd.t * 10;
        const k = 0.5 + sd.t * 1.5;
        tmp
          .makeScale(k, k, k)
          .setPosition(Math.cos(sd.a) * r, AXIS_Y + Math.sin(sd.a) * r * 0.6, 6 + sd.t * 8);
      }
      im.setMatrixAt(i, tmp);
    });
    im.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      <Fitting at={[0, -20]} out="z-" />
      <Shell geom={cylZ(6, 14)} mat="bronze" mode={mode} position={[0, AXIS_Y, -3]} />
      <Part geom={cylZ(6.5, 2)} mat="brass" position={[0, AXIS_Y, -10]} />
      <instancedMesh ref={puffs} args={[sphere(1.4), mat, PUFFS]} frustumCulled={false} />
    </group>
  );
}

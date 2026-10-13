/**
 * Cables eléctricos en 3D: siguen el trazado del esquema, tendidos sobre el tablero a la altura
 * de los bornes. Se colorean como en el 2D: +24 V rojo, 0 V azul, sin tensión gris oscuro.
 */
import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import * as THREE from 'three';
import { WIRE_Y } from '../components/electric/models3d';
import { connectionPolyline } from '../core/model/geometry';
import type { Circuit } from '../core/model/types';
import { useSim } from '../store/sim';
import { polylineTube, sphere } from './geom';

const COLORS = {
  plus: new THREE.Color('#dc2626'),
  zero: new THREE.Color('#2563eb'),
  off: new THREE.Color('#334155'),
};

const levelColor = (level: number | undefined) =>
  level === 1 ? COLORS.plus : level === -1 ? COLORS.zero : COLORS.off;

export function Wires3D({ circuit }: { circuit: Circuit }) {
  const wires = useMemo(
    () =>
      Object.values(circuit.connections)
        .filter((c) => c.medium === 'elec')
        .map((c) => ({
          id: c.id,
          geom: polylineTube(
            connectionPolyline(circuit, c.id).map((p) => new THREE.Vector3(p.x, WIRE_Y + 1, p.y)),
            0.9,
            3,
            6,
          ),
          mat: new THREE.MeshStandardMaterial({ color: COLORS.off.clone(), roughness: 0.55 }),
        })),
    [circuit],
  );
  const junctions = useMemo(
    () =>
      Object.values(circuit.junctions)
        .filter((j) => j.medium === 'elec')
        .map((j) => ({
          id: j.id,
          pos: [j.x, WIRE_Y + 1, j.y] as [number, number, number],
          mat: new THREE.MeshStandardMaterial({ color: COLORS.off.clone(), roughness: 0.55 }),
        })),
    [circuit],
  );

  useFrame(() => {
    const elec = useSim.getState().snapshot?.elec;
    for (const w of wires) w.mat.color.copy(levelColor(elec?.connLevel[w.id]));
    for (const j of junctions) j.mat.color.copy(levelColor(elec?.junctionLevel[j.id]));
  });

  return (
    <group>
      {wires.map((w) => (
        <mesh key={w.id} geometry={w.geom} material={w.mat} />
      ))}
      {junctions.map((j) => (
        <mesh key={j.id} geometry={sphere(1.8)} material={j.mat} position={j.pos} />
      ))}
    </group>
  );
}

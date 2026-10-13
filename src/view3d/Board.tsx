import { useMemo } from 'react';
import * as THREE from 'three';
import type { BBox } from '../core/registry';

let slotTexture: THREE.CanvasTexture | null = null;

/** Textura de perfil de aluminio ranurado (una ranura cada 25 unidades). */
function slots(): THREE.CanvasTexture {
  if (slotTexture) return slotTexture;
  const c = document.createElement('canvas');
  c.width = 8;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#d5dbe3';
  g.fillRect(0, 0, 8, 64);
  g.fillStyle = '#9aa4b2';
  g.fillRect(0, 26, 8, 12);
  g.fillStyle = '#7d8896';
  g.fillRect(0, 29, 8, 6);
  slotTexture = new THREE.CanvasTexture(c);
  slotTexture.wrapS = slotTexture.wrapT = THREE.RepeatWrapping;
  slotTexture.colorSpace = THREE.SRGBColorSpace;
  return slotTexture;
}

/** Tablero de prácticas bajo el circuito (en unidades de dibujo). */
export function Board({ bounds }: { bounds: BBox }) {
  const w = bounds.x1 - bounds.x0;
  const d = bounds.y1 - bounds.y0;
  const mat = useMemo(() => {
    const t = slots().clone();
    t.needsUpdate = true;
    t.repeat.set(1, d / 25);
    return new THREE.MeshStandardMaterial({ map: t, metalness: 0.35, roughness: 0.55 });
  }, [d]);
  return (
    <group>
      <mesh
        position={[(bounds.x0 + bounds.x1) / 2, -3, (bounds.y0 + bounds.y1) / 2]}
        material={mat}
        receiveShadow
      >
        <boxGeometry args={[w, 6, d]} />
      </mesh>
    </group>
  );
}

/**
 * Piezas móviles de los actuadores (émbolo y vástago, carro, eje…) a las que se puede unir una
 * pieza CAD importada para que se mueva con ellas. Cada actuador registra su grupo móvil; en
 * edición se guarda su posición de reposo y, al simular, la pieza unida sigue el movimiento
 * relativo a esa posición.
 */
import { useFrame } from '@react-three/fiber';
import { useEffect, type RefObject } from 'react';
import * as THREE from 'three';
import { useSim } from '../store/sim';

const anchors = new Map<string, THREE.Object3D>();

export function useAnchor(compId: string, ref: RefObject<THREE.Object3D>) {
  useEffect(() => {
    const o = ref.current;
    if (!o) return;
    anchors.set(compId, o);
    return () => {
      if (anchors.get(compId) === o) anchors.delete(compId);
    };
  }, [compId, ref]);
  useFrame(() => {
    const o = ref.current;
    if (!o) return;
    if (!useSim.getState().snapshot || !o.userData.home) {
      o.updateMatrix();
      (
        (o.userData.home as THREE.Matrix4 | undefined) ?? (o.userData.home = new THREE.Matrix4())
      ).copy(o.matrix);
    }
  });
}

const tmp = new THREE.Matrix4();

/**
 * Movimiento del actuador desde el reposo, en coordenadas del mundo (`out`). false si el
 * actuador no existe o no tiene parte móvil.
 */
export function anchorMotion(compId: string, out: THREE.Matrix4): boolean {
  const o = anchors.get(compId);
  const home = o?.userData.home as THREE.Matrix4 | undefined;
  if (!o || !home || !o.parent) return false;
  o.updateWorldMatrix(true, false);
  tmp.multiplyMatrices(o.parent.matrixWorld, home).invert();
  out.multiplyMatrices(o.matrixWorld, tmp);
  return true;
}

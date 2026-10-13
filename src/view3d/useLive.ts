import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { SimSnapshot } from '../core/sim/engine';
import { useSim } from '../store/sim';

/**
 * Llama a `cb` en cada fotograma con el estado de simulación del componente (o undefined en
 * modo edición). Lee el store directamente: la escena 3D se anima sin re-renders de React.
 */
export function useLiveState<S = any>(
  compId: string,
  cb: (state: S | undefined, snap: SimSnapshot | null, dt: number) => void,
) {
  const ref = useRef(cb);
  ref.current = cb;
  useFrame((_, dt) => {
    const snap = useSim.getState().snapshot;
    ref.current(snap?.comp[compId] as S | undefined, snap, dt);
  });
}

/** Tiempo simulado transcurrido desde el fotograma anterior (para mover partículas). */
export function useSimDelta() {
  const last = useRef<number | null>(null);
  return (snap: SimSnapshot | null) => {
    if (!snap) {
      last.current = null;
      return 0;
    }
    const d = last.current === null ? 0 : Math.max(0, snap.t - last.current);
    last.current = snap.t;
    return Math.min(d, 0.2);
  };
}

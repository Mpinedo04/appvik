import { Html } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { getModel3D } from '../components/views3d';
import { sideAt } from '../core/model/geometry';
import type { ComponentInstance } from '../core/model/types';
import { getModel, resolveParams } from '../core/registry';
import { useProject } from '../store/project';
import { useSim } from '../store/sim';
import { useView } from '../store/view';
import { box } from './geom';
import { S } from './layout';
import { sceneApi } from './sceneApi';

/** Coloca el modelo 3D de un componente y gestiona selección, accionamiento y enfoque. */
export function ComponentNode({
  c,
  selected,
  showLabel,
}: {
  c: ComponentInstance;
  selected: boolean;
  showLabel: boolean;
}) {
  const m = getModel(c.type);
  const params = resolveParams(m, c.params);
  const Model = getModel3D(c.type);
  const mode = useView((s) => s.perComp[c.id] ?? s.render3d);
  const simMode = useSim((s) => s.status !== 'stopped');
  const pressed = useRef(false);
  const bb = m.bbox(params);

  useEffect(() => {
    const up = () => {
      if (pressed.current) {
        pressed.current = false;
        useSim.getState().release(c.id);
      }
    };
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  }, [c.id]);

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const project = useProject.getState();
    if (simMode) {
      project.select({ comps: [c.id] });
      if (m.interactive?.(params)) {
        pressed.current = true;
        useSim.getState().press(c.id, sideAt(c, { x: e.point.x / S, y: e.point.z / S }));
      }
    } else {
      project.select({ comps: [c.id] }, e.nativeEvent.shiftKey);
    }
  };

  return (
    <group
      position={[c.x, 0, c.y]}
      rotation={[0, (-c.rot * Math.PI) / 180, 0]}
      scale={[c.flip ? -1 : 1, 1, 1]}
      onPointerDown={onDown}
      onDoubleClick={(e) => {
        e.stopPropagation();
        sceneApi.focus(c.id);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = simMode && m.interactive?.(params) ? 'pointer' : 'help';
      }}
      onPointerOut={() => {
        document.body.style.cursor = '';
      }}
      userData={{ compId: c.id }}
    >
      {Model ? (
        <Model
          params={params}
          compId={c.id}
          mode={mode}
          medium={m.ports(params).some((p) => p.medium === 'hyd') ? 'hyd' : 'pneu'}
        />
      ) : (
        <mesh
          geometry={box(bb.x1 - bb.x0, 10, bb.y1 - bb.y0)}
          position={[(bb.x0 + bb.x1) / 2, 5, (bb.y0 + bb.y1) / 2]}
        >
          <meshStandardMaterial color="#94a3b8" />
        </mesh>
      )}
      {selected && (
        <mesh
          position={[(bb.x0 + bb.x1) / 2, 0.4, (bb.y0 + bb.y1) / 2]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[bb.x1 - bb.x0 + 12, bb.y1 - bb.y0 + 12]} />
          <meshBasicMaterial color="#2563eb" transparent opacity={0.28} depthWrite={false} />
        </mesh>
      )}
      {showLabel && (
        <Html
          position={[bb.x0, 34, bb.y0]}
          className="label3d"
          zIndexRange={[10, 0]}
          pointerEvents="none"
        >
          {c.label}
        </Html>
      )}
    </group>
  );
}

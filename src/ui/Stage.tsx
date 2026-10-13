import { lazy, Suspense, useRef } from 'react';
import { Canvas } from '../editor/Canvas';
import { useView } from '../store/view';

// La vista 3D (Three.js) se descarga sólo cuando se abre por primera vez.
const Scene3D = lazy(() => import('../view3d/Scene3D'));

/** Zona central: esquema 2D, vista 3D o ambas con un divisor arrastrable. */
export function Stage() {
  const layout = useView((s) => s.layout);
  const split = useView((s) => s.split);
  const ref = useRef<HTMLDivElement>(null);

  const startDrag = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const r = el.getBoundingClientRect();
      useView.getState().setSplit((ev.clientX - r.left) / r.width);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div
      ref={ref}
      className={`stage ${layout}`}
      style={
        layout === 'split' ? { gridTemplateColumns: `${split}fr 6px ${1 - split}fr` } : undefined
      }
    >
      {layout !== '3d' && <Canvas />}
      {layout === 'split' && (
        <div
          className="splitter"
          onPointerDown={startDrag}
          role="separator"
          aria-label="Redimensionar"
        />
      )}
      {layout !== '2d' && (
        <Suspense fallback={<div className="loading3d">Cargando vista 3D…</div>}>
          <Scene3D />
        </Suspense>
      )}
    </div>
  );
}

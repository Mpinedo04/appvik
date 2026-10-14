/** Galería de ejemplos: tarjetas con miniatura y explicación, agrupadas por temas. */
import { useMemo } from 'react';
import { CircuitDrawing, circuitBounds } from '../editor/CircuitDrawing';
import { EXAMPLES } from '../examples';
import { parseProject } from '../store/project';
import { useView } from '../store/view';
import { loadProject } from './actions';

const GROUPS: { title: string; test: (n: number) => boolean }[] = [
  { title: 'Neumática', test: (n) => n >= 1 && n <= 7 },
  { title: 'Electroneumática', test: (n) => n >= 8 && n <= 10 },
  { title: 'Hidráulica', test: (n) => n >= 11 && n <= 14 },
  { title: 'GRAFCET y PLC', test: (n) => n >= 15 && n <= 30 },
  { title: 'Otros', test: (n) => n > 30 },
];

function Thumb({ json }: { json: string }) {
  const circuit = useMemo(() => parseProject(json).circuit, [json]);
  const b = circuitBounds(circuit);
  return (
    <svg
      className="thumb-svg"
      viewBox={`${b.x0} ${b.y0} ${b.x1 - b.x0} ${b.y1 - b.y0}`}
      preserveAspectRatio="xMidYMid meet"
    >
      <CircuitDrawing circuit={circuit} labels={false} />
    </svg>
  );
}

export function Gallery() {
  const open = useView((s) => s.gallery);
  if (!open) return null;
  const close = () => useView.getState().setGallery(false);
  const num = (id: string) => Number(id.slice(0, 2));
  return (
    <div className="modal-back" onPointerDown={close}>
      <div
        className="modal gallery"
        role="dialog"
        aria-label="Galería de ejemplos"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <header>
          <h2>Galería de ejemplos</h2>
          <button className="btn" onClick={close} aria-label="Cerrar">
            ✕
          </button>
        </header>
        <div className="gallery-body">
          {GROUPS.map((g) => {
            const items = EXAMPLES.filter((e) => g.test(num(e.id)));
            if (!items.length) return null;
            return (
              <section key={g.title}>
                <h3>{g.title}</h3>
                <div className="cards">
                  {items.map((ex) => (
                    <button
                      key={ex.id}
                      className="card"
                      data-testid={`example-${ex.id}`}
                      onClick={() => {
                        loadProject(parseProject(ex.json));
                        useView.getState().setSheet('circuit');
                        close();
                      }}
                    >
                      <Thumb json={ex.json} />
                      <b>
                        {num(ex.id)} · {ex.name}
                      </b>
                      <span>{ex.description}</span>
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { getView } from '../components/views';
import { canvasApi, LIBRARY_MIME } from '../editor/canvasApi';
import { addComponent } from '../core/model/edit';
import type { Circuit } from '../core/model/types';
import { allModels, CATEGORIES, defaultParams, type ComponentModel } from '../core/registry';
import { useProject } from '../store/project';
import { useSim } from '../store/sim';

function Thumb({ m }: { m: ComponentModel }) {
  const p = defaultParams(m);
  const b = m.bbox(p);
  const View = getView(m.type).Symbol2D;
  const pad = 6;
  return (
    <svg
      viewBox={`${b.x0 - pad} ${b.y0 - pad} ${b.x1 - b.x0 + 2 * pad} ${b.y1 - b.y0 + 2 * pad}`}
      className="thumb"
    >
      <View params={p} />
    </svg>
  );
}

export function Library() {
  const [query, setQuery] = useState('');
  const simMode = useSim((s) => s.status !== 'stopped');
  const models = allModels().filter((m) => m.name.toLowerCase().includes(query.toLowerCase()));

  const addAtCenter = (type: string) => {
    if (simMode) return;
    const c = canvasApi.centerWorld();
    let id = '';
    useProject.getState().commit((d) => {
      id = addComponent(d as Circuit, type, c.x, c.y);
    });
    useProject.getState().select({ comps: [id] });
  };

  return (
    <aside className="panel library" aria-label="Biblioteca de componentes">
      <div className="panel-head">Biblioteca</div>
      <input
        className="search"
        placeholder="Buscar componente…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="library-scroll">
        {CATEGORIES.map((cat) => {
          const items = models.filter((m) => m.category === cat.id);
          if (!items.length) return null;
          return (
            <section key={cat.id}>
              <h3>{cat.name}</h3>
              <div className="lib-grid">
                {items.map((m) => (
                  <button
                    key={m.type}
                    className="lib-item"
                    draggable={!simMode}
                    disabled={simMode}
                    title={`${m.name}\n${m.description}\n(Arrastra al lienzo o haz doble clic)`}
                    data-type={m.type}
                    onDragStart={(e) => {
                      e.dataTransfer.setData(LIBRARY_MIME, m.type);
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                    onDoubleClick={() => addAtCenter(m.type)}
                  >
                    <Thumb m={m} />
                    <span>{m.name}</span>
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </aside>
  );
}

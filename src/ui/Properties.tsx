import { useEffect, useState } from 'react';
import { connectionPolyline, polylineLength } from '../core/model/geometry';
import { pruneDanglingConnections, rerouteConnection } from '../core/model/edit';
import type { Circuit, ParamValue } from '../core/model/types';
import { getModel, resolveParams, type ParamDef } from '../core/registry';
import { TUBE_INNER_DIAMETER_MM, TUBE_MM_PER_UNIT } from '../core/sim/compiler';
import { useProject } from '../store/project';
import { currentSimulation, useSim } from '../store/sim';
import { RENDER_LABELS, useView, type Render3D } from '../store/view';

function NumberField({
  def,
  value,
  onCommit,
}: {
  def: Extract<ParamDef, { type: 'number' }>;
  value: number;
  onCommit: (v: number) => void;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    let v = Number(text.replace(',', '.'));
    if (!Number.isFinite(v)) return setText(String(value));
    if (def.min !== undefined) v = Math.max(def.min, v);
    if (def.max !== undefined) v = Math.min(def.max, v);
    setText(String(v));
    if (v !== value) onCommit(v);
  };
  return (
    <input
      type="number"
      value={text}
      step={def.step}
      min={def.min}
      max={def.max}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

function TextField({
  value,
  placeholder,
  onCommit,
}: {
  value: string;
  placeholder?: string;
  onCommit: (v: string) => void;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <input
      value={text}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => text !== value && onCommit(text.trim())}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

/** Modo de visualización 3D particular de un componente (si no, el global). */
function Render3DSelect({ id }: { id: string }) {
  const layout = useView((s) => s.layout);
  const mode = useView((s) => s.perComp[id] ?? '');
  if (layout === '2d') return null;
  return (
    <label className="field">
      <span>Vista 3D de este componente</span>
      <select
        value={mode}
        onChange={(e) =>
          useView.getState().setCompRender(id, (e.target.value || null) as Render3D | null)
        }
      >
        <option value="">Como el resto (global)</option>
        {(Object.keys(RENDER_LABELS) as Render3D[]).map((r) => (
          <option key={r} value={r}>
            {RENDER_LABELS[r]}
          </option>
        ))}
      </select>
    </label>
  );
}

function Explain({ compId }: { compId: string }) {
  // Se vuelve a dibujar con cada fotograma de la simulación.
  useSim((s) => s.snapshot);
  const lines = currentSimulation()?.explain(compId) ?? [];
  return (
    <div className="explain" aria-live="polite">
      {lines.map((l, i) => (
        <p key={i}>{l}</p>
      ))}
    </div>
  );
}

export function Properties() {
  const circuit = useProject((s) => s.circuit);
  const selection = useProject((s) => s.selection);
  const name = useProject((s) => s.name);
  const simMode = useSim((s) => s.status !== 'stopped');
  const { commit, setName } = useProject.getState();

  const single =
    selection.comps.length === 1 && !selection.conns.length
      ? circuit.components[selection.comps[0]]
      : null;

  if (simMode) {
    return (
      <aside className="panel props">
        <div className="panel-head">¿Qué está pasando dentro?</div>
        {single ? (
          <div className="props-body">
            <h2>
              {single.label} · {getModel(single.type).name}
            </h2>
            <Explain compId={single.id} />
            <Render3DSelect id={single.id} />
          </div>
        ) : (
          <div className="props-body hint">
            <p>
              Haz clic en un componente para ver qué ocurre en su interior durante la simulación.
            </p>
            <p>
              Mantén pulsado el botón del ratón sobre una válvula con pulsador para accionarla; las
              palancas con enclavamiento cambian de posición con cada clic.
            </p>
            <p className="legend">
              <span className="sw" style={{ background: '#2f6fde' }} /> 0 bar (escape)
              <span className="sw" style={{ background: 'hsl(110 80% 46%)' }} /> media
              <span className="sw" style={{ background: 'hsl(0 80% 44%)' }} /> presión de trabajo
            </p>
          </div>
        )}
      </aside>
    );
  }

  if (single) {
    const m = getModel(single.type);
    const params = resolveParams(m, single.params);
    const setParam = (key: string, v: ParamValue) =>
      commit((d) => {
        d.components[single.id].params[key] = v;
        // Si desaparece un puerto (p. ej. al quitar un pilotaje) se borran sus tuberías;
        // las demás se vuelven a trazar porque los puertos pueden haberse movido.
        pruneDanglingConnections(d as Circuit);
        for (const c of Object.values(d.connections)) {
          if (
            (c.a.kind === 'port' && c.a.comp === single.id) ||
            (c.b.kind === 'port' && c.b.comp === single.id)
          )
            rerouteConnection(d as Circuit, c.id);
        }
      });
    return (
      <aside className="panel props">
        <div className="panel-head">Propiedades</div>
        <div className="props-body">
          <h2>{m.name}</h2>
          <p className="desc">{m.description}</p>
          <Render3DSelect id={single.id} />
          <label className="field">
            <span>Etiqueta</span>
            <TextField
              value={single.label}
              onCommit={(v) => commit((d) => void (d.components[single.id].label = v))}
            />
          </label>
          {m.params
            .filter((def) => !def.when || def.when(params))
            .map((def) => (
              <label className="field" key={def.key}>
                <span>
                  {def.label}
                  {def.unit ? ` [${def.unit}]` : ''}
                </span>
                {def.type === 'number' && (
                  <NumberField
                    def={def}
                    value={Number(params[def.key])}
                    onCommit={(v) => setParam(def.key, v)}
                  />
                )}
                {def.type === 'select' && (
                  <select
                    value={String(params[def.key])}
                    onChange={(e) => setParam(def.key, e.target.value)}
                  >
                    {def.options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                )}
                {def.type === 'text' && (
                  <TextField
                    value={String(params[def.key])}
                    placeholder={def.placeholder}
                    onCommit={(v) => setParam(def.key, v)}
                  />
                )}
                {def.type === 'boolean' && (
                  <input
                    type="checkbox"
                    checked={Boolean(params[def.key])}
                    onChange={(e) => setParam(def.key, e.target.checked)}
                  />
                )}
                {def.help && <small className="help">{def.help}</small>}
              </label>
            ))}
        </div>
      </aside>
    );
  }

  if (selection.conns.length === 1 && !selection.comps.length) {
    const id = selection.conns[0];
    const len = (polylineLength(connectionPolyline(circuit, id)) * TUBE_MM_PER_UNIT) / 1000;
    return (
      <aside className="panel props">
        <div className="panel-head">Propiedades</div>
        <div className="props-body">
          <h2>Tubería</h2>
          <p className="desc">
            Longitud equivalente: {len.toFixed(2)} m · Ø interior {TUBE_INNER_DIAMETER_MM} mm.
            Arrastra un tramo intermedio para moverlo.
          </p>
          <button
            className="btn"
            onClick={() => commit((d) => rerouteConnection(d as Circuit, id))}
          >
            Volver a trazar automáticamente
          </button>
        </div>
      </aside>
    );
  }

  const count = selection.comps.length + selection.conns.length + selection.junctions.length;
  return (
    <aside className="panel props">
      <div className="panel-head">Propiedades</div>
      <div className="props-body">
        {count > 1 ? (
          <p>
            {count} elementos seleccionados. Puedes moverlos, girarlos (R), reflejarlos (F),
            copiarlos o borrarlos.
          </p>
        ) : (
          <>
            <label className="field">
              <span>Nombre del proyecto</span>
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <div className="hint">
              <p>
                <b>Cómo se usa</b>
              </p>
              <ul>
                <li>Arrastra componentes desde la biblioteca.</li>
                <li>
                  Arrastra desde un puerto ○ hasta otro para unirlos con una tubería. Suelta sobre
                  una tubería para crear una derivación en T.
                </li>
                <li>Rueda: zoom · botón central o espacio + arrastrar: desplazar.</li>
                <li>
                  R girar · F reflejar · Supr borrar · Ctrl+Z/Y deshacer/rehacer · Ctrl+C/V
                  copiar/pegar.
                </li>
                <li>Pulsa ▶ para simular y haz clic en las válvulas para accionarlas.</li>
              </ul>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}

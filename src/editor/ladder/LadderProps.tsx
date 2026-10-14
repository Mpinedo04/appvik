/** Panel derecho del esquema de contactos: condición y bobina del segmento seleccionado. */
import { useEffect, useState } from 'react';
import { exprError } from '../../core/control/expr';
import type { Circuit, LadderCoilKind } from '../../core/model/types';
import { useProject } from '../../store/project';
import { useSim } from '../../store/sim';
import { useView } from '../../store/view';
import { availableSignals } from '../signals';

const COILS: { value: LadderCoilKind; label: string }[] = [
  { value: 'coil', label: 'Bobina ( )' },
  { value: 'set', label: 'Activar (S)' },
  { value: 'reset', label: 'Desactivar (R) / poner a cero' },
  { value: 'TON', label: 'Temporizador a la conexión (TON)' },
  { value: 'TOF', label: 'Temporizador a la desconexión (TOF)' },
  { value: 'CTU', label: 'Contador ascendente (CTU)' },
];

function Text({
  value,
  onCommit,
  testid,
}: {
  value: string;
  onCommit: (v: string) => void;
  testid?: string;
}) {
  const [t, setT] = useState(value);
  useEffect(() => setT(value), [value]);
  return (
    <input
      value={t}
      data-testid={testid}
      onChange={(e) => setT(e.target.value)}
      onBlur={() => t !== value && onCommit(t.trim())}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

export function LadderProps() {
  const circuit = useProject((s) => s.circuit);
  const sel = useView((s) => s.ctrlSel);
  const live = useSim((s) => s.snapshot?.control.ladder);
  const simMode = useSim((s) => s.status !== 'stopped');
  const commit = useProject.getState().commit;
  const rungs = circuit.ladder?.rungs ?? [];
  const i = rungs.findIndex((r) => r.id === sel);
  const r = i >= 0 ? rungs[i] : undefined;
  const edit = (recipe: (rung: Circuit['ladder'] & object, idx: number) => void) =>
    commit((c: Circuit) => recipe(c.ladder!, i));
  const plc = Object.values(circuit.components).find(
    (c) => c.type === 'ctrl-plc' && (c.params.program ?? 'ladder') === 'ladder',
  );

  return (
    <aside className="panel props">
      <div className="panel-head">Esquema de contactos</div>
      <div className="props-body">
        <p className="desc">
          {plc
            ? `Lo ejecuta ${plc.label} en cada ciclo (entradas I0.x, salidas Q0.x, marcas M…, temporizadores T…, contadores C…).`
            : 'Sin PLC: se ejecuta directamente sobre las señales del circuito.'}
        </p>
        {r ? (
          <>
            <h2>Segmento {i + 1}</h2>
            <label className="field">
              <span>Condición (contactos)</span>
              <Text
                value={r.cond}
                testid="rung-cond"
                onCommit={(v) => edit((l, k) => void (l.rungs[k].cond = v))}
              />
            </label>
            {exprError(r.cond) && <p className="error">{exprError(r.cond)}</p>}
            <p className="desc">
              Serie (Y): <code>·</code> · paralelo (O): <code>+</code> · contacto cerrado (NC):{' '}
              <code>!I0.1</code> · flanco: <code>↑I0.0</code>
            </p>
            <label className="field">
              <span>Bobina</span>
              <select
                value={r.coil.kind}
                disabled={simMode}
                onChange={(e) =>
                  edit((l, k) => void (l.rungs[k].coil.kind = e.target.value as LadderCoilKind))
                }
              >
                {COILS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Variable</span>
              <Text
                value={r.coil.target}
                onCommit={(v) => edit((l, k) => void (l.rungs[k].coil.target = v))}
              />
            </label>
            {['TON', 'TOF', 'CTU'].includes(r.coil.kind) && (
              <label className="field">
                <span>{r.coil.kind === 'CTU' ? 'Preselección (cuenta)' : 'Tiempo [s]'}</span>
                <input
                  type="number"
                  value={r.coil.preset ?? 1}
                  step={r.coil.kind === 'CTU' ? 1 : 0.1}
                  onChange={(e) =>
                    edit((l, k) => void (l.rungs[k].coil.preset = Number(e.target.value)))
                  }
                />
              </label>
            )}
            <label className="field">
              <span>Comentario</span>
              <Text
                value={r.comment ?? ''}
                onCommit={(v) => edit((l, k) => void (l.rungs[k].comment = v))}
              />
            </label>
            <div className="row-btns">
              <button
                className="btn"
                disabled={simMode || i === 0}
                onClick={() =>
                  edit((l, k) => void l.rungs.splice(k - 1, 0, l.rungs.splice(k, 1)[0]))
                }
              >
                Subir
              </button>
              <button
                className="btn"
                disabled={simMode || i === rungs.length - 1}
                onClick={() =>
                  edit((l, k) => void l.rungs.splice(k + 1, 0, l.rungs.splice(k, 1)[0]))
                }
              >
                Bajar
              </button>
              <button
                className="btn"
                disabled={simMode}
                onClick={() => {
                  edit((l, k) => void l.rungs.splice(k, 1));
                  useView.getState().setCtrlSel(null);
                }}
              >
                Borrar
              </button>
            </div>
          </>
        ) : (
          <p className="desc">Selecciona un segmento para editarlo.</p>
        )}
        {live && Object.keys(live.acc).length > 0 && (
          <p className="desc">
            {Object.entries(live.acc)
              .map(([k, v]) => `${k}: ${k.startsWith('T') ? `${v.toFixed(1)} s` : v}`)
              .join(' · ')}
          </p>
        )}
        <h3>Variables del circuito</h3>
        <p className="desc signals">{availableSignals(circuit).join(' · ') || '—'}</p>
      </div>
    </aside>
  );
}

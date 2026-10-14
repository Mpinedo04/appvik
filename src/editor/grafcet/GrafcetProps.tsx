/** Panel derecho del GRAFCET: etapa (número, inicial, acciones) o transición (receptividad). */
import { useEffect, useState } from 'react';
import { exprError } from '../../core/control/expr';
import type { Circuit, GrafcetActionKind } from '../../core/model/types';
import { useProject } from '../../store/project';
import { useSim } from '../../store/sim';
import { useView } from '../../store/view';
import { availableSignals } from '../signals';

const KINDS: { value: GrafcetActionKind; label: string }[] = [
  { value: 'N', label: 'N · continua' },
  { value: 'S', label: 'S · activar (memoriza)' },
  { value: 'R', label: 'R · desactivar' },
  { value: 'D', label: 'D · retardada' },
  { value: 'L', label: 'L · limitada' },
  { value: 'CU', label: 'Contar (+1 al activarse)' },
  { value: 'CR', label: 'Poner contador a 0' },
];

/** Campo de texto que confirma al salir o con Intro. */
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

export function GrafcetProps() {
  const circuit = useProject((s) => s.circuit);
  const sel = useView((s) => s.ctrlSel);
  const live = useSim((s) => s.snapshot?.control.grafcet);
  const simMode = useSim((s) => s.status !== 'stopped');
  const commit = useProject.getState().commit;
  const g = circuit.grafcet;
  const step = sel ? g?.steps[sel] : undefined;
  const trans = sel ? g?.transitions[sel] : undefined;
  const plc = Object.values(circuit.components).find(
    (c) => c.type === 'ctrl-plc' && c.params.program === 'grafcet',
  );
  const edit = (recipe: (c: Circuit) => void) => commit(recipe);

  return (
    <aside className="panel props">
      <div className="panel-head">GRAFCET</div>
      <div className="props-body">
        <p className="desc">
          {plc
            ? `Lo ejecuta ${plc.label} (entradas I0.0–I0.7, salidas Q0.0–Q0.7).`
            : 'Mando directo: lee y activa las señales del circuito (marcas de los cilindros, pulsadores, bobinas Y…).'}
        </p>
        {step && (
          <>
            <h2>Etapa {step.n}</h2>
            <label className="field">
              <span>Número</span>
              <input
                type="number"
                value={step.n}
                disabled={simMode}
                onChange={(e) =>
                  edit((c) => void (c.grafcet!.steps[step.id].n = Number(e.target.value)))
                }
              />
            </label>
            <label className="field chk">
              <input
                type="checkbox"
                checked={step.initial}
                disabled={simMode}
                onChange={(e) =>
                  edit((c) => void (c.grafcet!.steps[step.id].initial = e.target.checked))
                }
              />{' '}
              Etapa inicial (activa al empezar)
            </label>
            <h3>Acciones</h3>
            {step.actions.map((a, i) => (
              <div className="action-row" key={i}>
                <select
                  value={a.kind}
                  disabled={simMode}
                  onChange={(e) =>
                    edit(
                      (c) =>
                        void (c.grafcet!.steps[step.id].actions[i].kind = e.target
                          .value as GrafcetActionKind),
                    )
                  }
                >
                  {KINDS.map((k) => (
                    <option key={k.value} value={k.value}>
                      {k.label}
                    </option>
                  ))}
                </select>
                <Text
                  value={a.target}
                  onCommit={(v) =>
                    edit((c) => void (c.grafcet!.steps[step.id].actions[i].target = v))
                  }
                />
                {['D', 'L', 'CU'].includes(a.kind) && (
                  <input
                    type="number"
                    title={a.kind === 'CU' ? 'Preselección' : 'Tiempo [s]'}
                    value={a.time ?? (a.kind === 'CU' ? 1 : 1)}
                    step={a.kind === 'CU' ? 1 : 0.1}
                    onChange={(e) =>
                      edit(
                        (c) =>
                          void (c.grafcet!.steps[step.id].actions[i].time = Number(e.target.value)),
                      )
                    }
                  />
                )}
                <button
                  className="btn"
                  title="Quitar"
                  disabled={simMode}
                  onClick={() => edit((c) => void c.grafcet!.steps[step.id].actions.splice(i, 1))}
                >
                  ×
                </button>
              </div>
            ))}
            <button
              className="btn"
              disabled={simMode}
              onClick={() =>
                edit(
                  (c) => void c.grafcet!.steps[step.id].actions.push({ kind: 'N', target: 'Y1' }),
                )
              }
            >
              + Acción
            </button>
          </>
        )}
        {trans && (
          <>
            <h2>Transición</h2>
            <label className="field">
              <span>Receptividad</span>
              <Text
                value={trans.cond}
                testid="gf-cond"
                onCommit={(v) => edit((c) => void (c.grafcet!.transitions[trans.id].cond = v))}
              />
            </label>
            {exprError(trans.cond) && <p className="error">{exprError(trans.cond)}</p>}
            <p className="desc">
              Y: <code>·</code> o <code>*</code> · O: <code>+</code> · NO: <code>!</code> · flanco:{' '}
              <code>↑S1</code> · tiempo: <code>t/X2/3s</code> · siempre: <code>1</code>
            </p>
          </>
        )}
        {!step && !trans && (
          <p className="desc">
            Selecciona una etapa o una transición para editarla. Las etapas activas se marcan en
            verde durante la simulación.
          </p>
        )}
        {live && (
          <p className="desc">
            Etapas activas:{' '}
            <b>
              {live.active
                .map((id) => g?.steps[id]?.n)
                .sort((a, b) => (a ?? 0) - (b ?? 0))
                .join(', ') || '—'}
            </b>
            {Object.keys(live.counters).length > 0 &&
              ` · contadores: ${Object.entries(live.counters)
                .map(([k, v]) => `${k} = ${v}`)
                .join(', ')}`}
          </p>
        )}
        <h3>Variables del circuito</h3>
        <p className="desc signals">{availableSignals(circuit).join(' · ') || '—'}</p>
      </div>
    </aside>
  );
}

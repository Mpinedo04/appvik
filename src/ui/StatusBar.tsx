import { useEffect, useMemo, useState } from 'react';
import { validate } from '../core/model/edit';
import { useProject } from '../store/project';
import { useSim } from '../store/sim';

export function StatusBar() {
  const circuit = useProject((s) => s.circuit);
  const toast = useProject((s) => s.toast);
  const simError = useSim((s) => s.error);
  const issues = useMemo(() => validate(circuit), [circuit]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => useProject.getState().notify(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const nComp = Object.keys(circuit.components).length;
  const nConn = Object.keys(circuit.connections).length;

  return (
    <footer className="statusbar">
      <span>
        {nComp} componentes · {nConn} tuberías
      </span>
      {issues.length > 0 ? (
        <button className="issues" onClick={() => setOpen(!open)} aria-expanded={open}>
          ⚠ {issues.length} {issues.length === 1 ? 'aviso' : 'avisos'}
        </button>
      ) : (
        nComp > 0 && <span className="ok">✓ Sin puertos abiertos</span>
      )}
      {(simError || toast) && (
        <span className={simError ? 'toast error' : 'toast'}>{simError ?? toast}</span>
      )}
      {open && issues.length > 0 && (
        <div className="issues-pop" role="dialog">
          {issues.map((i, k) => (
            <button
              key={k}
              onClick={() => {
                useProject.getState().select({ comps: [i.comp] });
                setOpen(false);
              }}
            >
              {i.message}
            </button>
          ))}
        </div>
      )}
    </footer>
  );
}

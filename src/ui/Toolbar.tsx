import type { ReactNode } from 'react';
import { canvasApi } from '../editor/canvasApi';
import { EXAMPLES } from '../examples';
import { parseProject, useProject } from '../store/project';
import { SPEEDS, useSim } from '../store/sim';
import {
  deleteSelection,
  exportPng,
  flipSelection,
  loadProject,
  newProject,
  openFile,
  rotateSelection,
  saveFile,
} from './actions';

const ICONS: Record<string, ReactNode> = {
  new: <path d="M6 3h8l4 4v14H6zM14 3v4h4" />,
  open: <path d="M3 7h6l2 2h10v10H3z" />,
  save: <path d="M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6" />,
  image: <path d="M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9h.01" />,
  undo: <path d="M9 8H4V3M4 8a8 8 0 1 1 2 7" />,
  redo: <path d="M15 8h5V3M20 8a8 8 0 1 0-2 7" />,
  rotate: <path d="M20 12a8 8 0 1 1-3-6.3M20 4v5h-5" />,
  flip: <path d="M12 3v18M8 7l-5 5 5 5zM16 7l5 5-5 5z" />,
  trash: <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />,
  fit: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  play: <path d="M7 4l13 8-13 8z" fill="currentColor" />,
  pause: <path d="M7 4h4v16H7zM13 4h4v16h-4z" fill="currentColor" />,
  stop: <path d="M6 6h12v12H6z" fill="currentColor" />,
  step: <path d="M5 4l10 8-10 8zM17 4h3v16h-3z" fill="currentColor" />,
};

function Btn({
  icon,
  label,
  onClick,
  disabled,
  active,
  testId,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  testId?: string;
}) {
  return (
    <button
      className={`tb-btn ${active ? 'active' : ''}`}
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
    >
      <svg
        viewBox="0 0 24 24"
        width={18}
        height={18}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {ICONS[icon]}
      </svg>
    </button>
  );
}

export function Toolbar() {
  const { undo, redo } = useProject.getState();
  const canUndo = useProject((s) => s.past.length > 0);
  const canRedo = useProject((s) => s.future.length > 0);
  const hasSel = useProject(
    (s) => s.selection.comps.length + s.selection.conns.length + s.selection.junctions.length > 0,
  );
  const status = useSim((s) => s.status);
  const speed = useSim((s) => s.speed);
  const t = useSim((s) => s.snapshot?.t ?? 0);
  const sim = useSim.getState();
  const editing = status === 'stopped';

  return (
    <header className="toolbar">
      <div className="brand">
        <svg viewBox="0 0 32 32" width={22} height={22}>
          <rect
            x="2"
            y="9"
            width="20"
            height="14"
            rx="2"
            fill="none"
            stroke="#60a5fa"
            strokeWidth="3"
          />
          <line x1="12" y1="9" x2="12" y2="23" stroke="#60a5fa" strokeWidth="3" />
          <line x1="12" y1="16" x2="30" y2="16" stroke="#f87171" strokeWidth="3" />
        </svg>
        <span>FluidLab 3D</span>
      </div>

      <div className="tb-group" aria-label="Archivo">
        <Btn icon="new" label="Nuevo" onClick={newProject} />
        <Btn icon="open" label="Abrir…" onClick={openFile} />
        <Btn icon="save" label="Guardar (Ctrl+S)" onClick={saveFile} />
        <Btn icon="image" label="Exportar imagen PNG" onClick={exportPng} />
        <select
          className="tb-select"
          aria-label="Ejemplos"
          value=""
          onChange={(e) => {
            const ex = EXAMPLES.find((x) => x.id === e.target.value);
            if (ex) loadProject(parseProject(ex.json));
          }}
        >
          <option value="">Ejemplos…</option>
          {EXAMPLES.map((ex) => (
            <option key={ex.id} value={ex.id} title={ex.description}>
              {ex.name}
            </option>
          ))}
        </select>
      </div>

      <div className="tb-group" aria-label="Edición">
        <Btn icon="undo" label="Deshacer (Ctrl+Z)" onClick={undo} disabled={!editing || !canUndo} />
        <Btn icon="redo" label="Rehacer (Ctrl+Y)" onClick={redo} disabled={!editing || !canRedo} />
        <Btn
          icon="rotate"
          label="Girar 90° (R)"
          onClick={rotateSelection}
          disabled={!editing || !hasSel}
        />
        <Btn
          icon="flip"
          label="Reflejar (F)"
          onClick={flipSelection}
          disabled={!editing || !hasSel}
        />
        <Btn
          icon="trash"
          label="Borrar (Supr)"
          onClick={deleteSelection}
          disabled={!editing || !hasSel}
        />
        <Btn icon="fit" label="Ajustar a la ventana" onClick={() => canvasApi.fit()} />
      </div>

      <div className="tb-group sim-group" aria-label="Simulación">
        <Btn
          icon="play"
          label="Iniciar simulación (F9)"
          onClick={sim.start}
          active={status === 'running'}
          testId="sim-start"
        />
        <Btn
          icon="pause"
          label="Pausa"
          onClick={sim.pause}
          disabled={status !== 'running'}
          active={status === 'paused'}
        />
        <Btn
          icon="stop"
          label="Parar y volver a edición (Esc)"
          onClick={sim.stop}
          disabled={editing}
          testId="sim-stop"
        />
        <Btn icon="step" label="Paso a paso (5 ms)" onClick={sim.stepOnce} />
        <label className="speed">
          <span>Velocidad</span>
          <select value={speed} onChange={(e) => sim.setSpeed(Number(e.target.value))}>
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s < 1 ? `${s}× (cámara lenta)` : `${s}×`}
              </option>
            ))}
          </select>
        </label>
        <span className="sim-time" data-testid="sim-time">
          {editing ? 'Edición' : `t = ${t.toFixed(3)} s`}
        </span>
      </div>
    </header>
  );
}

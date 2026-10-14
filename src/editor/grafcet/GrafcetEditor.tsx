/**
 * Editor de GRAFCET: etapas (cuadrados, doble en las iniciales), transiciones (barras con su
 * receptividad) y enlaces orientados. Se arrastran los elementos, se unen con «Unir» y se
 * editan en el panel derecho. En simulación se marcan las etapas activas y las transiciones
 * franqueables.
 */
import { useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { exprError } from '../../core/control/expr';
import type { Circuit, Grafcet } from '../../core/model/types';
import { newId } from '../../core/model/types';
import { useProject } from '../../store/project';
import { useSim } from '../../store/sim';
import { useView } from '../../store/view';

const S = 40; // lado de la etapa
const G = 10; // rejilla
const snap = (v: number) => Math.round(v / G) * G;
const ACTIVE = '#16a34a';
const FONT = 'Inter, system-ui, sans-serif';

export const emptyGrafcet = (): Grafcet => ({ steps: {}, transitions: {}, links: {} });

/** GRAFCET de partida: etapa inicial 0 → transición → etapa 1 → vuelta. */
export function starterGrafcet(): Grafcet {
  return {
    steps: {
      X0: { id: 'X0', n: 0, x: 200, y: 60, initial: true, actions: [] },
      X1: {
        id: 'X1',
        n: 1,
        x: 200,
        y: 180,
        initial: false,
        actions: [{ kind: 'N', target: 'Y1' }],
      },
    },
    transitions: {
      T1: { id: 'T1', x: 200, y: 120, cond: 'S1' },
      T2: { id: 'T2', x: 200, y: 240, cond: '1B2' },
    },
    links: {
      L1: { id: 'L1', from: 'X0', to: 'T1' },
      L2: { id: 'L2', from: 'T1', to: 'X1' },
      L3: { id: 'L3', from: 'X1', to: 'T2' },
      L4: { id: 'L4', from: 'T2', to: 'X0' },
    },
  };
}

/** Polilínea de un enlace (ortogonal; si sube, rodea por la izquierda). */
function linkPath(
  g: Grafcet,
  from: string,
  to: string,
): { pts: [number, number][]; up: boolean } | null {
  const s = g.steps[from] ?? g.steps[to];
  const t = g.transitions[from] ?? g.transitions[to];
  if (!s || !t) return null;
  const stepFirst = !!g.steps[from];
  const a: [number, number] = stepFirst ? [s.x, s.y + S / 2] : [t.x, t.y + 2];
  const b: [number, number] = stepFirst ? [t.x, t.y - 2] : [s.x, s.y - S / 2];
  if (b[1] > a[1] + 4) {
    if (a[0] === b[0]) return { pts: [a, b], up: false };
    const my = snap((a[1] + b[1]) / 2);
    return { pts: [a, [a[0], my], [b[0], my], b], up: false };
  }
  // Salto hacia arriba: baja un poco, va a la izquierda, sube y entra por arriba.
  const left = Math.min(a[0], b[0]) - 70;
  return {
    pts: [a, [a[0], a[1] + 14], [left, a[1] + 14], [left, b[1] - 14], [b[0], b[1] - 14], b],
    up: true,
  };
}

function actionText(a: Grafcet['steps'][string]['actions'][number]) {
  const t = a.time !== undefined && ['D', 'L'].includes(a.kind) ? ` t=${a.time}s` : '';
  const pre =
    a.kind === 'CU' ? `${a.target} := ${a.target}+1` : a.kind === 'CR' ? `${a.target} := 0` : '';
  if (pre) return pre;
  return `${a.kind === 'N' ? '' : `${a.kind} `}${a.target}${t}`;
}

type Drag = {
  id: string;
  kind: 'step' | 'trans';
  x0: number;
  y0: number;
  px: number;
  py: number;
} | null;

export function GrafcetEditor() {
  const circuit = useProject((s) => s.circuit);
  const g = circuit.grafcet;
  const sel = useView((s) => s.ctrlSel);
  const live = useSim((s) => s.snapshot?.control.grafcet);
  const simMode = useSim((s) => s.status !== 'stopped');
  const [linkFrom, setLinkFrom] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const drag = useRef<Drag>(null);
  const svg = useRef<SVGSVGElement>(null);
  const { commit, beginTx, updateTx, endTx } = useProject.getState();
  const setSel = useView.getState().setCtrlSel;

  const bounds = useMemo(() => {
    const xs: number[] = [600];
    const ys: number[] = [400];
    if (g) {
      for (const s of Object.values(g.steps)) {
        xs.push(s.x + 260);
        ys.push(s.y + 80);
      }
      for (const t of Object.values(g.transitions)) {
        xs.push(t.x + 260);
        ys.push(t.y + 80);
      }
    }
    return { w: Math.max(...xs), h: Math.max(...ys) };
  }, [g]);

  if (!g || !Object.keys(g.steps).length)
    return (
      <div className="ctrl-editor empty">
        <div className="ctrl-empty">
          <h2>GRAFCET</h2>
          <p>
            Describe el mando como una secuencia de <b>etapas</b> (con sus acciones: activar Y1,
            Q0.0…) y <b>transiciones</b> (con su receptividad: S1 · 1B1, t/X2/2s…).
          </p>
          <p>
            Sin PLC, el GRAFCET manda directamente sobre las señales del circuito (como en
            FluidSIM). Si añades un PLC con el programa «GRAFCET», lo ejecuta el PLC con sus
            entradas I0.x y salidas Q0.x.
          </p>
          <button
            className="btn primary"
            data-testid="grafcet-new"
            onClick={() => commit((c: Circuit) => void (c.grafcet = starterGrafcet()))}
          >
            Crear un GRAFCET
          </button>
        </div>
      </div>
    );

  const active = new Set(live?.active ?? []);
  const firable = new Set(live?.firable ?? []);

  const point = (e: { clientX: number; clientY: number }) => {
    const r = svg.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onDown = (e: RPointerEvent, id: string, kind: 'step' | 'trans') => {
    e.stopPropagation();
    if (linking) {
      if (!linkFrom) setLinkFrom(id);
      else {
        const a = linkFrom;
        const okDir = (g.steps[a] && g.transitions[id]) || (g.transitions[a] && g.steps[id]);
        if (okDir && !Object.values(g.links).some((l) => l.from === a && l.to === id))
          commit((c: Circuit) => {
            const lid = newId('l');
            c.grafcet!.links[lid] = { id: lid, from: a, to: id };
          });
        setLinkFrom(null);
      }
      return;
    }
    setSel(id);
    if (simMode) return;
    const el = kind === 'step' ? g.steps[id] : g.transitions[id];
    const p = point(e);
    drag.current = { id, kind, x0: el.x, y0: el.y, px: p.x, py: p.y };
    (e.target as Element).setPointerCapture(e.pointerId);
    beginTx();
  };
  const onMove = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = point(e);
    const x = snap(d.x0 + p.x - d.px);
    const y = snap(d.y0 + p.y - d.py);
    updateTx((c: Circuit) => {
      const el = d.kind === 'step' ? c.grafcet!.steps[d.id] : c.grafcet!.transitions[d.id];
      el.x = x;
      el.y = y;
    });
  };
  const onUp = () => {
    if (drag.current) endTx();
    drag.current = null;
  };

  const lowest = () =>
    Math.max(
      0,
      ...Object.values(g.steps).map((s) => s.y),
      ...Object.values(g.transitions).map((t) => t.y),
    );
  const addStep = () =>
    commit((c: Circuit) => {
      const n = Math.max(-1, ...Object.values(c.grafcet!.steps).map((s) => s.n)) + 1;
      let id = `X${n}`;
      if (c.grafcet!.steps[id]) id = newId('X');
      c.grafcet!.steps[id] = { id, n, x: 200, y: snap(lowest() + 60), initial: false, actions: [] };
      setSel(id);
    });
  const addTrans = () =>
    commit((c: Circuit) => {
      const id = newId('T');
      c.grafcet!.transitions[id] = { id, x: 200, y: snap(lowest() + 60), cond: '1' };
      setSel(id);
    });
  const remove = () => {
    if (!sel) return;
    commit((c: Circuit) => {
      const gr = c.grafcet!;
      delete gr.steps[sel];
      delete gr.transitions[sel];
      for (const l of Object.values(gr.links))
        if (l.from === sel || l.to === sel || l.id === sel) delete gr.links[l.id];
    });
    setSel(null);
  };

  return (
    <div className="ctrl-editor" data-testid="grafcet-editor">
      <div className="ctrl-tools">
        <button className="btn" onClick={addStep} disabled={simMode} data-testid="grafcet-add-step">
          + Etapa
        </button>
        <button className="btn" onClick={addTrans} disabled={simMode}>
          + Transición
        </button>
        <button
          className={`btn ${linking ? 'on' : ''}`}
          onClick={() => {
            setLinking(!linking);
            setLinkFrom(null);
          }}
          disabled={simMode}
          title="Haz clic en una etapa y después en una transición (o al revés) para unirlas"
        >
          {linking ? (linkFrom ? 'Elige el destino…' : 'Elige el origen…') : 'Unir'}
        </button>
        <button className="btn" onClick={remove} disabled={simMode || !sel}>
          Borrar
        </button>
        <span className="ctrl-hint">
          Arrastra para mover · «Unir»: etapa → transición → etapa · las variables: S1, 1B2, I0.0,
          X3, t/X2/2s
        </span>
      </div>
      <div className="ctrl-scroll" onPointerDown={() => !linking && setSel(null)}>
        <svg
          ref={svg}
          width={bounds.w}
          height={bounds.h}
          onPointerMove={onMove}
          onPointerUp={onUp}
          fontFamily={FONT}
        >
          <GrafcetDrawing g={g} active={active} firable={firable} sel={sel} onDown={onDown} />
        </svg>
      </div>
    </div>
  );
}

/** Dibujo del GRAFCET (sin interacción si no se pasa `onDown`): editor y exportación a PDF. */
export function GrafcetDrawing({
  g,
  active = new Set(),
  firable = new Set(),
  sel = null,
  onDown,
}: {
  g: Grafcet;
  active?: Set<string>;
  firable?: Set<string>;
  sel?: string | null;
  onDown?: (e: RPointerEvent, id: string, kind: 'step' | 'trans') => void;
}) {
  return (
    <g fontFamily={FONT}>
      <defs>
        <marker
          id="gf-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto"
        >
          <path d="M0,0 L10,5 L0,10 z" fill="#1b2230" />
        </marker>
      </defs>
      {Object.values(g.links).map((l) => {
        const path = linkPath(g, l.from, l.to);
        if (!path) return null;
        const on = active.has(l.from) || firable.has(l.from);
        return (
          <polyline
            key={l.id}
            points={path.pts.map((p) => p.join(',')).join(' ')}
            fill="none"
            stroke={on ? ACTIVE : '#1b2230'}
            strokeWidth={1.6}
            markerEnd={path.up ? 'url(#gf-arrow)' : undefined}
          />
        );
      })}
      {Object.values(g.transitions).map((t) => {
        const err = exprError(t.cond);
        const fire = firable.has(t.id);
        return (
          <g
            key={t.id}
            onPointerDown={onDown && ((e) => onDown(e, t.id, 'trans'))}
            className="gf-el"
            data-testid={`gf-trans-${t.id}`}
          >
            <rect x={t.x - 22} y={t.y - 8} width={44} height={16} fill="transparent" />
            <line
              x1={t.x - 15}
              y1={t.y}
              x2={t.x + 15}
              y2={t.y}
              stroke={fire ? ACTIVE : '#1b2230'}
              strokeWidth={4}
            />
            {sel === t.id && (
              <rect
                x={t.x - 20}
                y={t.y - 7}
                width={40}
                height={14}
                fill="none"
                stroke="#2563eb"
                strokeDasharray="3 2"
              />
            )}
            <text x={t.x + 22} y={t.y + 4} fontSize={12} fill={err ? '#dc2626' : '#1b2230'}>
              {t.cond || '(vacía)'}
            </text>
          </g>
        );
      })}
      {Object.values(g.steps).map((s) => {
        const on = active.has(s.id);
        return (
          <g
            key={s.id}
            onPointerDown={onDown && ((e) => onDown(e, s.id, 'step'))}
            className="gf-el"
            data-testid={`gf-step-${s.n}`}
            data-active={on ? 'on' : 'off'}
          >
            <rect
              x={s.x - S / 2}
              y={s.y - S / 2}
              width={S}
              height={S}
              fill={on ? '#dcfce7' : '#fff'}
              stroke={sel === s.id ? '#2563eb' : '#1b2230'}
              strokeWidth={sel === s.id ? 2.2 : 1.6}
            />
            {s.initial && (
              <rect
                x={s.x - S / 2 + 4}
                y={s.y - S / 2 + 4}
                width={S - 8}
                height={S - 8}
                fill="none"
                stroke="#1b2230"
                strokeWidth={1.2}
              />
            )}
            <text x={s.x} y={s.y + 5} fontSize={14} fontWeight={600} textAnchor="middle">
              {s.n}
            </text>
            {on && <circle cx={s.x + S / 2 - 7} cy={s.y + S / 2 - 7} r={4} fill={ACTIVE} />}
            {s.actions.map((a, i) => {
              const y = s.y - S / 2 + i * 22;
              const w = Math.max(60, actionText(a).length * 7 + 14);
              return (
                <g key={i}>
                  {i === 0 && (
                    <line
                      x1={s.x + S / 2}
                      y1={s.y}
                      x2={s.x + S / 2 + 16}
                      y2={s.y}
                      stroke="#1b2230"
                      strokeWidth={1.4}
                    />
                  )}
                  <rect
                    x={s.x + S / 2 + 16}
                    y={y + (s.actions.length === 1 ? 9 : 0)}
                    width={w}
                    height={22}
                    fill={on ? '#fef9c3' : '#fff'}
                    stroke="#1b2230"
                    strokeWidth={1.2}
                  />
                  <text
                    x={s.x + S / 2 + 23}
                    y={y + (s.actions.length === 1 ? 9 : 0) + 15}
                    fontSize={12}
                  >
                    {actionText(a)}
                  </text>
                </g>
              );
            })}
          </g>
        );
      })}
    </g>
  );
}

/** Tamaño del dibujo de un GRAFCET. */
export function grafcetBounds(g: Grafcet) {
  const xs = [300];
  const ys = [200];
  for (const s of Object.values(g.steps)) {
    xs.push(s.x + 260);
    ys.push(s.y + 60);
  }
  for (const t of Object.values(g.transitions)) {
    xs.push(t.x + 260);
    ys.push(t.y + 40);
  }
  return { w: Math.max(...xs), h: Math.max(...ys) };
}

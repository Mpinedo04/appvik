/**
 * Editor de esquema de contactos (Ladder). Cada segmento guarda su condición como expresión
 * («(I0.0 + M0.0) · !I0.1») y aquí se dibuja como contactos en serie (Y) y en paralelo (O),
 * con la bobina a la derecha. En simulación los contactos que conducen se ven en verde.
 */
import type { ReactElement } from 'react';
import { exprText, parseExpr, type Expr } from '../../core/control/expr';
import type { Circuit, Ladder, LadderRung } from '../../core/model/types';
import { newId } from '../../core/model/types';
import { useProject } from '../../store/project';
import { useSim } from '../../store/sim';
import { useView } from '../../store/view';

const CW = 70;
const CH = 46;
const INK = '#1b2230';
const ON = '#16a34a';
const FONT = 'Inter, system-ui, sans-serif';

type Vars = Record<string, number> | undefined;
interface Box {
  w: number;
  h: number;
  draw(x: number, y: number, key: string): ReactElement[];
}

/** ¿Conduce este contacto? (null si no se sabe: fuera de simulación). */
function conducts(e: Expr, vars: Vars): boolean | null {
  if (!vars) return null;
  if (e.k === 'var') return !!vars[e.name];
  if (e.k === 'not' && e.e.k === 'var') return !vars[e.e.name];
  if (e.k === 'const') return e.v;
  return null;
}

function leaf(e: Expr, vars: Vars): Box {
  const nc = e.k === 'not' && e.e.k === 'var';
  const name =
    e.k === 'var'
      ? e.name
      : nc
        ? (e as { e: { name: string } }).e.name
        : e.k === 'edge'
          ? e.name
          : exprText(e);
  const live = conducts(e, vars);
  const c = live ? ON : INK;
  return {
    w: CW,
    h: CH,
    draw: (x, y, key) => {
      const cy = y + CH / 2;
      if (e.k === 'const')
        return [
          <line
            key={key}
            x1={x}
            y1={cy}
            x2={x + CW}
            y2={cy}
            stroke={e.v ? c : '#cbd5e1'}
            strokeWidth={1.6}
            strokeDasharray={e.v ? undefined : '4 3'}
          />,
        ];
      return [
        <g key={key}>
          <line x1={x} y1={cy} x2={x + 24} y2={cy} stroke={c} strokeWidth={1.6} />
          <line x1={x + 46} y1={cy} x2={x + CW} y2={cy} stroke={c} strokeWidth={1.6} />
          <line x1={x + 24} y1={cy - 10} x2={x + 24} y2={cy + 10} stroke={c} strokeWidth={2} />
          <line x1={x + 46} y1={cy - 10} x2={x + 46} y2={cy + 10} stroke={c} strokeWidth={2} />
          {live && <rect x={x + 25} y={cy - 9} width={20} height={18} fill="#dcfce7" />}
          {nc && (
            <line x1={x + 27} y1={cy + 9} x2={x + 43} y2={cy - 9} stroke={c} strokeWidth={1.4} />
          )}
          {e.k === 'edge' && (
            <text x={x + 35} y={cy + 4} fontSize={11} fontWeight={700} textAnchor="middle" fill={c}>
              {e.up ? 'P' : 'N'}
            </text>
          )}
          <text
            x={x + 35}
            y={cy - 14}
            fontSize={11}
            fontWeight={600}
            textAnchor="middle"
            fill={INK}
          >
            {name.length > 11 ? `${name.slice(0, 10)}…` : name}
          </text>
        </g>,
      ];
    },
  };
}

function layout(e: Expr, vars: Vars): Box {
  if (e.k === 'and') {
    const kids = e.a.map((x) => layout(x, vars));
    return {
      w: kids.reduce((s, k) => s + k.w, 0),
      h: Math.max(...kids.map((k) => k.h)),
      draw: (x, y, key) => {
        let cx = x;
        return kids.flatMap((k, i) => {
          const out = k.draw(cx, y, `${key}.${i}`);
          cx += k.w;
          return out;
        });
      },
    };
  }
  if (e.k === 'or') {
    const kids = e.a.map((x) => layout(x, vars));
    const w = Math.max(...kids.map((k) => k.w)) + 20;
    return {
      w,
      h: kids.reduce((s, k) => s + k.h, 0),
      draw: (x, y, key) => {
        const out: ReactElement[] = [];
        let cy = y;
        const centers: number[] = [];
        kids.forEach((k, i) => {
          out.push(...k.draw(x + 10, cy, `${key}.${i}`));
          const mid = cy + CH / 2;
          centers.push(mid);
          out.push(
            <line
              key={`${key}.l${i}`}
              x1={x}
              y1={mid}
              x2={x + 10}
              y2={mid}
              stroke={INK}
              strokeWidth={1.6}
            />,
          );
          out.push(
            <line
              key={`${key}.r${i}`}
              x1={x + 10 + k.w}
              y1={mid}
              x2={x + w}
              y2={mid}
              stroke={INK}
              strokeWidth={1.6}
            />,
          );
          cy += k.h;
        });
        out.push(
          <line
            key={`${key}.vl`}
            x1={x}
            y1={centers[0]}
            x2={x}
            y2={centers[centers.length - 1]}
            stroke={INK}
            strokeWidth={1.6}
          />,
        );
        out.push(
          <line
            key={`${key}.vr`}
            x1={x + w}
            y1={centers[0]}
            x2={x + w}
            y2={centers[centers.length - 1]}
            stroke={INK}
            strokeWidth={1.6}
          />,
        );
        return out;
      },
    };
  }
  return leaf(e, vars);
}

const COIL_LABEL: Record<LadderRung['coil']['kind'], string> = {
  coil: '',
  set: 'S',
  reset: 'R',
  TON: 'TON',
  TOF: 'TOF',
  CTU: 'CTU',
};

export function Rung({
  r,
  i,
  width,
  vars,
  result,
  selected,
}: {
  r: LadderRung;
  i: number;
  width: number;
  vars: Vars;
  result: boolean | undefined;
  selected: boolean;
}) {
  let box: Box;
  let error: string | null = null;
  try {
    box = layout(parseExpr(r.cond || ''), vars);
  } catch (e) {
    error = (e as Error).message;
    box = { w: CW, h: CH, draw: () => [] };
  }
  const h = box.h + 26;
  const cy = 26 + CH / 2;
  const xCoil = Math.max(box.w + 60, width - 130);
  const timer = ['TON', 'TOF', 'CTU'].includes(r.coil.kind);
  const live = result ? ON : INK;
  return (
    <div
      className={`rung ${selected ? 'sel' : ''}`}
      onPointerDown={(e) => {
        e.stopPropagation();
        useView.getState().setCtrlSel(r.id);
      }}
      data-testid={`rung-${i}`}
    >
      <svg width={width} height={h} fontFamily={FONT}>
        <text x={8} y={14} fontSize={11} fill="#64748b">
          {`Segmento ${i + 1}${r.comment ? ` · ${r.comment}` : ''}`}
        </text>
        <line x1={14} y1={20} x2={14} y2={h} stroke={INK} strokeWidth={3} />
        <line x1={width - 14} y1={20} x2={width - 14} y2={h} stroke={INK} strokeWidth={3} />
        <line x1={14} y1={cy} x2={30} y2={cy} stroke={INK} strokeWidth={1.6} />
        {box.draw(30, 26, `r${i}`)}
        {error && (
          <text x={34} y={cy + 4} fontSize={12} fill="#dc2626">
            {error}
          </text>
        )}
        <line x1={30 + box.w} y1={cy} x2={xCoil} y2={cy} stroke={live} strokeWidth={1.6} />
        {timer ? (
          <g>
            <rect
              x={xCoil}
              y={cy - 18}
              width={56}
              height={36}
              fill={result ? '#dcfce7' : '#fff'}
              stroke={live}
              strokeWidth={1.6}
            />
            <text x={xCoil + 28} y={cy - 2} fontSize={11} fontWeight={700} textAnchor="middle">
              {COIL_LABEL[r.coil.kind]}
            </text>
            <text x={xCoil + 28} y={cy + 12} fontSize={10} textAnchor="middle">
              {r.coil.kind === 'CTU' ? `PV ${r.coil.preset ?? 1}` : `${r.coil.preset ?? 1} s`}
            </text>
          </g>
        ) : (
          <g>
            <path
              d={`M ${xCoil + 16} ${cy - 13} A 16 16 0 0 0 ${xCoil + 16} ${cy + 13}`}
              fill="none"
              stroke={live}
              strokeWidth={1.8}
            />
            <path
              d={`M ${xCoil + 40} ${cy - 13} A 16 16 0 0 1 ${xCoil + 40} ${cy + 13}`}
              fill="none"
              stroke={live}
              strokeWidth={1.8}
            />
            {result && <circle cx={xCoil + 28} cy={cy} r={8} fill="#dcfce7" />}
            <text x={xCoil + 28} y={cy + 4} fontSize={11} fontWeight={700} textAnchor="middle">
              {COIL_LABEL[r.coil.kind]}
            </text>
          </g>
        )}
        <line x1={xCoil + 56} y1={cy} x2={width - 14} y2={cy} stroke={INK} strokeWidth={1.6} />
        <text x={xCoil + 28} y={cy - 22} fontSize={11} fontWeight={600} textAnchor="middle">
          {r.coil.target}
        </text>
      </svg>
    </div>
  );
}

export const starterLadder = (): Ladder => ({
  rungs: [
    {
      id: 'R1',
      cond: '(I0.0 + Q0.0) · !I0.1',
      coil: { kind: 'coil', target: 'Q0.0' },
      comment: 'Marcha / paro con autorretención',
    },
  ],
});

export function LadderEditor() {
  const circuit = useProject((s) => s.circuit);
  const sel = useView((s) => s.ctrlSel);
  const live = useSim((s) => s.snapshot?.control.ladder);
  const simMode = useSim((s) => s.status !== 'stopped');
  const commit = useProject.getState().commit;
  const ladder = circuit.ladder;
  const width = 760;

  if (!ladder?.rungs.length)
    return (
      <div className="ctrl-editor empty">
        <div className="ctrl-empty">
          <h2>Esquema de contactos</h2>
          <p>
            Cada segmento tiene una condición (contactos en serie = Y, en paralelo = O) y una
            bobina: salida, activar/desactivar, temporizador TON/TOF o contador CTU.
          </p>
          <p>
            Lo ejecuta un PLC con el programa «Esquema de contactos» (entradas I0.x, salidas Q0.x,
            marcas M…), o directamente sobre las señales del circuito si no hay PLC.
          </p>
          <button
            className="btn primary"
            data-testid="ladder-new"
            onClick={() => commit((c: Circuit) => void (c.ladder = starterLadder()))}
          >
            Crear un esquema de contactos
          </button>
        </div>
      </div>
    );

  const add = () =>
    commit((c: Circuit) => {
      const id = newId('R');
      c.ladder!.rungs.push({ id, cond: 'I0.0', coil: { kind: 'coil', target: 'Q0.0' } });
      useView.getState().setCtrlSel(id);
    });

  return (
    <div className="ctrl-editor" data-testid="ladder-editor">
      <div className="ctrl-tools">
        <button className="btn" onClick={add} disabled={simMode}>
          + Segmento
        </button>
        <span className="ctrl-hint">
          Selecciona un segmento para editar su condición y su bobina en el panel derecho.
        </span>
      </div>
      <div className="ctrl-scroll" onPointerDown={() => useView.getState().setCtrlSel(null)}>
        {ladder.rungs.map((r, i) => (
          <Rung
            key={r.id}
            r={r}
            i={i}
            width={width}
            vars={live?.vars}
            result={live?.rungs[r.id]}
            selected={sel === r.id}
          />
        ))}
      </div>
    </div>
  );
}

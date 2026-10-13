import { num, str } from '../../../core/registry';
import { INK, PAPER, SW, pressureColor, type SymbolProps } from '../../symbols';
import { parseMarks } from '../cylinder-core';

export const CYL_BODY = { x0: -60, x1: 40, y0: -15, y1: 15 };
const PISTON_MIN = -56;
const PISTON_TRAVEL = 86;
const ROD_LENGTH = 106;
const ACCENT = '#2563eb';

/** Regla con las marcas de final de carrera sobre la trayectoria de la punta del vástago. */
export function MarksRuler({
  marks,
  stroke,
  active,
  x0,
  travel,
  y,
}: {
  marks: string;
  stroke: number;
  active: string[];
  x0: number;
  travel: number;
  y: number;
}) {
  const list = parseMarks(marks);
  if (!list.length) return null;
  return (
    <g fontFamily="Inter, system-ui, sans-serif" fontSize={7}>
      <line x1={x0} y1={y} x2={x0 + travel} y2={y} stroke="#94a3b8" strokeWidth={0.8} />
      {list.map((m) => {
        const x = x0 + travel * Math.max(0, Math.min(1, m.mm / Math.max(1, stroke)));
        const on = active.includes(m.label);
        return (
          <g key={m.label}>
            <line
              x1={x}
              y1={y - 4}
              x2={x}
              y2={y + 4}
              stroke={on ? ACCENT : INK}
              strokeWidth={on ? 2 : 1.2}
            />
            <text
              x={x}
              y={y - 6}
              textAnchor="middle"
              fill={on ? ACCENT : '#334155'}
              fontWeight={on ? 700 : 500}
            >
              {m.label}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/** Amortiguación regulable (ISO): rectángulo junto al émbolo + flecha de ajuste. */
function Cushion({ x, active }: { x: number; active: boolean }) {
  return (
    <g stroke={active ? ACCENT : INK} strokeWidth={1}>
      <rect x={x - 3} y={-6} width={6} height={12} fill={PAPER} />
      <line x1={x - 6} y1={10} x2={x + 6} y2={-10} />
      <polygon points={`${x + 6},-10 ${x + 2},-8 ${x + 5},-5`} fill={active ? ACCENT : INK} />
    </g>
  );
}

/**
 * ISO 1219: cilindro con vástago simple (doble efecto, o simple efecto con muelle).
 * En simulación el émbolo se mueve y las cámaras se tiñen según su presión.
 */
export function CylinderSymbol({
  params,
  state,
  maxBar,
  single,
}: SymbolProps & { single?: boolean }) {
  const pos: number = state?.pos ?? Number(params.startPos ?? 0) / 100;
  const c = PISTON_MIN + PISTON_TRAVEL * pos;
  const { x0, x1, y0, y1 } = CYL_BODY;
  const cushion = !single && str(params, 'cushion') === 'adjustable';
  // Muelle del simple efecto: entre el émbolo y la tapa delantera.
  const springPts = () => {
    const a = c + 3;
    const b = x1 - 2;
    const n = 8;
    return Array.from(
      { length: n + 1 },
      (_, i) => `${a + ((b - a) * i) / n},${i % 2 ? -9 : 9}`,
    ).join(' ');
  };
  return (
    <g>
      <line x1={-50} y1={y1} x2={-50} y2={30} stroke={INK} strokeWidth={SW} />
      {!single && <line x1={30} y1={y1} x2={30} y2={30} stroke={INK} strokeWidth={SW} />}
      <rect
        x={x0}
        y={y0}
        width={x1 - x0}
        height={y1 - y0}
        fill={PAPER}
        stroke={INK}
        strokeWidth={SW}
      />
      {state && (
        <>
          <rect
            x={x0 + 1}
            y={y0 + 1}
            width={Math.max(0, c - 2 - x0 - 1)}
            height={y1 - y0 - 2}
            fill={pressureColor(state.pCap, maxBar)}
            opacity={0.35}
          />
          {!single && (
            <rect
              x={c + 2}
              y={y0 + 1}
              width={Math.max(0, x1 - 1 - c - 2)}
              height={y1 - y0 - 2}
              fill={pressureColor(state.pRod, maxBar)}
              opacity={0.35}
            />
          )}
        </>
      )}
      {single && (
        <>
          <polyline points={springPts()} fill="none" stroke={INK} strokeWidth={1} />
          {/* Respiradero de la cámara del muelle */}
          <line x1={30} y1={y0} x2={30} y2={y0 - 6} stroke={INK} strokeWidth={1} />
          <polygon
            points={`30,${y0 - 6} 26,${y0 - 12} 34,${y0 - 12}`}
            fill={PAPER}
            stroke={INK}
            strokeWidth={1}
          />
        </>
      )}
      <rect x={c} y={-3} width={ROD_LENGTH} height={6} fill={PAPER} stroke={INK} strokeWidth={SW} />
      <rect x={c - 2} y={y0} width={4} height={y1 - y0} fill={INK} />
      {cushion && (
        <>
          <Cushion x={x0 + 6} active={!!state?.cushionCap} />
          <Cushion x={x1 - 6} active={!!state?.cushionRod} />
        </>
      )}
      <MarksRuler
        marks={String(params.marks ?? '')}
        stroke={num(params, 'stroke')}
        active={state?.activeMarks ?? []}
        x0={PISTON_MIN + ROD_LENGTH}
        travel={PISTON_TRAVEL}
        y={y0 - 8}
      />
    </g>
  );
}

export function CylinderDoubleSymbol(props: SymbolProps) {
  return <CylinderSymbol {...props} />;
}

export function CylinderSingleSymbol(props: SymbolProps) {
  return <CylinderSymbol {...props} single />;
}

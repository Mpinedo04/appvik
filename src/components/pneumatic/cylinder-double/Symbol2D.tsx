import { INK, PAPER, SW, pressureColor, type SymbolProps } from '../../symbols';

export const CYL_BODY = { x0: -60, x1: 40, y0: -15, y1: 15 };
const PISTON_MIN = -56;
const PISTON_TRAVEL = 86;
const ROD_LENGTH = 106;

/** ISO 1219: cilindro de doble efecto con vástago simple. En simulación el émbolo se mueve. */
export function CylinderDoubleSymbol({ state, maxBar }: SymbolProps) {
  const pos: number = state?.pos ?? 0;
  const c = PISTON_MIN + PISTON_TRAVEL * pos;
  const { x0, x1, y0, y1 } = CYL_BODY;
  return (
    <g>
      {/* Conexiones */}
      <line x1={-50} y1={y1} x2={-50} y2={30} stroke={INK} strokeWidth={SW} />
      <line x1={30} y1={y1} x2={30} y2={30} stroke={INK} strokeWidth={SW} />
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
          <rect
            x={c + 2}
            y={y0 + 1}
            width={Math.max(0, x1 - 1 - c - 2)}
            height={y1 - y0 - 2}
            fill={pressureColor(state.pRod, maxBar)}
            opacity={0.35}
          />
        </>
      )}
      {/* Vástago */}
      <rect x={c} y={-3} width={ROD_LENGTH} height={6} fill={PAPER} stroke={INK} strokeWidth={SW} />
      {/* Émbolo */}
      <rect x={c - 2} y={y0} width={4} height={y1 - y0} fill={INK} />
    </g>
  );
}

import { INK, PAPER, SW, type SymbolProps } from '../../symbols';

/** ISO 1219: silenciador (rectángulo bajo el escape). */
export function SilencerSymbol({ state }: SymbolProps) {
  const blowing = state && state.flowLmin > 5;
  return (
    <g>
      <line x1={0} y1={-20} x2={0} y2={-6} stroke={INK} strokeWidth={SW} />
      <rect x={-7} y={-6} width={14} height={14} fill={PAPER} stroke={INK} strokeWidth={SW} />
      <line x1={-3.5} y1={-6} x2={-3.5} y2={8} stroke={INK} strokeWidth={1} />
      <line x1={0} y1={-6} x2={0} y2={8} stroke={INK} strokeWidth={1} />
      <line x1={3.5} y1={-6} x2={3.5} y2={8} stroke={INK} strokeWidth={1} />
      {blowing && (
        <g stroke="#60a5fa" strokeWidth={1.2} strokeLinecap="round">
          <line x1={-6} y1={14} x2={-9} y2={20} />
          <line x1={0} y1={14} x2={0} y2={21} />
          <line x1={6} y1={14} x2={9} y2={20} />
        </g>
      )}
    </g>
  );
}

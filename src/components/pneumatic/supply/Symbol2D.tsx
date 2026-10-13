import { num } from '../../../core/registry';
import { INK, PAPER, SW, type SymbolProps } from '../../symbols';

/** ISO 1219: fuente de presión neumática (círculo con triángulo hueco). */
export function SupplySymbol({ params }: SymbolProps) {
  return (
    <g>
      <line x1={0} y1={-20} x2={0} y2={-12} stroke={INK} strokeWidth={SW} />
      <circle cx={0} cy={0} r={12} fill={PAPER} stroke={INK} strokeWidth={SW} />
      <polygon
        points="0,-12 -5,-3.5 5,-3.5"
        fill={PAPER}
        stroke={INK}
        strokeWidth={SW}
        strokeLinejoin="round"
      />
      <text x={16} y={12} fontSize={9} fill="#475569" fontFamily="Inter, system-ui, sans-serif">
        {num(params, 'pressure').toFixed(1)} bar
      </text>
    </g>
  );
}

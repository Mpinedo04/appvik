import { num } from '../../../core/registry';
import { INK, PAPER, SW, pressureColor, type SymbolProps } from '../../symbols';

/** ISO 1219: manómetro (círculo con aguja). En simulación la aguja indica la presión. */
export function GaugeSymbol({ params, state, maxBar, medium }: SymbolProps) {
  const range = num(params, 'range');
  const bar: number = state?.bar ?? 0;
  // Escala de -135° (0 bar) a +135° (fondo de escala).
  const angle = state ? -135 + 270 * Math.max(0, Math.min(1.05, bar / range)) : 45;
  const rad = ((angle - 90) * Math.PI) / 180;
  const nx = Math.cos(rad) * 13;
  const ny = Math.sin(rad) * 13;
  return (
    <g>
      <line x1={0} y1={18} x2={0} y2={30} stroke={INK} strokeWidth={SW} />
      <circle cx={0} cy={0} r={18} fill={PAPER} stroke={INK} strokeWidth={SW} />
      {state &&
        Array.from({ length: 11 }, (_, i) => {
          const a = ((-135 + 27 * i - 90) * Math.PI) / 180;
          return (
            <line
              key={i}
              x1={Math.cos(a) * 15}
              y1={Math.sin(a) * 15}
              x2={Math.cos(a) * 17}
              y2={Math.sin(a) * 17}
              stroke={INK}
              strokeWidth={0.8}
            />
          );
        })}
      <line
        x1={-nx * 0.3}
        y1={-ny * 0.3}
        x2={nx}
        y2={ny}
        stroke={state ? pressureColor(bar, maxBar, medium) : INK}
        strokeWidth={SW}
      />
      <polygon
        points={`${nx},${ny} ${nx - Math.cos(rad) * 5 - Math.sin(rad) * 2.5},${ny - Math.sin(rad) * 5 + Math.cos(rad) * 2.5} ${nx - Math.cos(rad) * 5 + Math.sin(rad) * 2.5},${ny - Math.sin(rad) * 5 - Math.cos(rad) * 2.5}`}
        fill={state ? pressureColor(bar, maxBar, medium) : INK}
      />
      <circle cx={0} cy={0} r={1.6} fill={INK} />
      {state && (
        <text
          x={22}
          y={-8}
          fontSize={10}
          fontWeight={600}
          fill={INK}
          fontFamily="Inter, system-ui, sans-serif"
        >
          {bar.toFixed(2)} bar
        </text>
      )}
    </g>
  );
}

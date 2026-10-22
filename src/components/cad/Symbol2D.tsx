import type { SymbolProps } from '../symbols';
import { cadPartModel } from './model';

/** En el esquema, la pieza CAD es su huella vista desde arriba (no es un símbolo ISO). */
export function CadPartSymbol({ params }: SymbolProps) {
  const b = cadPartModel.bbox(params);
  const w = b.x1 - b.x0;
  const h = b.y1 - b.y0;
  const name = String(params.file || 'Pieza CAD');
  const short = name.length > 28 ? `${name.slice(0, 26)}…` : name;
  const fs = Math.max(5, Math.min(9, w / 12));
  return (
    <g>
      <rect
        x={b.x0}
        y={b.y0}
        width={w}
        height={h}
        rx={3}
        fill="#eef2f7"
        fillOpacity={0.55}
        stroke="#64748b"
        strokeWidth={1}
        strokeDasharray="6 3"
      />
      {/* Cubo en perspectiva */}
      <g
        transform={`translate(${b.x0 + 4} ${b.y0 + 4}) scale(${Math.min(1, w / 60, h / 40)})`}
        fill="none"
        stroke="#64748b"
        strokeWidth={1}
      >
        <path d="M2 6l8-4 8 4v10l-8 4-8-4z M2 6l8 4 8-4 M10 10v10" />
      </g>
      <text
        x={(b.x0 + b.x1) / 2}
        y={(b.y0 + b.y1) / 2}
        fontSize={fs}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="#475569"
      >
        {short}
      </text>
    </g>
  );
}

import { num, str } from '../../core/registry';
import { INK, PAPER, type SymbolProps } from '../symbols';

const FONT = 'Inter, system-ui, sans-serif';

export function TextNoteSymbol({ params }: SymbolProps) {
  const raw = str(params, 'text') || 'Texto';
  const lines = raw.split(/\\n|\n/);
  const fs = Math.max(8, num(params, 'fontSize') || 14);
  const color = str(params, 'color') || '#0f172a';
  const bold = Boolean(params.bold);
  const border = Boolean(params.border);
  const maxChars = Math.max(4, ...lines.map((l) => l.length));
  const w = Math.max(50, Math.round(maxChars * fs * 0.62) + 18);
  const lineH = fs * 1.3;
  const h = Math.max(24, Math.round(lines.length * lineH) + 14);
  const startY = -((lines.length - 1) * lineH) / 2 + fs * 0.35;

  return (
    <g>
      {border && (
        <rect
          x={-w / 2}
          y={-h / 2}
          width={w}
          height={h}
          rx={5}
          fill="#ffffff"
          fillOpacity={0.92}
          stroke={color}
          strokeWidth={1.2}
        />
      )}
      {lines.map((line, i) => (
        <text
          key={i}
          x={0}
          y={startY + i * lineH}
          textAnchor="middle"
          fontSize={fs}
          fontWeight={bold ? 700 : 400}
          fill={color}
          fontFamily={FONT}
        >
          {line}
        </text>
      ))}
    </g>
  );
}

export function TitleBlockSymbol({ params }: SymbolProps) {
  const w = Math.max(160, num(params, 'width') || 260);
  const title = str(params, 'title') || 'Esquema técnico';
  const author = str(params, 'author') || '—';
  const date = str(params, 'date') || '—';
  const note = str(params, 'note') || 'ISO 1219';
  const x0 = -w / 2;
  const split = x0 + w * 0.64;

  return (
    <g fontFamily={FONT}>
      <rect x={x0} y={-32} width={w} height={64} fill={PAPER} stroke={INK} strokeWidth={1.5} />
      <line x1={x0} y1={-4} x2={x0 + w} y2={-4} stroke={INK} strokeWidth={1} />
      <line x1={split} y1={-4} x2={split} y2={32} stroke={INK} strokeWidth={1} />
      <line x1={x0} y1={14} x2={x0 + w} y2={14} stroke={INK} strokeWidth={0.8} />

      <text x={x0 + 8} y={-14} fontSize={11.5} fontWeight={700} fill={INK}>
        {title}
      </text>
      <text x={x0 + 8} y={8} fontSize={8.5} fill="#475569">
        Autor: <tspan fill={INK} fontWeight={600}>{author}</tspan>
      </text>
      <text x={split + 6} y={8} fontSize={8.5} fill="#475569">
        Fecha: <tspan fill={INK}>{date}</tspan>
      </text>
      <text x={x0 + 8} y={26} fontSize={8.5} fill="#475569">
        {note}
      </text>
      <text x={split + 6} y={26} fontSize={8} fontWeight={700} fill="#2563eb">
        FluidLab 3D
      </text>
    </g>
  );
}

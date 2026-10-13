/** Símbolos ISO 1219 de los actuadores sin vástago, de giro, pinza y motor. */
import { num } from '../../core/registry';
import { INK, PAPER, SW, pressureColor, type SymbolProps } from '../symbols';
import { MarksRuler } from './cylinder-double/Symbol2D';

const ACCENT = '#2563eb';

export function RodlessSymbol({ params, state, maxBar }: SymbolProps) {
  const pos: number = state?.pos ?? Number(params.startPos ?? 0) / 100;
  const c = -66 + 132 * pos;
  return (
    <g>
      <line x1={-80} y1={10} x2={-80} y2={20} stroke={INK} strokeWidth={SW} />
      <line x1={80} y1={10} x2={80} y2={20} stroke={INK} strokeWidth={SW} />
      <rect x={-85} y={-10} width={170} height={20} fill={PAPER} stroke={INK} strokeWidth={SW} />
      {state && (
        <>
          <rect
            x={-84}
            y={-9}
            width={Math.max(0, c - 2 + 84)}
            height={18}
            fill={pressureColor(state.pCap, maxBar)}
            opacity={0.35}
          />
          <rect
            x={c + 2}
            y={-9}
            width={Math.max(0, 84 - c - 2)}
            height={18}
            fill={pressureColor(state.pRod, maxBar)}
            opacity={0.35}
          />
        </>
      )}
      <rect x={c - 2} y={-10} width={4} height={20} fill={INK} />
      {/* Carro exterior unido al émbolo */}
      <rect x={c - 12} y={-18} width={24} height={8} fill={PAPER} stroke={INK} strokeWidth={SW} />
      <MarksRuler
        marks={String(params.marks ?? '')}
        stroke={num(params, 'stroke')}
        active={state?.activeMarks ?? []}
        x0={-66}
        travel={132}
        y={-24}
      />
    </g>
  );
}

export function RotarySymbol({ params, state, maxBar }: SymbolProps) {
  const pos: number = state?.pos ?? 0;
  const range = num(params, 'angle');
  const a = ((-90 - range / 2 + range * pos) * Math.PI) / 180;
  const arc = (r: number) => {
    const s = ((-90 - range / 2) * Math.PI) / 180;
    const e = ((-90 + range / 2) * Math.PI) / 180;
    const large = range > 180 ? 1 : 0;
    return `M ${Math.cos(s) * r} ${Math.sin(s) * r} A ${r} ${r} 0 ${large} 1 ${Math.cos(e) * r} ${Math.sin(e) * r}`;
  };
  return (
    <g>
      <line x1={-20} y1={14} x2={-20} y2={30} stroke={INK} strokeWidth={SW} />
      <line x1={20} y1={14} x2={20} y2={30} stroke={INK} strokeWidth={SW} />
      <path
        d="M -24 14 A 24 24 0 0 1 24 14 Z"
        fill={state ? pressureColor(Math.max(state.pCap, state.pRod), maxBar) : PAPER}
        fillOpacity={state ? 0.25 : 1}
        stroke={INK}
        strokeWidth={SW}
      />
      <path d={arc(17)} fill="none" stroke={INK} strokeWidth={1} />
      <line
        x1={0}
        y1={6}
        x2={Math.cos(a) * 18}
        y2={6 + Math.sin(a) * 18}
        stroke={state ? ACCENT : INK}
        strokeWidth={2.2}
        strokeLinecap="round"
      />
      <circle cx={0} cy={6} r={2.5} fill={INK} />
    </g>
  );
}

export function GripperSymbol({ state, maxBar }: SymbolProps) {
  const pos: number = state?.pos ?? 0;
  const gap = 4 + 10 * (1 - pos);
  return (
    <g>
      <line x1={-10} y1={15} x2={-10} y2={30} stroke={INK} strokeWidth={SW} />
      <line x1={10} y1={15} x2={10} y2={30} stroke={INK} strokeWidth={SW} />
      <rect
        x={-22}
        y={-10}
        width={44}
        height={25}
        fill={state ? pressureColor(state.pCap, maxBar) : PAPER}
        fillOpacity={state ? 0.25 : 1}
        stroke={INK}
        strokeWidth={SW}
      />
      {[-1, 1].map((sgn) => (
        <g key={sgn}>
          <rect
            x={sgn > 0 ? gap : -gap - 6}
            y={-38}
            width={6}
            height={28}
            fill={PAPER}
            stroke={INK}
            strokeWidth={SW}
          />
          <line
            x1={sgn * (gap + 3)}
            y1={-10}
            x2={sgn * (gap + 3)}
            y2={-4}
            stroke={INK}
            strokeWidth={1}
          />
        </g>
      ))}
    </g>
  );
}

export function MotorSymbol({ state }: SymbolProps) {
  const ang: number = state?.angle ?? 0;
  const spinning = state && Math.abs(state.rpm) > 1;
  return (
    <g>
      <line x1={-10} y1={16} x2={-10} y2={30} stroke={INK} strokeWidth={SW} />
      <line x1={10} y1={16} x2={10} y2={30} stroke={INK} strokeWidth={SW} />
      <circle cx={0} cy={0} r={18} fill={PAPER} stroke={INK} strokeWidth={SW} />
      {/* Dos triángulos huecos: motor neumático reversible */}
      <polygon points="0,-18 -5,-10 5,-10" fill={PAPER} stroke={INK} strokeWidth={1.2} />
      <polygon points="0,18 -5,10 5,10" fill={PAPER} stroke={INK} strokeWidth={1.2} />
      <line x1={18} y1={0} x2={26} y2={0} stroke={INK} strokeWidth={2.4} />
      <g transform={`rotate(${(ang * 180) / Math.PI})`}>
        <line x1={-8} y1={0} x2={8} y2={0} stroke={spinning ? ACCENT : INK} strokeWidth={1.4} />
        <line x1={0} y1={-8} x2={0} y2={8} stroke={spinning ? ACCENT : INK} strokeWidth={1.4} />
      </g>
    </g>
  );
}

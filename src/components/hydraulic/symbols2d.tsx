/** Símbolos hidráulicos ISO 1219 (los triángulos de energía van rellenos: fluido líquido). */
import { num } from '../../core/registry';
import { CylinderSymbol } from '../pneumatic/cylinder-double/Symbol2D';
import { INK, oilColor, PAPER, SW, type SymbolProps } from '../symbols';

const ACCENT = '#2563eb';
const FONT = 'Inter, system-ui, sans-serif';

function Label({
  x,
  y,
  text,
  anchor = 'start',
}: {
  x: number;
  y: number;
  text: string;
  anchor?: 'start' | 'middle';
}) {
  return (
    <text
      x={x}
      y={y}
      fontSize={8}
      fontWeight={600}
      fill={INK}
      textAnchor={anchor}
      fontFamily={FONT}
    >
      {text}
    </text>
  );
}

/** Bomba (o motor si `inward`): círculo con triángulo relleno. */
function PumpCircle({
  cx,
  cy,
  r,
  inward,
  color,
}: {
  cx: number;
  cy: number;
  r: number;
  inward?: boolean;
  color: string;
}) {
  const t = inward
    ? `${cx},${cy - r + 1} ${cx - 4.5},${cy - r + 8} ${cx + 4.5},${cy - r + 8}`
    : `${cx},${cy - r - 0.5} ${cx - 4.5},${cy - r + 7} ${cx + 4.5},${cy - r + 7}`;
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={PAPER} stroke={INK} strokeWidth={SW} />
      <polygon
        points={t}
        fill={color}
        transform={inward ? `rotate(180 ${cx} ${cy - r + 4.5})` : undefined}
      />
    </g>
  );
}

/** Depósito: rectángulo abierto por arriba con la tubería entrando. */
function TankGlyph({ x, y }: { x: number; y: number }) {
  return (
    <path
      d={`M ${x - 10} ${y - 5} L ${x - 10} ${y + 5} L ${x + 10} ${y + 5} L ${x + 10} ${y - 5}`}
      fill="none"
      stroke={INK}
      strokeWidth={SW}
    />
  );
}

/** Muelle en zigzag horizontal. */
const springPts = (x0: number, x1: number, y: number, a = 4) =>
  Array.from({ length: 7 }, (_, i) => `${x0 + ((x1 - x0) * i) / 6},${y + (i % 2 ? -a : a)}`).join(
    ' ',
  );

/* ───────────── Alimentación ───────────── */

export function PowerUnitSymbol({ params, state, maxBar }: SymbolProps) {
  const on = !!state?.on;
  const pc = state ? oilColor(state.pBar, maxBar) : INK;
  const open = (state?.relief ?? 0) > 0.01;
  return (
    <g>
      <rect
        x={-38}
        y={-32}
        width={76}
        height={60}
        fill="none"
        stroke={INK}
        strokeWidth={1}
        strokeDasharray="5 3"
      />
      {/* P: bomba → arriba */}
      <line x1={-10} y1={-40} x2={-10} y2={-9} stroke={state ? pc : INK} strokeWidth={SW} />
      <PumpCircle cx={-10} cy={0} r={9} color={on ? pc : INK} />
      <line x1={-10} y1={9} x2={-10} y2={20} stroke={INK} strokeWidth={SW} />
      <TankGlyph x={-10} y={22} />
      {/* Motor eléctrico */}
      <line x1={-19} y1={0} x2={-24} y2={0} stroke={INK} strokeWidth={SW} />
      <circle cx={-30} cy={0} r={6} fill={on ? '#dcfce7' : PAPER} stroke={INK} strokeWidth={SW} />
      <Label x={-30} y={3} text="M" anchor="middle" />
      {/* Limitadora entre P y el depósito */}
      <line x1={-10} y1={-20} x2={12} y2={-20} stroke={INK} strokeWidth={1.2} />
      <rect x={8} y={-18} width={10} height={16} fill={PAPER} stroke={INK} strokeWidth={1.2} />
      <line
        x1={13}
        y1={-16}
        x2={open ? 13 : 16}
        y2={-4}
        stroke={open ? ACCENT : INK}
        strokeWidth={1.2}
      />
      <line x1={13} y1={-2} x2={13} y2={20} stroke={INK} strokeWidth={1.2} />
      <TankGlyph x={13} y={22} />
      {/* T: retorno → depósito */}
      <line x1={10} y1={-40} x2={10} y2={-32} stroke={INK} strokeWidth={SW} />
      <line x1={10} y1={-32} x2={30} y2={-32} stroke={INK} strokeWidth={0} />
      <path d="M 10 -32 L 30 -32 L 30 17" fill="none" stroke={INK} strokeWidth={1.2} />
      <TankGlyph x={30} y={22} />
      {state ? (
        <Label x={40} y={-34} text={`${state.pBar.toFixed(0)} bar`} />
      ) : (
        <Label x={40} y={-34} text={`${num(params, 'flow')} l/min`} />
      )}
    </g>
  );
}

export function PumpSymbol({ state, maxBar }: SymbolProps) {
  const c = state ? oilColor(state.pBar, maxBar) : INK;
  return (
    <g>
      <line x1={0} y1={-30} x2={0} y2={-12} stroke={INK} strokeWidth={SW} />
      <line x1={0} y1={12} x2={0} y2={30} stroke={INK} strokeWidth={SW} />
      <PumpCircle cx={0} cy={0} r={12} color={c} />
    </g>
  );
}

export function TankSymbol() {
  return (
    <g>
      <line x1={0} y1={-20} x2={0} y2={4} stroke={INK} strokeWidth={SW} />
      <TankGlyph x={0} y={0} />
    </g>
  );
}

/* ───────────── Válvulas ───────────── */

export function ReliefSymbol({ state }: SymbolProps) {
  const open = (state?.open ?? 0) > 0.01;
  const c = open ? ACCENT : INK;
  return (
    <g stroke={INK} strokeWidth={SW} fill="none">
      <line x1={-30} y1={0} x2={-10} y2={0} />
      <rect x={-10} y={-16} width={20} height={32} fill={PAPER} />
      {/* Flecha de paso: desplazada (cerrada) o alineada (abierta) */}
      <line x1={0} y1={0} x2={0} y2={30} />
      <line x1={open ? -6 : -3} y1={-10} x2={open ? -6 : -3} y2={10} stroke={c} />
      <polygon
        points={`${open ? -6 : -3},12 ${open ? -9 : -6},6 ${open ? -3 : 0},6`}
        fill={c}
        stroke="none"
      />
      <line x1={-10} y1={0} x2={-6} y2={0} stroke={c} strokeWidth={1.1} />
      {/* Pilotaje y muelle */}
      <line x1={-20} y1={0} x2={-20} y2={-20} strokeDasharray="3 2" strokeWidth={1} />
      <line x1={-20} y1={-20} x2={-10} y2={-20} strokeDasharray="3 2" strokeWidth={1} />
      <polyline points={springPts(10, 16, -8)} strokeWidth={1.1} transform="rotate(90 13 -8)" />
      <line x1={16} y1={-12} x2={8} y2={-4} strokeWidth={1} />
    </g>
  );
}

export function FilterSymbol() {
  return (
    <g stroke={INK} strokeWidth={SW} fill="none">
      <line x1={-30} y1={0} x2={-14} y2={0} />
      <line x1={14} y1={0} x2={30} y2={0} />
      <polygon points="-14,0 0,-14 14,0 0,14" fill={PAPER} />
      <line x1={0} y1={-12} x2={0} y2={12} strokeDasharray="2.5 2" strokeWidth={1.1} />
    </g>
  );
}

function CheckGlyph({ open }: { open: boolean }) {
  const c = open ? ACCENT : INK;
  return (
    <g stroke={INK} strokeWidth={SW} fill="none">
      <line x1={-30} y1={0} x2={-6} y2={0} />
      <line x1={8} y1={0} x2={30} y2={0} />
      <polyline points="6,-8 0,0 6,8" />
      <circle cx={open ? -6 : -3} cy={0} r={5} fill={open ? '#dbeafe' : PAPER} stroke={c} />
    </g>
  );
}

export function CheckSymbol({ state }: SymbolProps) {
  return <CheckGlyph open={(state?.open ?? 0) > 0.01} />;
}

export function PilotCheckSymbol({ state }: SymbolProps) {
  const open = (state?.open ?? 0) > 0.01;
  return (
    <g>
      <rect x={-14} y={-12} width={28} height={24} fill="none" stroke={INK} strokeWidth={1} />
      <CheckGlyph open={open} />
      <line x1={0} y1={30} x2={0} y2={12} stroke={INK} strokeWidth={1.1} strokeDasharray="3 2" />
      <line
        x1={0}
        y1={12}
        x2={-4}
        y2={4}
        stroke={open ? ACCENT : INK}
        strokeWidth={1.1}
        strokeDasharray="3 2"
      />
    </g>
  );
}

export function ThrottleSymbol({ params }: SymbolProps) {
  const pct = num(params, 'pct');
  const gap = 2 + (pct / 100) * 5;
  return (
    <g stroke={INK} strokeWidth={SW} fill="none">
      <line x1={-30} y1={0} x2={30} y2={0} />
      <path d={`M -10 ${-gap - 8} Q 0 ${-gap} 10 ${-gap - 8}`} />
      <path d={`M -10 ${gap + 8} Q 0 ${gap} 10 ${gap + 8}`} />
      <line x1={-12} y1={12} x2={12} y2={-12} strokeWidth={1.1} />
      <polygon points="12,-12 6,-10 10,-6" fill={INK} stroke="none" />
    </g>
  );
}

export function FlowControlSymbol({ state }: SymbolProps) {
  const reverse = (state?.q ?? 0) < -0.01;
  return (
    <g stroke={INK} strokeWidth={SW} fill="none">
      <line x1={-30} y1={0} x2={-16} y2={0} />
      <line x1={16} y1={0} x2={30} y2={0} />
      <rect x={-16} y={-14} width={32} height={22} fill={PAPER} />
      <path d="M -10 -10 Q -4 -4 2 -10" strokeWidth={1.1} />
      <path d="M -10 4 Q -4 -2 2 4" strokeWidth={1.1} />
      <line x1={-10} y1={-3} x2={14} y2={-3} strokeWidth={1.1} />
      <polygon points="14,-3 9,-6 9,0" fill={INK} stroke="none" />
      {/* Balanza de presión */}
      <rect x={6} y={-12} width={7} height={6} strokeWidth={1} />
      {/* Antirretorno en paralelo */}
      <path d="M -22 0 L -22 16 L 22 16 L 22 0" strokeWidth={1.1} />
      <circle
        cx={-2}
        cy={16}
        r={3.5}
        fill={reverse ? '#dbeafe' : PAPER}
        stroke={reverse ? ACCENT : INK}
        strokeWidth={1.1}
      />
      <polyline points="4,12 0,16 4,20" strokeWidth={1.1} />
    </g>
  );
}

export function AccumulatorSymbol({ state, maxBar }: SymbolProps) {
  const fill = state?.fill ?? 0;
  return (
    <g stroke={INK} strokeWidth={SW}>
      <line x1={0} y1={30} x2={0} y2={18} />
      <rect x={-12} y={-24} width={24} height={42} rx={11} fill={PAPER} />
      {state && fill > 0.005 && (
        <rect
          x={-11}
          y={17 - 34 * fill}
          width={22}
          height={34 * fill}
          fill={oilColor(state.pBar, maxBar)}
          opacity={0.5}
          stroke="none"
        />
      )}
      <line x1={-12} y1={17 - 34 * fill} x2={12} y2={17 - 34 * fill} strokeWidth={1.2} />
      <polygon points="0,-30 -4,-24 4,-24" fill={INK} stroke="none" />
    </g>
  );
}

/* ───────────── Actuadores ───────────── */

export function HydMotorSymbol({ state, maxBar }: SymbolProps) {
  const c = state ? oilColor(state.pA, maxBar) : INK;
  const a = state?.angle ?? 0;
  return (
    <g>
      <line x1={-10} y1={30} x2={-10} y2={12} stroke={INK} strokeWidth={SW} />
      <line x1={10} y1={30} x2={10} y2={12} stroke={INK} strokeWidth={SW} />
      <PumpCircle cx={0} cy={0} r={15} inward color={c} />
      <line x1={15} y1={0} x2={26} y2={0} stroke={INK} strokeWidth={SW} />
      <line x1={22} y1={-3} x2={22} y2={3} stroke={INK} strokeWidth={SW} />
      {state && (
        <line
          x1={0}
          y1={0}
          x2={Math.cos(a) * 8}
          y2={Math.sin(a) * 8}
          stroke={ACCENT}
          strokeWidth={1.4}
        />
      )}
      {state && <Label x={28} y={-8} text={`${Math.abs(state.rpm).toFixed(0)} rpm`} />}
    </g>
  );
}

export function HydCylinderSymbol(props: SymbolProps) {
  return <CylinderSymbol {...props} />;
}

export function HydCylinderSingleSymbol(props: SymbolProps) {
  return <CylinderSymbol {...props} single noSpring />;
}

/**
 * Símbolos ISO 1219 de las válvulas de bloqueo, caudal y presión, alimentación e instrumentos.
 * Todos usan atributos SVG (no CSS) para que la exportación a imagen sea fiel.
 */
import { num } from '../../core/registry';
import { INK, PAPER, SW, pressureColor, type SymbolProps } from '../symbols';
import { makeWayValveSymbol } from './way-valve/Symbol2D';
import { TIMER_CFG, TIMER_SIGNAL_X } from './timer/model';
import { boxesExtent } from './way-valve/config';

const ACCENT = '#2563eb';
const FONT = 'Inter, system-ui, sans-serif';

const VLine = ({
  y1,
  y2,
  x = 0,
  color = INK,
}: {
  y1: number;
  y2: number;
  x?: number;
  color?: string;
}) => <line x1={x} y1={y1} x2={x} y2={y2} stroke={color} strokeWidth={SW} />;

/** Triángulo de escape (descarga a la atmósfera). */
const ExhaustTri = ({ x, y, dir = 'up' }: { x: number; y: number; dir?: 'up' | 'right' }) =>
  dir === 'up' ? (
    <polygon
      points={`${x},${y} ${x - 5},${y - 7} ${x + 5},${y - 7}`}
      fill={PAPER}
      stroke={INK}
      strokeWidth={1.2}
    />
  ) : (
    <polygon
      points={`${x},${y} ${x + 7},${y - 5} ${x + 7},${y + 5}`}
      fill={PAPER}
      stroke={INK}
      strokeWidth={1.2}
    />
  );

/** Asiento en V + bola (antirretorno), con la bola desplazada `lift` (0..1) hacia arriba. */
function CheckBallSeat({
  cx,
  cy,
  lift,
  active,
}: {
  cx: number;
  cy: number;
  lift: number;
  active?: boolean;
}) {
  return (
    <g>
      <polyline
        points={`${cx - 8},${cy - 2} ${cx},${cy + 8} ${cx + 8},${cy - 2}`}
        fill="none"
        stroke={INK}
        strokeWidth={SW}
      />
      <circle
        cx={cx}
        cy={cy - lift * 5}
        r={4.5}
        fill={active ? ACCENT : PAPER}
        stroke={INK}
        strokeWidth={SW}
      />
    </g>
  );
}

/** Estrangulamiento (dos arcos) con flecha de ajuste. */
function Throttle({ cx, cy, adjustable = true }: { cx: number; cy: number; adjustable?: boolean }) {
  return (
    <g fill="none" stroke={INK} strokeWidth={SW}>
      <path d={`M ${cx - 7} ${cy - 10} Q ${cx - 1} ${cy} ${cx - 7} ${cy + 10}`} />
      <path d={`M ${cx + 7} ${cy - 10} Q ${cx + 1} ${cy} ${cx + 7} ${cy + 10}`} />
      {adjustable && (
        <>
          <line x1={cx - 10} y1={cy + 10} x2={cx + 10} y2={cy - 10} strokeWidth={1} />
          <polygon
            points={`${cx + 10},${cy - 10} ${cx + 4},${cy - 8} ${cx + 8},${cy - 4}`}
            fill={INK}
            stroke="none"
          />
        </>
      )}
    </g>
  );
}

const lineColor = (s: any, key: string, maxBar?: number) =>
  s ? pressureColor(s[key] ?? 0, maxBar) : INK;

// ------------------------------------------------------------------ Bloqueo y lógica
export function CheckSymbol({ state }: SymbolProps) {
  const lift: number = state?.lift ?? 0;
  return (
    <g>
      <VLine y1={30} y2={6} />
      <VLine y1={-6} y2={-30} />
      <CheckBallSeat cx={0} cy={0} lift={lift} active={lift > 0.02} />
    </g>
  );
}

export function ShuttleSymbol({ state, and }: SymbolProps & { and?: boolean }) {
  const ball: number = state?.ball ?? (and ? 1 : -1);
  // ball < 0: bloquea la entrada izquierda; > 0: la derecha.
  const bx = ball < 0 ? -11 : 11;
  return (
    <g>
      <line x1={-30} y1={0} x2={-20} y2={0} stroke={INK} strokeWidth={SW} />
      <line x1={20} y1={0} x2={30} y2={0} stroke={INK} strokeWidth={SW} />
      <VLine y1={-8} y2={-20} />
      <rect x={-20} y={-8} width={40} height={16} fill={PAPER} stroke={INK} strokeWidth={SW} />
      {/* Asientos */}
      <polyline points="-20,-8 -14,0 -20,8" fill="none" stroke={INK} strokeWidth={1} />
      <polyline points="20,-8 14,0 20,8" fill="none" stroke={INK} strokeWidth={1} />
      {and ? (
        <g transform={`translate(${bx > 0 ? 3 : -3} 0)`}>
          <rect x={-12} y={-5} width={4} height={10} fill={INK} />
          <rect x={8} y={-5} width={4} height={10} fill={INK} />
          <line x1={-8} y1={0} x2={8} y2={0} stroke={INK} strokeWidth={1.4} />
        </g>
      ) : (
        <circle
          cx={bx}
          cy={0}
          r={4.5}
          fill={state ? ACCENT : PAPER}
          stroke={INK}
          strokeWidth={SW}
        />
      )}
      {and && (
        <text x={0} y={-11} textAnchor="middle" fontSize={7} fill="#64748b" fontFamily={FONT}>
          Y
        </text>
      )}
    </g>
  );
}

export const ShuttleOrSymbol = (p: SymbolProps) => <ShuttleSymbol {...p} />;
export const ShuttleAndSymbol = (p: SymbolProps) => <ShuttleSymbol {...p} and />;

export function QuickExhaustSymbol({ state }: SymbolProps) {
  const filling: boolean = state?.filling ?? true;
  return (
    <g>
      <VLine y1={30} y2={10} />
      <VLine y1={-10} y2={-30} />
      <line x1={12} y1={0} x2={30} y2={0} stroke={INK} strokeWidth={SW} />
      <ExhaustTri x={30} y={0} dir="right" />
      <rect x={-12} y={-10} width={24} height={20} fill={PAPER} stroke={INK} strokeWidth={SW} />
      {/* Disco: en llenado tapa el escape (pared derecha); al descargar tapa la entrada (abajo) */}
      {filling ? (
        <rect x={7} y={-8} width={3} height={16} fill={state ? ACCENT : INK} />
      ) : (
        <rect x={-8} y={5} width={16} height={3} fill={ACCENT} />
      )}
    </g>
  );
}

// ------------------------------------------------------------------ Caudal y presión
export function ThrottleSymbol({ params }: SymbolProps) {
  return (
    <g>
      <VLine y1={30} y2={-30} />
      <Throttle cx={0} cy={0} />
      <text x={12} y={14} fontSize={7} fill="#64748b" fontFamily={FONT}>
        {num(params, 'pct')}%
      </text>
    </g>
  );
}

export function ThrottleOneWaySymbol({ params, state }: SymbolProps) {
  const free = state && state.freeLmin > 1;
  return (
    <g>
      <VLine y1={30} y2={-30} />
      <Throttle cx={0} cy={0} />
      {/* Antirretorno en paralelo (paso libre de 1 a 2) */}
      <polyline
        points="0,18 -20,18 -20,-18 0,-18"
        fill="none"
        stroke={free ? ACCENT : INK}
        strokeWidth={SW}
      />
      <CheckBallSeat cx={-20} cy={2} lift={free ? 1 : 0} active={free} />
      <rect
        x={-28}
        y={-24}
        width={46}
        height={48}
        fill="none"
        stroke="#94a3b8"
        strokeWidth={0.8}
        strokeDasharray="3 2"
      />
      <text x={12} y={14} fontSize={7} fill="#64748b" fontFamily={FONT}>
        {num(params, 'pct')}%
      </text>
    </g>
  );
}

function SpringSide({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <polyline
        points={`${x},${y} ${x + 3},${y - 5} ${x + 6},${y + 5} ${x + 9},${y - 5} ${x + 12},${y + 5} ${x + 14},${y}`}
        fill="none"
        stroke={INK}
        strokeWidth={1.2}
      />
      <line x1={x + 2} y1={y + 8} x2={x + 14} y2={y - 8} stroke={INK} strokeWidth={1} />
    </g>
  );
}

export function ReliefSymbol({ state, params }: SymbolProps) {
  const open: number = state?.open ?? 0;
  return (
    <g>
      <VLine y1={30} y2={14} />
      <VLine y1={-14} y2={-30} />
      <ExhaustTri x={0} y={-30} />
      <rect x={-14} y={-14} width={28} height={28} fill={PAPER} stroke={INK} strokeWidth={SW} />
      {/* Vía normalmente cerrada desplazada; se alinea al abrir */}
      <line
        x1={open > 0.01 ? 0 : 6}
        y1={10}
        x2={open > 0.01 ? 0 : 6}
        y2={-8}
        stroke={open > 0.01 ? ACCENT : INK}
        strokeWidth={SW}
      />
      <polygon
        points={`${open > 0.01 ? 0 : 6},-11 ${open > 0.01 ? -3 : 3},-5 ${open > 0.01 ? 3 : 9},-5`}
        fill={open > 0.01 ? ACCENT : INK}
      />
      <SpringSide x={14} y={-6} />
      {/* Pilotaje desde la entrada */}
      <polyline
        points="0,20 -20,20 -20,-8 -14,-8"
        fill="none"
        stroke={INK}
        strokeWidth={1}
        strokeDasharray="3 2"
      />
      <text x={16} y={14} fontSize={7} fill="#64748b" fontFamily={FONT}>
        {num(params, 'pset')} bar
      </text>
    </g>
  );
}

export function RegulatorSymbol({ state, params, maxBar }: SymbolProps) {
  const open: number = state?.open ?? 1;
  return (
    <g>
      <VLine y1={30} y2={14} color={lineColor(state, 'p1', maxBar)} />
      <VLine y1={-14} y2={-30} color={lineColor(state, 'p2', maxBar)} />
      <line x1={14} y1={0} x2={30} y2={0} stroke={INK} strokeWidth={SW} />
      <ExhaustTri x={30} y={0} dir="right" />
      <rect x={-14} y={-14} width={28} height={28} fill={PAPER} stroke={INK} strokeWidth={SW} />
      <line
        x1={0}
        y1={10}
        x2={0}
        y2={-8}
        stroke={state && open > 0.01 ? ACCENT : INK}
        strokeWidth={SW}
      />
      <polygon points="0,-11 -3,-5 3,-5" fill={state && open > 0.01 ? ACCENT : INK} />
      <SpringSide x={-28} y={6} />
      {/* Pilotaje desde la salida */}
      <polyline
        points="0,-20 -20,-20 -20,-8 -14,-8"
        fill="none"
        stroke={INK}
        strokeWidth={1}
        strokeDasharray="3 2"
      />
      <text x={-30} y={26} fontSize={7} fill="#64748b" fontFamily={FONT}>
        {num(params, 'pset')} bar
      </text>
    </g>
  );
}

// ------------------------------------------------------------------ Temporizador
const TimerValve = makeWayValveSymbol(TIMER_CFG);

export function TimerSymbol({ params, state, maxBar }: SymbolProps) {
  const ext = boxesExtent(TIMER_CFG);
  const x0 = TIMER_SIGNAL_X;
  const pRes: number = state?.pRes ?? 0;
  return (
    <g>
      {/* Válvula 3/2 NC pilotada con retorno por muelle */}
      <TimerValve
        params={{ ...params, actLeft: 'pilot', actRight: 'spring' }}
        state={state}
        maxBar={maxBar}
      />
      {/* Estrangulador + antirretorno + depósito entre la señal 12 y el pilotaje */}
      <line x1={x0} y1={0} x2={x0 + 10} y2={0} stroke={INK} strokeWidth={SW} />
      <g transform={`translate(${x0 + 16} 0) rotate(90)`}>
        <Throttle cx={0} cy={0} />
      </g>
      <line x1={x0 + 26} y1={0} x2={x0 + 34} y2={0} stroke={INK} strokeWidth={SW} />
      <rect
        x={x0 + 34}
        y={-8}
        width={16}
        height={16}
        rx={4}
        fill={state ? pressureColor(pRes, maxBar) : PAPER}
        fillOpacity={state ? 0.5 : 1}
        stroke={INK}
        strokeWidth={SW}
      />
      <line x1={x0 + 50} y1={0} x2={ext.left - 30} y2={0} stroke={INK} strokeWidth={SW} />
      <polyline
        points={`${x0 + 6},0 ${x0 + 6},16 ${x0 + 30},16 ${x0 + 30},0`}
        fill="none"
        stroke={INK}
        strokeWidth={1}
      />
      <g transform={`translate(${x0 + 18} 16) rotate(90)`}>
        <polyline points="-5,-1 0,5 5,-1" fill="none" stroke={INK} strokeWidth={1} />
        <circle cx={0} cy={-2} r={3} fill={PAPER} stroke={INK} strokeWidth={1} />
      </g>
      <rect
        x={x0 + 2}
        y={-22}
        width={ext.left - 30 - x0}
        height={44}
        fill="none"
        stroke="#94a3b8"
        strokeWidth={0.8}
        strokeDasharray="3 2"
      />
      <text x={x0 + 4} y={-25} fontSize={7} fill="#64748b" fontFamily={FONT}>
        t = {num(params, 'delay')} s
      </text>
    </g>
  );
}

// ------------------------------------------------------------------ Alimentación
export function CompressorSymbol({ state, maxBar }: SymbolProps) {
  const running = !!state?.running;
  const crank: number = state?.crank ?? 0;
  return (
    <g>
      <VLine y1={-4} y2={-30} color={lineColor(state, 'pTank', maxBar)} />
      {/* Compresor (círculo con triángulo) + motor */}
      <circle
        cx={-28}
        cy={6}
        r={10}
        fill={PAPER}
        stroke={running ? ACCENT : INK}
        strokeWidth={SW}
      />
      <polygon points="-28,-4 -32,3 -24,3" fill={PAPER} stroke={INK} strokeWidth={1.2} />
      <line
        x1={-28 + Math.cos(crank) * 5}
        y1={6 + Math.sin(crank) * 5}
        x2={-28}
        y2={6}
        stroke={running ? ACCENT : INK}
        strokeWidth={1}
      />
      <line x1={-18} y1={6} x2={-17} y2={6} stroke={INK} strokeWidth={SW} />
      {/* Depósito */}
      <rect
        x={-17}
        y={-4}
        width={34}
        height={20}
        rx={8}
        fill={state ? pressureColor(state.pTank, maxBar) : PAPER}
        fillOpacity={state ? 0.35 : 1}
        stroke={INK}
        strokeWidth={SW}
      />
      {/* Presostato */}
      <rect x={22} y={0} width={14} height={10} fill={PAPER} stroke={INK} strokeWidth={1} />
      <text x={29} y={8} textAnchor="middle" fontSize={6} fill={INK} fontFamily={FONT}>
        P
      </text>
      {state && (
        <text
          x={0}
          y={24}
          textAnchor="middle"
          fontSize={8}
          fontWeight={600}
          fill={INK}
          fontFamily={FONT}
        >
          {state.pTank.toFixed(1)} bar {running ? '· en marcha' : ''}
        </text>
      )}
    </g>
  );
}

export function FrlSymbol({ state, maxBar, params }: SymbolProps) {
  return (
    <g>
      <line
        x1={-50}
        y1={0}
        x2={-38}
        y2={0}
        stroke={lineColor(state, 'p1', maxBar)}
        strokeWidth={SW}
      />
      <line
        x1={38}
        y1={0}
        x2={50}
        y2={0}
        stroke={lineColor(state, 'p2', maxBar)}
        strokeWidth={SW}
      />
      <rect
        x={-38}
        y={-14}
        width={76}
        height={28}
        fill={PAPER}
        stroke={INK}
        strokeWidth={1}
        strokeDasharray="4 2"
      />
      {/* Filtro */}
      <polygon points="-26,-9 -18,0 -26,9 -34,0" fill={PAPER} stroke={INK} strokeWidth={1.2} />
      <line
        x1={-34}
        y1={0}
        x2={-18}
        y2={0}
        stroke={INK}
        strokeWidth={0.8}
        strokeDasharray="2 1.5"
      />
      {/* Regulador con manómetro */}
      <rect x={-8} y={-9} width={16} height={18} fill={PAPER} stroke={INK} strokeWidth={1.2} />
      <line x1={0} y1={6} x2={0} y2={-5} stroke={INK} strokeWidth={1.2} />
      <polygon points="0,-7 -2,-3 2,-3" fill={INK} />
      <circle cx={0} cy={-24} r={7} fill={PAPER} stroke={INK} strokeWidth={1.2} />
      <line x1={0} y1={-17} x2={0} y2={-14} stroke={INK} strokeWidth={1} />
      <line x1={-3} y1={-21} x2={3} y2={-27} stroke={INK} strokeWidth={1} />
      {/* Lubricador */}
      <polygon points="26,-9 34,0 26,9 18,0" fill={PAPER} stroke={INK} strokeWidth={1.2} />
      <line x1={26} y1={-4} x2={26} y2={4} stroke={INK} strokeWidth={1} />
      <text x={0} y={22} textAnchor="middle" fontSize={7} fill="#64748b" fontFamily={FONT}>
        {state ? `${state.p2.toFixed(1)} bar` : `${num(params, 'pset')} bar`}
      </text>
    </g>
  );
}

export function TankSymbol({ state, maxBar }: SymbolProps) {
  return (
    <g>
      <line x1={-40} y1={0} x2={-28} y2={0} stroke={INK} strokeWidth={SW} />
      <line x1={28} y1={0} x2={40} y2={0} stroke={INK} strokeWidth={SW} />
      <rect
        x={-28}
        y={-14}
        width={56}
        height={28}
        rx={12}
        fill={state ? pressureColor(state.bar, maxBar) : PAPER}
        fillOpacity={state ? 0.35 : 1}
        stroke={INK}
        strokeWidth={SW}
      />
      {state && (
        <text
          x={0}
          y={3}
          textAnchor="middle"
          fontSize={8}
          fontWeight={600}
          fill={INK}
          fontFamily={FONT}
        >
          {state.bar.toFixed(1)} bar
        </text>
      )}
    </g>
  );
}

export function FlowmeterSymbol({ state, params }: SymbolProps) {
  const q: number = state?.lmin ?? 0;
  const frac = Math.min(1, Math.abs(q) / num(params, 'range'));
  return (
    <g>
      <VLine y1={30} y2={14} />
      <VLine y1={-14} y2={-30} />
      <circle cx={0} cy={0} r={14} fill={PAPER} stroke={INK} strokeWidth={SW} />
      {/* Flotador que sube con el caudal */}
      <polygon
        points={`-5,${8 - frac * 14} 5,${8 - frac * 14} 0,${13 - frac * 14}`}
        fill={state && frac > 0.01 ? ACCENT : INK}
      />
      <line x1={0} y1={-12} x2={0} y2={12} stroke={INK} strokeWidth={0.6} strokeDasharray="2 2" />
      {state && (
        <text x={18} y={4} fontSize={9} fontWeight={600} fill={INK} fontFamily={FONT}>
          {Math.abs(q).toFixed(0)} l/min
        </text>
      )}
    </g>
  );
}

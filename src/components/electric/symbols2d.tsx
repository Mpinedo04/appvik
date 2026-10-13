/** Símbolos eléctricos IEC 60617 en vertical (la corriente va de arriba, +24 V, a abajo, 0 V). */
import type { ReactNode } from 'react';
import { str } from '../../core/registry';
import { INK, PAPER, SW, type SymbolProps } from '../symbols';
import { CONTACT_PORTS, kindOf, LAMP_COLORS, type ActuatorKind, type ContactKind } from './models';

const ACCENT = '#2563eb';
const LIVE = '#f59e0b';
const FONT = 'Inter, system-ui, sans-serif';

function Txt({
  x,
  y,
  children,
  size = 8,
  anchor = 'middle',
  color = INK,
}: {
  x: number;
  y: number;
  children: string;
  size?: number;
  anchor?: 'start' | 'middle' | 'end';
  color?: string;
}) {
  return (
    <text
      x={x}
      y={y}
      fontSize={size}
      fontWeight={600}
      textAnchor={anchor}
      fill={color}
      fontFamily={FONT}
    >
      {children}
    </text>
  );
}

/* ───────────── Alimentación ───────────── */

export function Plus24Symbol() {
  return (
    <g stroke={INK} strokeWidth={SW}>
      <line x1={0} y1={-4} x2={0} y2={20} />
      <circle cx={0} cy={-7} r={3} fill={PAPER} />
      <g stroke="none">
        <Txt x={0} y={-13} color="#dc2626">
          +24 V
        </Txt>
      </g>
    </g>
  );
}

export function Zero0Symbol() {
  return (
    <g stroke={INK} strokeWidth={SW}>
      <line x1={0} y1={-20} x2={0} y2={4} />
      <circle cx={0} cy={7} r={3} fill={PAPER} />
      <g stroke="none">
        <Txt x={0} y={19} color="#2563eb">
          0 V
        </Txt>
      </g>
    </g>
  );
}

/* ───────────── Contactos ───────────── */

/** Contacto NA o NC con el pivote abajo (borne inferior) y su mando mecánico a la izquierda. */
function SimpleContact({
  kind,
  actuated,
  color,
}: {
  kind: 'no' | 'nc';
  actuated: boolean;
  color: string;
}) {
  const closed = kind === 'no' ? actuated : !actuated;
  return (
    <g stroke={INK} strokeWidth={SW} fill="none">
      <line x1={0} y1={-30} x2={0} y2={-10} />
      <line x1={0} y1={10} x2={0} y2={30} />
      {kind === 'nc' && <line x1={0} y1={-10} x2={7} y2={-10} />}
      <line
        x1={0}
        y1={10}
        x2={closed ? (kind === 'nc' ? 7 : 0.5) : -9}
        y2={closed ? -10 : -9}
        stroke={color}
      />
    </g>
  );
}

/** Contacto conmutado: común arriba, NC abajo a la izquierda y NA abajo a la derecha. */
function ChangeoverContact({ actuated, color }: { actuated: boolean; color: string }) {
  return (
    <g stroke={INK} strokeWidth={SW} fill="none">
      <line x1={0} y1={-30} x2={0} y2={-12} />
      <line x1={-10} y1={30} x2={-10} y2={10} />
      <line x1={10} y1={30} x2={10} y2={12} />
      <line x1={0} y1={-12} x2={actuated ? 10 : -10} y2={actuated ? 12 : 10} stroke={color} />
    </g>
  );
}

/** Mando mecánico del contacto (pulsador, interruptor, seta, rodillo, sensor, presión). */
function ContactActuator({
  type,
  actuated,
  params,
}: {
  type: ActuatorKind;
  actuated: boolean;
  params: SymbolProps['params'];
}) {
  if (type === 'relay') return null;
  const c = actuated ? ACCENT : INK;
  const link = <line x1={-5} y1={0} x2={-18} y2={0} strokeDasharray="2.5 2" strokeWidth={1.1} />;
  return (
    <g stroke={c} strokeWidth={SW} fill="none">
      {link}
      {(type === 'button' || type === 'switch') && <path d="M -18 -6 L -22 -6 L -22 6 L -18 6" />}
      {type === 'switch' && <polyline points="-13,-3 -10,0 -13,3" strokeWidth={1.1} />}
      {type === 'estop' && (
        <>
          <line x1={-18} y1={0} x2={-22} y2={0} />
          <path d="M -22 -8 A 8 8 0 0 0 -22 8 Z" fill={actuated ? '#ef4444' : PAPER} />
        </>
      )}
      {type === 'limit' && (
        <>
          <line x1={-18} y1={0} x2={-21} y2={-5} />
          <circle cx={-23} cy={-8} r={3} fill={actuated ? ACCENT : PAPER} />
        </>
      )}
      {type === 'proximity' && (
        <>
          <polygon points="-25,0 -19,-6 -13,0 -19,6" fill={actuated ? '#dbeafe' : PAPER} />
          <g stroke="none">
            <Txt x={-19} y={2.6} size={6.5} color={c}>
              {(
                { magnetic: 'M', inductive: 'I', capacitive: 'C', optical: 'O' } as Record<
                  string,
                  string
                >
              )[str(params, 'sensorType')] ?? ''}
            </Txt>
          </g>
        </>
      )}
      {type === 'pressure' && (
        <>
          <line x1={-40} y1={0} x2={-30} y2={0} stroke={INK} />
          <rect x={-30} y={-6} width={12} height={12} fill={actuated ? '#dbeafe' : PAPER} />
          <g stroke="none">
            <Txt x={-24} y={3} size={8} color={c}>
              p
            </Txt>
          </g>
        </>
      )}
    </g>
  );
}

export function makeContactSymbol(actuator: ActuatorKind, fixed?: ContactKind) {
  return function ContactSymbol({ params, state }: SymbolProps) {
    const kind = kindOf(params, fixed);
    const actuated = !!state?.actuated;
    const color = actuated ? ACCENT : INK;
    return (
      <g>
        {kind === 'co' ? (
          <ChangeoverContact actuated={actuated} color={color} />
        ) : (
          <SimpleContact kind={kind} actuated={actuated} color={color} />
        )}
        <ContactActuator type={actuator} actuated={actuated} params={params} />
        {/* Números de los bornes */}
        <g>
          {CONTACT_PORTS[kind].map((p) => (
            <Txt
              key={p.id}
              x={p.x + 4}
              y={p.y < 0 ? p.y + 8 : p.y - 3}
              size={6}
              anchor="start"
              color="#64748b"
            >
              {p.id}
            </Txt>
          ))}
        </g>
      </g>
    );
  };
}

/* ───────────── Bobinas y lámparas ───────────── */

function CoilBox({ on, children }: { on: boolean; children?: ReactNode }) {
  return (
    <g stroke={INK} strokeWidth={SW}>
      <line x1={0} y1={-30} x2={0} y2={-8} />
      <line x1={0} y1={8} x2={0} y2={30} />
      <rect x={-12} y={-8} width={24} height={16} fill={on ? '#fde68a' : PAPER} />
      {children}
    </g>
  );
}

export function RelaySymbol({ state }: SymbolProps) {
  return (
    <g>
      <CoilBox on={!!state?.energized} />
      <Txt x={9} y={-12} size={6} anchor="start" color="#64748b">
        A1
      </Txt>
      <Txt x={9} y={18} size={6} anchor="start" color="#64748b">
        A2
      </Txt>
      {state?.on && <circle cx={0} cy={0} r={2.5} fill={ACCENT} />}
    </g>
  );
}

export function RelayTimerSymbol({ params, state }: SymbolProps) {
  const offDelay = str(params, 'mode') === 'off-delay';
  return (
    <g>
      <CoilBox on={!!state?.energized} />
      {/* Bloque de retardo: con aspa (a la conexión) o relleno (a la desconexión) */}
      <g stroke={INK} strokeWidth={SW}>
        <rect x={-24} y={-8} width={12} height={16} fill={offDelay ? INK : PAPER} />
        {!offDelay && (
          <>
            <line x1={-24} y1={-8} x2={-12} y2={8} strokeWidth={1} />
            <line x1={-24} y1={8} x2={-12} y2={-8} strokeWidth={1} />
          </>
        )}
      </g>
      {state?.on && <circle cx={0} cy={0} r={2.5} fill={ACCENT} />}
      {state?.energized && !state.on && (
        <Txt x={16} y={3} size={7} anchor="start" color={LIVE}>
          {'⧗'}
        </Txt>
      )}
    </g>
  );
}

export function SolenoidSymbol({ state }: SymbolProps) {
  return (
    <CoilBox on={!!state?.on}>
      <line x1={-12} y1={8} x2={12} y2={-8} strokeWidth={1.2} />
    </CoilBox>
  );
}

export function CounterSymbol({ params, state }: SymbolProps) {
  const on = !!state?.on;
  return (
    <g stroke={INK} strokeWidth={SW}>
      <line x1={-10} y1={-30} x2={-10} y2={-10} />
      <line x1={-10} y1={10} x2={-10} y2={30} />
      <line x1={10} y1={-30} x2={10} y2={-10} />
      <line x1={10} y1={10} x2={10} y2={30} />
      <rect x={-20} y={-10} width={40} height={20} fill={on ? '#fde68a' : PAPER} />
      <line x1={0} y1={-10} x2={0} y2={10} strokeWidth={1} />
      <g stroke="none">
        <Txt x={-10} y={3} size={7} color={state?.energized ? ACCENT : INK}>
          {state ? String(state.count) : 'C'}
        </Txt>
        <Txt x={10} y={3} size={7}>
          {state ? `/${params.preset}` : 'R'}
        </Txt>
      </g>
    </g>
  );
}

export function LampSymbol({ params, state }: SymbolProps) {
  const on = !!state?.on;
  const c = LAMP_COLORS[str(params, 'color')] ?? '#22c55e';
  return (
    <g stroke={INK} strokeWidth={SW}>
      <line x1={0} y1={-30} x2={0} y2={-9} />
      <line x1={0} y1={9} x2={0} y2={30} />
      {on && <circle cx={0} cy={0} r={13} fill={c} opacity={0.3} stroke="none" />}
      <circle cx={0} cy={0} r={9} fill={on ? c : PAPER} />
      <line x1={-6.4} y1={-6.4} x2={6.4} y2={6.4} />
      <line x1={-6.4} y1={6.4} x2={6.4} y2={-6.4} />
    </g>
  );
}

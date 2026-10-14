/** PLC en 2D: módulo con sus bornes y los LEDs de entradas (verde) y salidas (ámbar). */
import { str } from '../../core/registry';
import { INK, PAPER, SW, type SymbolProps } from '../symbols';
import { PLC_IO, plcInputX, type PlcState } from './plc';

const FONT = 'Inter, system-ui, sans-serif';

export function PlcSymbol({ params, state }: SymbolProps) {
  const s = state as PlcState | undefined;
  return (
    <g fontFamily={FONT}>
      <rect
        x={-100}
        y={-28}
        width={190}
        height={56}
        rx={4}
        fill={PAPER}
        stroke={INK}
        strokeWidth={SW}
      />
      <text x={-94} y={4} fontSize={11} fontWeight={700} fill={INK}>
        PLC
      </text>
      <text x={-94} y={16} fontSize={7} fill="#64748b">
        {str(params, 'program') === 'grafcet' ? 'GRAFCET' : 'Contactos'}
      </text>
      <circle
        cx={-80}
        cy={-14}
        r={3}
        fill={s?.powered ? '#22c55e' : '#e2e8f0'}
        stroke={INK}
        strokeWidth={0.6}
      />
      {/* Bornes L+ y M */}
      <line x1={-90} y1={-40} x2={-90} y2={-28} stroke={INK} strokeWidth={SW} />
      <line x1={-90} y1={28} x2={-90} y2={40} stroke={INK} strokeWidth={SW} />
      <text x={-87} y={-31} fontSize={6} fill="#64748b">
        L+
      </text>
      <text x={-87} y={36} fontSize={6} fill="#64748b">
        M
      </text>
      {Array.from({ length: PLC_IO }, (_, i) => {
        const x = plcInputX(i);
        const inOn = !!s?.inputs[i];
        const outOn = !!s?.outputs[i];
        return (
          <g key={i}>
            <line x1={x} y1={-40} x2={x} y2={-28} stroke={INK} strokeWidth={SW} />
            <line x1={x} y1={28} x2={x} y2={40} stroke={INK} strokeWidth={SW} />
            <circle
              cx={x}
              cy={-19}
              r={3.2}
              fill={inOn ? '#22c55e' : '#e2e8f0'}
              stroke={INK}
              strokeWidth={0.6}
            />
            <circle
              cx={x}
              cy={19}
              r={3.2}
              fill={outOn ? '#f59e0b' : '#e2e8f0'}
              stroke={INK}
              strokeWidth={0.6}
            />
            <text x={x} y={-8} fontSize={6} textAnchor="middle" fill="#334155">
              I0.{i}
            </text>
            <text x={x} y={12} fontSize={6} textAnchor="middle" fill="#334155">
              Q0.{i}
            </text>
          </g>
        );
      })}
    </g>
  );
}

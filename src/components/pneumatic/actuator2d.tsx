/** Dibujo ISO 1219 de los accionamientos, compartido por todas las válvulas. */
import { INK, PAPER, SW } from '../symbols';

const ACCENT = '#2563eb';

/**
 * Dibuja el accionamiento de un lado. `x` es el borde de la casilla extrema; para el lado
 * derecho se refleja el mismo dibujo.
 */
export function Actuator2D({
  x,
  side,
  type,
  engaged,
}: {
  x: number;
  side: 'left' | 'right';
  type: string;
  engaged: boolean;
}) {
  if (type === 'none') return null;
  const color = engaged ? ACCENT : INK;
  const fill = engaged ? ACCENT : PAPER;
  return (
    <g
      transform={`translate(${x} 0) scale(${side === 'left' ? 1 : -1} 1)`}
      stroke={color}
      strokeWidth={SW}
      fill="none"
    >
      {type === 'spring' && (
        <polyline
          points="0,0 -3,-7 -7,7 -11,-7 -15,7 -19,-7 -21,0"
          strokeWidth={1.3}
          strokeLinejoin="round"
        />
      )}
      {type === 'pushbutton' && (
        <>
          <line x1={0} y1={0} x2={-10} y2={0} />
          <path d="M -10 -7 A 7 7 0 0 0 -10 7 Z" fill={fill} />
        </>
      )}
      {type === 'lever' && (
        <>
          <line x1={0} y1={0} x2={-10} y2={0} />
          <line x1={-10} y1={0} x2={-18} y2={engaged ? 10 : -10} />
          <circle cx={-19} cy={engaged ? 11 : -11} r={2} fill={fill} />
          <polyline points="-9,-9 -7,-5 -5,-9 -3,-5 -1,-9" strokeWidth={1} />
        </>
      )}
      {type === 'pedal' && (
        <>
          <line x1={0} y1={0} x2={-10} y2={0} />
          <line x1={-8} y1={-8} x2={-18} y2={8} />
          <line x1={-18} y1={8} x2={-22} y2={8} />
        </>
      )}
      {type === 'roller' && (
        <>
          <line x1={0} y1={0} x2={-12} y2={0} />
          <circle cx={-16} cy={0} r={4} fill={fill} />
        </>
      )}
      {type === 'roller-oneway' && (
        <>
          <line x1={0} y1={0} x2={-8} y2={0} />
          <line x1={-8} y1={0} x2={-14} y2={-7} />
          <circle cx={-16} cy={-10} r={3.5} fill={fill} />
          <line x1={-8} y1={2} x2={-12} y2={6} strokeWidth={1} />
        </>
      )}
      {type === 'pilot' && <polygon points="0,0 -9,-5 -9,5" fill={engaged ? ACCENT : PAPER} />}
      {type === 'servo' && (
        <>
          <rect x={-10} y={-7} width={10} height={14} fill={PAPER} />
          <polygon points="-1,0 -8,-4 -8,4" fill={engaged ? ACCENT : PAPER} strokeWidth={1} />
          <line x1={-10} y1={0} x2={-16} y2={0} />
          <path d="M -16 -6 A 6 6 0 0 0 -16 6 Z" fill={fill} />
        </>
      )}
    </g>
  );
}

/** Línea de pilotaje discontinua desde el puerto fijo hasta el accionamiento (que se desplaza). */
export function PilotLine({ from, to, active }: { from: number; to: number; active: boolean }) {
  return (
    <line
      x1={from}
      y1={0}
      x2={to}
      y2={0}
      stroke={active ? ACCENT : INK}
      strokeWidth={1.2}
      strokeDasharray="4 3"
    />
  );
}

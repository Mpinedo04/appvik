import { str } from '../../../core/registry';
import { Arrow, INK, PAPER, SW, pressureColor, type SymbolProps } from '../../symbols';
import { BOX_H, valvePortPos, type WayValveConfig } from './config';
import type { WayValveState } from './model';

const ACCENT = '#2563eb';

/**
 * Símbolo ISO 1219 generado a partir de la configuración de la válvula.
 * Las casillas se desplazan con la corredera, como en un simulador clásico.
 */
export function makeWayValveSymbol(cfg: WayValveConfig) {
  const W = cfg.boxW;
  const H = BOX_H;
  const portX = (col: number, ox: number) => ox + W / 2 + col;
  const portY = (side: 'top' | 'bottom', inset = 0) =>
    side === 'top' ? -H / 2 + inset : H / 2 - inset;

  return function WayValveSymbol({ params, state, maxBar }: SymbolProps) {
    const s = state as WayValveState | undefined;
    const spool = s?.spool ?? 0;
    const actLeft = str(params, 'actLeft');
    const actRight = str(params, 'actRight');
    const engaged = !!s && (actLeft === 'lever' ? s.latched : s.pressed);
    const activeBox = spool > 0.5 ? 0 : 1;

    const box = (i: 0 | 1) => {
      const ox = i === 0 ? -W : 0;
      const pos = cfg.positions[i];
      const live = !!s && i === activeBox;
      return (
        <g key={i}>
          <rect x={ox} y={-H / 2} width={W} height={H} fill={PAPER} stroke={INK} strokeWidth={SW} />
          {pos.paths.map(([from, to]) => {
            const pf = cfg.ports.find((p) => p.id === from)!;
            const pt = cfg.ports.find((p) => p.id === to)!;
            const color = live
              ? pressureColor(Math.max(s!.portBar[from] ?? 0, s!.portBar[to] ?? 0), maxBar)
              : INK;
            return (
              <Arrow
                key={`${from}-${to}`}
                x1={portX(pf.col, ox)}
                y1={portY(pf.side, 2)}
                x2={portX(pt.col, ox)}
                y2={portY(pt.side, 2)}
                color={color}
              />
            );
          })}
          {pos.blocked.map((id) => {
            const pc = cfg.ports.find((p) => p.id === id)!;
            const x = portX(pc.col, ox);
            const y0 = portY(pc.side);
            const y1 = portY(pc.side, 8);
            return (
              <g key={id} stroke={INK} strokeWidth={SW}>
                <line x1={x} y1={y0} x2={x} y2={y1} />
                <line x1={x - 4} y1={y1} x2={x + 4} y2={y1} />
              </g>
            );
          })}
        </g>
      );
    };

    return (
      <g>
        {cfg.ports.map((pc) => {
          const p = valvePortPos(cfg, pc);
          return (
            <line
              key={pc.id}
              x1={p.x}
              y1={p.y}
              x2={p.x}
              y2={portY(pc.side)}
              stroke={INK}
              strokeWidth={SW}
            />
          );
        })}
        {cfg.ports.map((pc) => {
          const p = valvePortPos(cfg, pc);
          return (
            <text
              key={`t${pc.id}`}
              x={p.x + 3}
              y={pc.side === 'top' ? p.y + 6 : p.y - 1}
              fontSize={7}
              fill="#64748b"
              fontFamily="Inter, system-ui, sans-serif"
            >
              {pc.id}
            </text>
          );
        })}
        <g transform={`translate(${spool * W} 0)`}>
          {box(0)}
          {box(1)}
          <LeftActuator x={-W} type={actLeft} engaged={engaged} />
          <RightActuator x={W} type={actRight} />
        </g>
      </g>
    );
  };
}

function LeftActuator({ x, type, engaged }: { x: number; type: string; engaged: boolean }) {
  const fill = engaged ? ACCENT : PAPER;
  const stroke = engaged ? ACCENT : INK;
  if (type === 'lever')
    return (
      <g stroke={stroke} strokeWidth={SW} fill="none">
        <line x1={x} y1={0} x2={x - 10} y2={0} />
        <line x1={x - 10} y1={0} x2={x - 18} y2={engaged ? 10 : -10} />
        <circle cx={x - 19} cy={engaged ? 11 : -11} r={2} fill={fill} />
        {/* Enclavamiento */}
        <polyline
          points={`${x - 9},-9 ${x - 7},-5 ${x - 5},-9 ${x - 3},-5 ${x - 1},-9`}
          strokeWidth={1}
        />
      </g>
    );
  if (type === 'pedal')
    return (
      <g stroke={stroke} strokeWidth={SW} fill="none">
        <line x1={x} y1={0} x2={x - 10} y2={0} />
        <line x1={x - 8} y1={-8} x2={x - 18} y2={8} />
        <line x1={x - 18} y1={8} x2={x - 22} y2={8} />
      </g>
    );
  // Pulsador
  return (
    <g stroke={stroke} strokeWidth={SW}>
      <line x1={x} y1={0} x2={x - 10} y2={0} />
      <path d={`M ${x - 10} -7 A 7 7 0 0 0 ${x - 10} 7 Z`} fill={fill} />
    </g>
  );
}

function RightActuator({ x, type }: { x: number; type: string }) {
  if (type !== 'spring') return null;
  return (
    <polyline
      points={`${x},0 ${x + 3},-7 ${x + 7},7 ${x + 11},-7 ${x + 15},7 ${x + 19},-7 ${x + 21},0`}
      fill="none"
      stroke={INK}
      strokeWidth={1.3}
      strokeLinejoin="round"
    />
  );
}

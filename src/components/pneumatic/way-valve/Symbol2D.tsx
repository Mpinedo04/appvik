import { str } from '../../../core/registry';
import { Arrow, INK, PAPER, SW, pressureColor, type SymbolProps } from '../../symbols';
import { Actuator2D, PilotLine } from '../actuator2d';
import { BOX_H, boxesExtent, spoolShift, valvePortPos, type WayValveConfig } from './config';
import { hasPilot, type WayValveState } from './model';

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
  const ext = boxesExtent(cfg);

  return function WayValveSymbol({ params, state, maxBar }: SymbolProps) {
    const s = state as WayValveState | undefined;
    const pos = s?.pos ?? cfg.rest;
    const shift = spoolShift(cfg, pos);
    const actLeft = str(params, 'actLeft');
    const actRight = str(params, 'actRight');
    const springs = cfg.positions.length >= 3 && Boolean(params.springs);
    const activeBox = Math.round(pos);

    const box = (i: number) => {
      const ox = (i - cfg.rest) * W;
      const position = cfg.positions[i];
      const live = !!s && i === activeBox;
      return (
        <g key={i}>
          <rect x={ox} y={-H / 2} width={W} height={H} fill={PAPER} stroke={INK} strokeWidth={SW} />
          {position.paths.map(([from, to]) => {
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
          {position.blocked.map((id) => {
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
        {hasPilot(params, 'left') && (
          <PilotLine from={ext.left - 30} to={ext.left + shift - 9} active={!!s?.leftOn} />
        )}
        {hasPilot(params, 'right') && (
          <PilotLine from={ext.right + 30} to={ext.right + shift + 9} active={!!s?.rightOn} />
        )}
        <g transform={`translate(${shift} 0)`}>
          {cfg.positions.map((_, i) => box(i))}
          {springs && actLeft !== 'spring' && (
            <g transform="translate(0 12)">
              <Actuator2D x={ext.left} side="left" type="spring" engaged={false} />
            </g>
          )}
          {springs && actRight !== 'spring' && (
            <g transform="translate(0 12)">
              <Actuator2D x={ext.right} side="right" type="spring" engaged={false} />
            </g>
          )}
          <g transform={springs ? 'translate(0 -8)' : undefined}>
            <Actuator2D x={ext.left} side="left" type={actLeft} engaged={!!s?.leftOn} />
            <Actuator2D x={ext.right} side="right" type={actRight} engaged={!!s?.rightOn} />
          </g>
        </g>
      </g>
    );
  };
}

/** Utilidades de dibujo compartidas por los símbolos ISO 1219. */
import type { FC } from 'react';
import type { Params } from '../core/model/types';

/** Los símbolos usan atributos (no CSS) para que la exportación a PNG sea fiel. */
export const INK = '#1b2230';
export const SW = 1.6;
export const PAPER = '#ffffff';

/**
 * Color según la presión. Aire: azul (0 bar, escape) → rojo (presión de trabajo).
 * Aceite: ámbar (sin presión) → rojo oscuro (presión máxima).
 */
export function pressureColor(bar: number, maxBar = 6, medium: 'pneu' | 'hyd' = 'pneu'): string {
  if (medium === 'hyd') return oilColor(bar, maxBar);
  const t = Math.max(0, Math.min(1, bar / maxBar));
  if (t < 0.02) return '#2f6fde';
  const hue = 220 - 220 * t;
  return `hsl(${hue.toFixed(0)} 80% ${(48 - 4 * t).toFixed(0)}%)`;
}

/** Escala del aceite: ámbar → rojo oscuro. */
export function oilColor(bar: number, maxBar = 100): string {
  const t = Math.max(0, Math.min(1, bar / maxBar));
  return `hsl(${(42 - 42 * t).toFixed(0)} ${(85 - 10 * t).toFixed(0)}% ${(50 - 14 * t).toFixed(0)}%)`;
}

/** Color de un cable eléctrico según su nivel: +24 V rojo, 0 V azul, sin tensión negro. */
export function wireColor(level: number | undefined): string {
  return level === 1 ? '#dc2626' : level === -1 ? '#2563eb' : INK;
}

export interface SymbolProps {
  params: Params;
  /** Estado de simulación (ausente en modo edición). */
  state?: any;
  /** Estado de la simulación de otros componentes no es necesario: cada símbolo se basta con el suyo. */
  maxBar?: number;
  /** Fluido del componente (para la escala de colores). */
  medium?: 'pneu' | 'hyd';
}

export interface ComponentView {
  Symbol2D: FC<SymbolProps>;
}

export const Arrow: FC<{ x1: number; y1: number; x2: number; y2: number; color?: string }> = ({
  x1,
  y1,
  x2,
  y2,
  color = INK,
}) => {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const L = 6;
  const W = 2.6;
  const bx = x2 - L * Math.cos(a);
  const by = y2 - L * Math.sin(a);
  const nx = -Math.sin(a) * W;
  const ny = Math.cos(a) * W;
  return (
    <g>
      <line x1={x1} y1={y1} x2={bx} y2={by} stroke={color} strokeWidth={SW} />
      <polygon points={`${x2},${y2} ${bx + nx},${by + ny} ${bx - nx},${by - ny}`} fill={color} />
    </g>
  );
};

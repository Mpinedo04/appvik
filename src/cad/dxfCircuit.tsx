/** Esquema del proyecto → DXF (se carga aparte, sólo al exportar). */
import { renderToStaticMarkup } from 'react-dom/server';
import { CircuitDrawing } from '../editor/CircuitDrawing';
import type { Circuit } from '../core/model/types';
import { svgToEntities, toDxf, type SvgNode } from './dxf';

export function circuitToDxf(circuit: Circuit): string {
  const markup = renderToStaticMarkup(
    <svg xmlns="http://www.w3.org/2000/svg">
      <CircuitDrawing circuit={circuit} />
    </svg>,
  );
  const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
  return toDxf(svgToEntities(doc.documentElement as unknown as SvgNode));
}

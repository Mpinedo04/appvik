/**
 * Exportación a PDF (se descarga aparte, sólo al usarla): hoja A4 apaisada con el esquema en
 * vectorial y su cajetín, hojas con el GRAFCET y el esquema de contactos si los hay, y la lista
 * de componentes con sus parámetros principales.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { CircuitDrawing, circuitBounds } from '../editor/CircuitDrawing';
import { GrafcetDrawing, grafcetBounds } from '../editor/grafcet/GrafcetEditor';
import { Rung } from '../editor/ladder/LadderEditor';
import type { Project } from '../core/model/types';
import { getModel, resolveParams } from '../core/registry';

const PAGE = { w: 297, h: 210 };
const M = 10;
const TITLE_H = 14;

/** Las fuentes estándar del PDF no tienen algunos símbolos: se sustituyen. */
const SUBST: Record<string, string> = {
  '−': '-',
  '→': '->',
  '←': '<-',
  '↑': '^',
  '↓': 'v',
  '¬': '!',
  '≥': '>=',
  '≤': '<=',
  '…': '...',
  '⧗': '',
  '✕': 'x',
  '“': '"',
  '”': '"',
  '«': '"',
  '»': '"',
};
const clean = (s: string) => s.replace(/[−→←↑↓¬≥≤…⧗✕“”«»]/g, (c) => SUBST[c] ?? '');

/** SVG (marcado de React) → elemento con textos aptos para el PDF. */
function svgElement(el: ReactElement, w: number, h: number, vb: string) {
  const markup = renderToStaticMarkup(
    <svg xmlns="http://www.w3.org/2000/svg" width={w} height={h} viewBox={vb}>
      {el}
    </svg>,
  );
  const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
  const svg = doc.documentElement as unknown as SVGSVGElement;
  svg.querySelectorAll('text').forEach((t) => {
    t.textContent = clean(t.textContent ?? '');
  });
  svg.querySelectorAll('[font-family]').forEach((n) => n.setAttribute('font-family', 'helvetica'));
  return svg;
}

export async function buildPdf(project: Project): Promise<Uint8Array> {
  const [{ jsPDF }, { svg2pdf }] = await Promise.all([import('jspdf'), import('svg2pdf.js')]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const date = new Date().toLocaleDateString('es-ES');
  const pages: ((n: number, total: number) => Promise<void> | void)[] = [];
  const c = project.circuit;

  const titleBlock = (title: string, n: number, total: number) => {
    const y = PAGE.h - M - TITLE_H;
    doc.setDrawColor(27, 34, 48);
    doc.setLineWidth(0.3);
    doc.rect(M, M, PAGE.w - 2 * M, PAGE.h - 2 * M);
    doc.line(M, y, PAGE.w - M, y);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(clean(project.name), M + 4, y + 6);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(clean(title), M + 4, y + 11);
    doc.text(`FluidLab 3D · ${date}`, PAGE.w - M - 4, y + 6, { align: 'right' });
    doc.text(`Hoja ${n} de ${total}`, PAGE.w - M - 4, y + 11, { align: 'right' });
  };

  /** Coloca un SVG ajustado al área útil de la hoja. */
  const place = async (svg: SVGSVGElement, w: number, h: number) => {
    const aw = PAGE.w - 2 * M - 8;
    const ah = PAGE.h - 2 * M - TITLE_H - 8;
    const k = Math.min(aw / w, ah / h, 0.5);
    const pw = w * k;
    const ph = h * k;
    document.body.appendChild(svg);
    try {
      await svg2pdf(svg, doc, {
        x: M + 4 + (aw - pw) / 2,
        y: M + 4 + (ah - ph) / 2,
        width: pw,
        height: ph,
      });
    } finally {
      svg.remove();
    }
  };

  // Esquema
  pages.push(async (n, total) => {
    const b = circuitBounds(c);
    const w = b.x1 - b.x0;
    const h = b.y1 - b.y0;
    await place(
      svgElement(<CircuitDrawing circuit={c} />, w, h, `${b.x0} ${b.y0} ${w} ${h}`),
      w,
      h,
    );
    titleBlock('Esquema', n, total);
  });

  if (c.grafcet && Object.keys(c.grafcet.steps).length) {
    const g = c.grafcet;
    pages.push(async (n, total) => {
      const b = grafcetBounds(g);
      await place(svgElement(<GrafcetDrawing g={g} />, b.w, b.h, `0 0 ${b.w} ${b.h}`), b.w, b.h);
      titleBlock('GRAFCET', n, total);
    });
  }

  if (c.ladder?.rungs.length) {
    const rungs = c.ladder.rungs;
    pages.push(async (n, total) => {
      // Cada segmento se dibuja como en el editor y se apilan en un único SVG.
      const parts = rungs.map((r, i) => {
        const html = renderToStaticMarkup(
          <Rung r={r} i={i} width={760} vars={undefined} result={undefined} selected={false} />,
        );
        const m = /<svg[^>]*height="(\d+(?:\.\d+)?)"[^>]*>([\s\S]*)<\/svg>/.exec(html);
        return { h: m ? Number(m[1]) : 70, inner: m ? m[2] : '' };
      });
      const total_h = parts.reduce((s, p) => s + p.h, 0);
      let y = 0;
      const body = parts
        .map((p) => {
          const g = `<g transform="translate(0 ${y})">${p.inner}</g>`;
          y += p.h;
          return g;
        })
        .join('');
      const svg = svgElement(
        <g dangerouslySetInnerHTML={{ __html: body }} />,
        760,
        total_h,
        `0 0 760 ${total_h}`,
      );
      await place(svg, 760, total_h);
      titleBlock('Esquema de contactos', n, total);
    });
  }

  // Lista de componentes
  pages.push((n, total) => {
    const comps = Object.values(c.components).sort((a, b) =>
      a.label.localeCompare(b.label, 'es', { numeric: true }),
    );
    let y = M + 10;
    const head = () => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('Etiqueta', M + 4, y);
      doc.text('Componente', M + 30, y);
      doc.text('Parámetros', M + 110, y);
      doc.line(M + 4, y + 2, PAGE.w - M - 4, y + 2);
      y += 7;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
    };
    titleBlock('Lista de componentes', n, total);
    head();
    for (const comp of comps) {
      const m = getModel(comp.type);
      const p = resolveParams(m, comp.params);
      const params = m.params
        .filter((d) => !d.when || d.when(p))
        .map((d) => {
          const v = p[d.key];
          const shown =
            d.type === 'select'
              ? (d.options.find((o) => o.value === v)?.label ?? String(v))
              : d.type === 'boolean'
                ? v
                  ? 'sí'
                  : 'no'
                : String(v);
          return `${d.label}: ${shown}${d.unit ? ` ${d.unit}` : ''}`;
        })
        .filter((t) => !t.endsWith(': '))
        .join(' · ');
      const lines = doc.splitTextToSize(clean(params || '—'), PAGE.w - 2 * M - 114) as string[];
      if (y + lines.length * 4 > PAGE.h - M - TITLE_H - 4) {
        doc.addPage();
        y = M + 10;
        titleBlock('Lista de componentes (continuación)', n, total);
        head();
      }
      doc.text(clean(comp.label), M + 4, y);
      doc.text(clean(m.name), M + 30, y, { maxWidth: 76 });
      doc.text(lines, M + 110, y);
      y += Math.max(lines.length, 1) * 4 + 2;
    }
  });

  for (let i = 0; i < pages.length; i++) {
    if (i > 0) doc.addPage();
    await pages[i](i + 1, pages.length);
  }
  return new Uint8Array(doc.output('arraybuffer'));
}

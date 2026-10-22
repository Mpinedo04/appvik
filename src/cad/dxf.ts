/**
 * Exportación del esquema 2D a DXF (AutoCAD R12, el más compatible: SolidWorks lo abre como
 * dibujo o lo inserta como boceto). Se recorre el SVG de los mismos símbolos que el lienzo y
 * se convierte en líneas, polilíneas, círculos, sólidos y textos.
 * Escala: 1 unidad de dibujo = 0,5 mm (un esquema normal cabe en un A3).
 */

export const DXF_MM_PER_UNIT = 0.5;

type Pt = [number, number];
/** Matriz afín [a b c d e f] como en SVG: x' = a·x + c·y + e ; y' = b·x + d·y + f. */
export type Mat = [number, number, number, number, number, number];

const I: Mat = [1, 0, 0, 1, 0, 0];

export function mul(m: Mat, n: Mat): Mat {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export const apply = (m: Mat, [x, y]: Pt): Pt => [
  m[0] * x + m[2] * y + m[4],
  m[1] * x + m[3] * y + m[5],
];

/** Atributo transform de SVG → matriz. */
export function parseTransform(t: string | null): Mat {
  let m = I;
  if (!t) return m;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let r: RegExpExecArray | null;
  while ((r = re.exec(t))) {
    const a = r[2]
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number);
    let n: Mat = I;
    switch (r[1]) {
      case 'matrix':
        n = a.slice(0, 6) as Mat;
        break;
      case 'translate':
        n = [1, 0, 0, 1, a[0] ?? 0, a[1] ?? 0];
        break;
      case 'scale':
        n = [a[0], 0, 0, a[1] ?? a[0], 0, 0];
        break;
      case 'rotate': {
        const ang = ((a[0] ?? 0) * Math.PI) / 180;
        const cs = Math.cos(ang);
        const sn = Math.sin(ang);
        n = [cs, sn, -sn, cs, 0, 0];
        if (a.length >= 3) n = mul(mul([1, 0, 0, 1, a[1], a[2]], n), [1, 0, 0, 1, -a[1], -a[2]]);
        break;
      }
      case 'skewX':
        n = [1, 0, Math.tan(((a[0] ?? 0) * Math.PI) / 180), 1, 0, 0];
        break;
      case 'skewY':
        n = [1, Math.tan(((a[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0];
        break;
    }
    m = mul(m, n);
  }
  return m;
}

/* ───────────── Trazados ───────────── */

export interface SubPath {
  pts: Pt[];
  closed: boolean;
}

const CURVE_SEGS = 12;

function arcPoints(
  p0: Pt,
  rx: number,
  ry: number,
  phiDeg: number,
  large: boolean,
  sweep: boolean,
  p1: Pt,
): Pt[] {
  // Conversión de extremo a centro (SVG 1.1, apéndice F.6).
  if (!rx || !ry) return [p1];
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  const phi = (phiDeg * Math.PI) / 180;
  const cs = Math.cos(phi);
  const sn = Math.sin(phi);
  const dx = (p0[0] - p1[0]) / 2;
  const dy = (p0[1] - p1[1]) / 2;
  const x1 = cs * dx + sn * dy;
  const y1 = -sn * dx + cs * dy;
  const lam = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lam > 1) {
    rx *= Math.sqrt(lam);
    ry *= Math.sqrt(lam);
  }
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  let k = Math.sqrt(Math.max(0, num / den));
  if (large === sweep) k = -k;
  const cxp = (k * rx * y1) / ry;
  const cyp = (-k * ry * x1) / rx;
  const cx = cs * cxp - sn * cyp + (p0[0] + p1[0]) / 2;
  const cy = sn * cxp + cs * cyp + (p0[1] + p1[1]) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    return a;
  };
  const t1 = ang(1, 0, (x1 - cxp) / rx, (y1 - cyp) / ry);
  let dt = ang((x1 - cxp) / rx, (y1 - cyp) / ry, (-x1 - cxp) / rx, (-y1 - cyp) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  const n = Math.max(2, Math.ceil(Math.abs(dt) / (Math.PI / 12)));
  const out: Pt[] = [];
  for (let i = 1; i <= n; i++) {
    const t = t1 + (dt * i) / n;
    const x = rx * Math.cos(t);
    const y = ry * Math.sin(t);
    out.push([cs * x - sn * y + cx, sn * x + cs * y + cy]);
  }
  out[out.length - 1] = p1;
  return out;
}

/** Atributo d de un path → subtrazados de segmentos rectos (curvas aproximadas). */
export function parsePath(d: string): SubPath[] {
  const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ?? [];
  const out: SubPath[] = [];
  let cur: SubPath | null = null;
  let p: Pt = [0, 0];
  let start: Pt = [0, 0];
  let lastCtrl: Pt | null = null;
  let lastCmd = '';
  let i = 0;
  let cmd = '';
  const num = () => Number(tokens[i++]);
  const lineTo = (q: Pt) => {
    if (!cur) {
      cur = { pts: [p], closed: false };
      out.push(cur);
    }
    cur.pts.push(q);
    p = q;
  };
  while (i < tokens.length) {
    if (/^[a-zA-Z]$/.test(tokens[i])) cmd = tokens[i++];
    else if (!cmd || cmd.toUpperCase() === 'Z') {
      i++; // número suelto: se ignora
      continue;
    }
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    const at = (x: number, y: number): Pt => (rel ? [p[0] + x, p[1] + y] : [x, y]);
    switch (C) {
      case 'M': {
        const q = at(num(), num());
        cur = { pts: [q], closed: false };
        out.push(cur);
        p = start = q;
        cmd = rel ? 'l' : 'L';
        lastCtrl = null;
        break;
      }
      case 'L':
        lineTo(at(num(), num()));
        lastCtrl = null;
        break;
      case 'H': {
        const x = num();
        lineTo([rel ? p[0] + x : x, p[1]]);
        lastCtrl = null;
        break;
      }
      case 'V': {
        const y = num();
        lineTo([p[0], rel ? p[1] + y : y]);
        lastCtrl = null;
        break;
      }
      case 'C':
      case 'S': {
        let c1: Pt;
        if (C === 'C') c1 = at(num(), num());
        else
          c1 =
            lastCtrl && /[CS]/i.test(lastCmd)
              ? [2 * p[0] - lastCtrl[0], 2 * p[1] - lastCtrl[1]]
              : p;
        const c2 = at(num(), num());
        const e = at(num(), num());
        const p0 = p;
        for (let k = 1; k <= CURVE_SEGS; k++) {
          const t = k / CURVE_SEGS;
          const u = 1 - t;
          lineTo([
            u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * e[0],
            u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * e[1],
          ]);
        }
        lastCtrl = c2;
        break;
      }
      case 'Q':
      case 'T': {
        const c1: Pt =
          C === 'Q'
            ? at(num(), num())
            : lastCtrl && /[QT]/i.test(lastCmd)
              ? [2 * p[0] - lastCtrl[0], 2 * p[1] - lastCtrl[1]]
              : p;
        const e = at(num(), num());
        const p0 = p;
        for (let k = 1; k <= CURVE_SEGS; k++) {
          const t = k / CURVE_SEGS;
          const u = 1 - t;
          lineTo([
            u * u * p0[0] + 2 * u * t * c1[0] + t * t * e[0],
            u * u * p0[1] + 2 * u * t * c1[1] + t * t * e[1],
          ]);
        }
        lastCtrl = c1;
        break;
      }
      case 'A': {
        const rx = num();
        const ry = num();
        const rot = num();
        const large = num() !== 0;
        const sweep = num() !== 0;
        const e = at(num(), num());
        for (const q of arcPoints(p, rx, ry, rot, large, sweep, e)) lineTo(q);
        lastCtrl = null;
        break;
      }
      case 'Z':
        if (cur) cur.closed = true;
        p = start;
        cur = null;
        lastCtrl = null;
        break;
      default:
        i++;
    }
    lastCmd = C;
  }
  return out.filter((s) => s.pts.length > 1);
}

/* ───────────── Entidades ───────────── */

export type Entity =
  | { kind: 'poly'; pts: Pt[]; closed: boolean; color: number; dashed: boolean; layer: string }
  | { kind: 'circle'; c: Pt; r: number; color: number; dashed: boolean; layer: string }
  | { kind: 'disc'; c: Pt; r: number; color: number; layer: string }
  | { kind: 'solid'; pts: Pt[]; color: number; layer: string }
  | {
      kind: 'text';
      at: Pt;
      h: number;
      angle: number;
      align: 0 | 1 | 2;
      text: string;
      color: number;
      layer: string;
    };

/** Colores AutoCAD (ACI) básicos con su RGB. */
const ACI: [number, [number, number, number]][] = [
  [1, [255, 0, 0]],
  [2, [255, 255, 0]],
  [3, [0, 255, 0]],
  [4, [0, 255, 255]],
  [5, [0, 0, 255]],
  [6, [255, 0, 255]],
  [8, [128, 128, 128]],
  [9, [192, 192, 192]],
  [30, [255, 127, 0]],
];

function parseColor(c: string | null): [number, number, number] | null {
  if (!c || c === 'none' || c === 'transparent') return null;
  const s = c.trim().toLowerCase();
  if (s === 'currentcolor' || s === 'black') return [0, 0, 0];
  if (s === 'white') return [255, 255, 255];
  let m = /^#([0-9a-f]{3})$/.exec(s);
  if (m) return [...m[1]].map((h) => parseInt(h + h, 16)) as [number, number, number];
  m = /^#([0-9a-f]{6})/.exec(s);
  if (m)
    return [0, 2, 4].map((k) => parseInt(m![1].slice(k, k + 2), 16)) as [number, number, number];
  m = /^rgba?\(([^)]*)\)/.exec(s);
  if (m)
    return m[1]
      .split(',')
      .slice(0, 3)
      .map((v) => Number(v.trim())) as [number, number, number];
  m = /^hsla?\(\s*([\d.]+)[\s,]+([\d.]+)%[\s,]+([\d.]+)%/.exec(s);
  if (m) {
    const h = Number(m[1]) / 360;
    const sat = Number(m[2]) / 100;
    const l = Number(m[3]) / 100;
    const f = (n: number) => {
      const k = (n + h * 12) % 12;
      return 255 * (l - sat * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1)));
    };
    return [f(0), f(8), f(4)];
  }
  return [0, 0, 0];
}

/** RGB → color ACI; los oscuros y grises de tinta son el 7 (negro sobre blanco). */
export function aci(rgb: [number, number, number]): number {
  const [r, g, b] = rgb;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max < 110 || (max - min < 40 && max < 170)) return 7;
  let best = 7;
  let bd = Infinity;
  for (const [n, c] of ACI) {
    const d = (c[0] - r) ** 2 + (c[1] - g) ** 2 + (c[2] - b) ** 2;
    if (d < bd) {
      bd = d;
      best = n;
    }
  }
  return best;
}

const isWhite = (c: [number, number, number] | null) =>
  !!c && c[0] > 240 && c[1] > 240 && c[2] > 240;

/** Interfaz mínima de un nodo del SVG (vale el DOM del navegador). */
export interface SvgNode {
  tagName: string;
  getAttribute(name: string): string | null;
  children: ArrayLike<SvgNode> | HTMLCollection;
  textContent: string | null;
}

interface Style {
  m: Mat;
  stroke: string | null;
  fill: string | null;
  dash: boolean;
  fontSize: number;
  anchor: string;
  baseline: string;
  layer: string;
}

function attr(n: SvgNode, name: string, style: Record<string, string>) {
  return style[name] ?? n.getAttribute(name);
}

function inlineStyle(n: SvgNode): Record<string, string> {
  const out: Record<string, string> = {};
  for (const decl of (n.getAttribute('style') ?? '').split(';')) {
    const [k, v] = decl.split(':');
    if (k && v) out[k.trim()] = v.trim();
  }
  return out;
}

const num = (s: string | null, d = 0) => (s === null || s === '' ? d : Number.parseFloat(s) || d);

/** SVG → entidades en coordenadas DXF (milímetros, Y hacia arriba). */
export function svgToEntities(root: SvgNode, mmPerUnit = DXF_MM_PER_UNIT): Entity[] {
  const out: Entity[] = [];
  const base: Mat = [mmPerUnit, 0, 0, -mmPerUnit, 0, 0];
  const walk = (n: SvgNode, parent: Style) => {
    const tag = n.tagName.toLowerCase().replace(/^svg:/, '');
    if (['defs', 'title', 'desc', 'clippath', 'marker', 'pattern', 'style'].includes(tag)) return;
    const st = inlineStyle(n);
    if (attr(n, 'display', st) === 'none' || attr(n, 'visibility', st) === 'hidden') return;
    if (n.getAttribute('class')?.split(/\s+/).includes('no-export')) return;
    const s: Style = {
      m: mul(parent.m, parseTransform(n.getAttribute('transform'))),
      stroke: attr(n, 'stroke', st) ?? parent.stroke,
      fill: attr(n, 'fill', st) ?? parent.fill,
      dash: (() => {
        const d = attr(n, 'stroke-dasharray', st);
        return d === null ? parent.dash : d !== 'none' && d !== '0';
      })(),
      fontSize: num(attr(n, 'font-size', st), parent.fontSize),
      anchor: attr(n, 'text-anchor', st) ?? parent.anchor,
      baseline: attr(n, 'dominant-baseline', st) ?? parent.baseline,
      layer: n.getAttribute('data-layer') ?? parent.layer,
    };
    if (num(attr(n, 'opacity', st), 1) === 0) return;
    const stroke = parseColor(s.stroke);
    const fill = parseColor(s.fill);
    const T = (p: Pt) => apply(s.m, p);
    const shape = (subs: SubPath[]) => {
      for (const sp of subs) {
        const pts = sp.pts.map(T);
        if (fill && !isWhite(fill) && (sp.closed || pts.length >= 3)) {
          // Relleno: triángulos y cuadriláteros como SOLID; el resto, en abanico (convexos).
          const ring =
            sp.pts.length > 2 && sameP(pts[0], pts[pts.length - 1]) ? pts.slice(0, -1) : pts;
          for (let k = 1; k + 1 < ring.length; k++)
            out.push({
              kind: 'solid',
              pts: [ring[0], ring[k], ring[k + 1]],
              color: aci(fill),
              layer: s.layer,
            });
        }
        if (stroke && !isWhite(stroke))
          out.push({
            kind: 'poly',
            pts,
            closed: sp.closed,
            color: aci(stroke),
            dashed: s.dash,
            layer: s.layer,
          });
      }
    };
    switch (tag) {
      case 'line':
        shape([
          {
            pts: [
              [num(n.getAttribute('x1')), num(n.getAttribute('y1'))],
              [num(n.getAttribute('x2')), num(n.getAttribute('y2'))],
            ],
            closed: false,
          },
        ]);
        break;
      case 'polyline':
      case 'polygon': {
        const v = (n.getAttribute('points') ?? '')
          .split(/[\s,]+/)
          .filter(Boolean)
          .map(Number);
        const pts: Pt[] = [];
        for (let k = 0; k + 1 < v.length; k += 2) pts.push([v[k], v[k + 1]]);
        if (pts.length > 1) shape([{ pts, closed: tag === 'polygon' }]);
        break;
      }
      case 'rect': {
        const x = num(n.getAttribute('x'));
        const y = num(n.getAttribute('y'));
        const w = num(n.getAttribute('width'));
        const h = num(n.getAttribute('height'));
        if (w > 0 && h > 0)
          shape([
            {
              pts: [
                [x, y],
                [x + w, y],
                [x + w, y + h],
                [x, y + h],
              ],
              closed: true,
            },
          ]);
        break;
      }
      case 'circle':
      case 'ellipse': {
        const cx = num(n.getAttribute('cx'));
        const cy = num(n.getAttribute('cy'));
        const rx = num(n.getAttribute(tag === 'circle' ? 'r' : 'rx'));
        const ry = tag === 'circle' ? rx : num(n.getAttribute('ry'));
        if (rx <= 0 || ry <= 0) break;
        const sx = Math.hypot(s.m[0], s.m[1]);
        const sy = Math.hypot(s.m[2], s.m[3]);
        const c = T([cx, cy]);
        if (Math.abs(rx * sx - ry * sy) < 1e-6) {
          const r = rx * sx;
          if (fill && !isWhite(fill) && !stroke)
            out.push({ kind: 'disc', c, r, color: aci(fill), layer: s.layer });
          else {
            if (fill && !isWhite(fill))
              out.push({ kind: 'disc', c, r, color: aci(fill), layer: s.layer });
            if (stroke && !isWhite(stroke))
              out.push({
                kind: 'circle',
                c,
                r,
                color: aci(stroke),
                dashed: s.dash,
                layer: s.layer,
              });
          }
        } else {
          const pts: Pt[] = [];
          for (let k = 0; k < 48; k++) {
            const t = (k / 48) * 2 * Math.PI;
            pts.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]);
          }
          shape([{ pts, closed: true }]);
        }
        break;
      }
      case 'path':
        shape(parsePath(n.getAttribute('d') ?? ''));
        break;
      case 'text': {
        const text = (n.textContent ?? '').replace(/\s+/g, ' ').trim();
        const color = fill ?? stroke;
        if (!text || !color) break;
        const x = num(n.getAttribute('x'));
        let y = num(n.getAttribute('y'));
        const fs = s.fontSize;
        if (s.baseline === 'middle' || s.baseline === 'central') y += fs * 0.35;
        else if (s.baseline === 'hanging' || s.baseline === 'text-before-edge') y += fs * 0.75;
        const dx = num(n.getAttribute('dx'));
        const dy = num(n.getAttribute('dy'));
        const at = T([x + dx, y + dy]);
        const ux = apply(s.m, [1, 0]);
        const o = apply(s.m, [0, 0]);
        const vx = ux[0] - o[0];
        const vy = ux[1] - o[1];
        let angle = (Math.atan2(vy, vx) * 180) / Math.PI;
        // Un símbolo reflejado no debe dejar el texto al revés.
        if (vx < 0) angle = (angle + 180) % 360;
        let align: 0 | 1 | 2 = s.anchor === 'middle' ? 1 : s.anchor === 'end' ? 2 : 0;
        if (vx < 0 && align !== 1) align = align === 0 ? 2 : 0;
        out.push({
          kind: 'text',
          at,
          h: fs * 0.7 * Math.hypot(vx, vy),
          angle: Math.round(angle * 1000) / 1000,
          align,
          text,
          color: aci(color),
          layer: 'TEXTOS',
        });
        return; // los tspan ya van en textContent
      }
    }
    for (const ch of Array.from(n.children as ArrayLike<SvgNode>)) walk(ch, s);
  };
  walk(root, {
    m: base,
    stroke: null,
    fill: '#000',
    dash: false,
    fontSize: 10,
    anchor: 'start',
    baseline: 'auto',
    layer: 'ESQUEMA',
  });
  return out;
}

const sameP = (a: Pt, b: Pt) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;

/* ───────────── Escritura ───────────── */

const LAYERS: [string, number][] = [
  ['0', 7],
  ['ESQUEMA', 7],
  ['TUBERIAS', 5],
  ['CABLES', 1],
  ['TEXTOS', 7],
];

/** Textos en ASCII (R12 no lleva UTF-8): acentos con el código %%nnn de AutoCAD. */
function dxfText(s: string): string {
  return [...s]
    .map((ch) => {
      const c = ch.charCodeAt(0);
      if (c < 128) return ch;
      if (c < 256) return `%%${String(c).padStart(3, '0')}`;
      return ch === '−' ? '-' : '?';
    })
    .join('');
}

export function toDxf(entities: Entity[]): string {
  const L: string[] = [];
  const g = (code: number, v: string | number) => {
    L.push(String(code), typeof v === 'number' ? fmt(v) : v);
  };
  const fmt = (v: number) =>
    Number.isInteger(v) ? String(v) : String(Math.round(v * 10000) / 10000);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const ext = (p: Pt) => {
    x0 = Math.min(x0, p[0]);
    y0 = Math.min(y0, p[1]);
    x1 = Math.max(x1, p[0]);
    y1 = Math.max(y1, p[1]);
  };
  for (const e of entities) {
    if (e.kind === 'poly' || e.kind === 'solid') e.pts.forEach(ext);
    else if (e.kind === 'text') ext(e.at);
    else {
      ext([e.c[0] - e.r, e.c[1] - e.r]);
      ext([e.c[0] + e.r, e.c[1] + e.r]);
    }
  }
  if (!Number.isFinite(x0)) x0 = y0 = x1 = y1 = 0;

  g(0, 'SECTION');
  g(2, 'HEADER');
  g(9, '$ACADVER');
  g(1, 'AC1009');
  g(9, '$INSBASE');
  g(10, 0);
  g(20, 0);
  g(30, 0);
  g(9, '$EXTMIN');
  g(10, x0);
  g(20, y0);
  g(30, 0);
  g(9, '$EXTMAX');
  g(10, x1);
  g(20, y1);
  g(30, 0);
  g(9, '$MEASUREMENT');
  g(70, 1);
  g(0, 'ENDSEC');

  g(0, 'SECTION');
  g(2, 'TABLES');
  g(0, 'TABLE');
  g(2, 'LTYPE');
  g(70, 2);
  g(0, 'LTYPE');
  g(2, 'CONTINUOUS');
  g(70, 0);
  g(3, 'Solid line');
  g(72, 65);
  g(73, 0);
  g(40, 0);
  g(0, 'LTYPE');
  g(2, 'DASHED');
  g(70, 0);
  g(3, '__ __ __ __');
  g(72, 65);
  g(73, 2);
  g(40, 3);
  g(49, 2);
  g(49, -1);
  g(0, 'ENDTAB');
  g(0, 'TABLE');
  g(2, 'LAYER');
  g(70, LAYERS.length);
  for (const [name, color] of LAYERS) {
    g(0, 'LAYER');
    g(2, name);
    g(70, 0);
    g(62, color);
    g(6, 'CONTINUOUS');
  }
  g(0, 'ENDTAB');
  g(0, 'TABLE');
  g(2, 'STYLE');
  g(70, 1);
  g(0, 'STYLE');
  g(2, 'STANDARD');
  g(70, 0);
  g(40, 0);
  g(41, 1);
  g(50, 0);
  g(71, 0);
  g(42, 2.5);
  g(3, 'txt');
  g(4, '');
  g(0, 'ENDTAB');
  g(0, 'ENDSEC');

  g(0, 'SECTION');
  g(2, 'ENTITIES');
  const head = (type: string, layer: string, color: number, dashed = false) => {
    g(0, type);
    g(8, layer);
    if (dashed) g(6, 'DASHED');
    g(62, color);
  };
  for (const e of entities) {
    switch (e.kind) {
      case 'poly':
        if (e.pts.length === 2 && !e.closed) {
          head('LINE', e.layer, e.color, e.dashed);
          g(10, e.pts[0][0]);
          g(20, e.pts[0][1]);
          g(30, 0);
          g(11, e.pts[1][0]);
          g(21, e.pts[1][1]);
          g(31, 0);
        } else {
          head('POLYLINE', e.layer, e.color, e.dashed);
          g(66, 1);
          g(10, 0);
          g(20, 0);
          g(30, 0);
          g(70, e.closed ? 1 : 0);
          const pts =
            e.closed && e.pts.length > 2 && sameP(e.pts[0], e.pts[e.pts.length - 1])
              ? e.pts.slice(0, -1)
              : e.pts;
          for (const p of pts) {
            g(0, 'VERTEX');
            g(8, e.layer);
            g(10, p[0]);
            g(20, p[1]);
            g(30, 0);
          }
          g(0, 'SEQEND');
          g(8, e.layer);
        }
        break;
      case 'circle':
        head('CIRCLE', e.layer, e.color, e.dashed);
        g(10, e.c[0]);
        g(20, e.c[1]);
        g(30, 0);
        g(40, e.r);
        break;
      case 'disc':
        // Círculo relleno: polilínea de dos arcos (bulge 1) con anchura igual al radio.
        head('POLYLINE', e.layer, e.color);
        g(66, 1);
        g(10, 0);
        g(20, 0);
        g(30, 0);
        g(70, 1);
        g(40, e.r);
        g(41, e.r);
        for (const sx of [-1, 1]) {
          g(0, 'VERTEX');
          g(8, e.layer);
          g(10, e.c[0] + (sx * e.r) / 2);
          g(20, e.c[1]);
          g(30, 0);
          g(40, e.r);
          g(41, e.r);
          g(42, 1);
        }
        g(0, 'SEQEND');
        g(8, e.layer);
        break;
      case 'solid': {
        head('SOLID', e.layer, e.color);
        // SOLID usa el orden 1-2-4-3; con un triángulo el cuarto vértice repite el tercero.
        const [a, b, c] = e.pts;
        const d = e.pts[3] ?? c;
        g(10, a[0]);
        g(20, a[1]);
        g(30, 0);
        g(11, b[0]);
        g(21, b[1]);
        g(31, 0);
        g(12, d[0]);
        g(22, d[1]);
        g(32, 0);
        g(13, c[0]);
        g(23, c[1]);
        g(33, 0);
        break;
      }
      case 'text':
        head('TEXT', e.layer, e.color);
        g(10, e.at[0]);
        g(20, e.at[1]);
        g(30, 0);
        g(40, e.h);
        g(1, dxfText(e.text));
        if (e.angle) g(50, e.angle);
        if (e.align) {
          g(72, e.align);
          g(11, e.at[0]);
          g(21, e.at[1]);
          g(31, 0);
        }
        break;
    }
  }
  g(0, 'ENDSEC');
  g(0, 'EOF');
  return L.join('\r\n') + '\r\n';
}

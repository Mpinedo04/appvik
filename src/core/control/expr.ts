/**
 * Expresiones booleanas de las receptividades del GRAFCET y de los segmentos de contactos.
 *
 *   variables   S1, 1B2, I0.1, Q0.0, M0.3, K1, T1, C1, X3 (etapa 3 activa)
 *   negación    !S1   ¬S1   /S1
 *   Y           S1 · 1B1   S1 * 1B1   S1 & 1B1   (también yuxtapuestas con espacio: «S1 1B1»)
 *   O           S1 + S2    S1 | S2
 *   flanco      ↑S1  ^S1   (subida)     ↓S1  (bajada)
 *   tiempo      t/X3/2s    (la etapa 3 lleva activa al menos 2 s; también 500ms)
 *   constantes  1  0  (=1 en la receptividad: siempre verdadera)
 */

export type Expr =
  | { k: 'const'; v: boolean }
  | { k: 'var'; name: string }
  | { k: 'not'; e: Expr }
  | { k: 'and'; a: Expr[] }
  | { k: 'or'; a: Expr[] }
  | { k: 'edge'; name: string; up: boolean }
  | { k: 'time'; step: number; seconds: number };

export interface ExprEnv {
  value(name: string): boolean;
  /** Flanco de una variable en este ciclo. */
  edge(name: string, up: boolean): boolean;
  /** Tiempo que lleva activa la etapa n [s] (−1 si no está activa). */
  stepTime(n: number): number;
}

type Tok = { t: 'id' | 'op' | '(' | ')' | 'time'; v: string };

const ID = /[A-Za-z0-9_.]/;

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  const s = src.replace(/^=\s*/, '');
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    const time = /^t\s*\/\s*X(\d+)\s*\/\s*(\d+(?:[.,]\d+)?)\s*(ms|s)?/i.exec(s.slice(i));
    if (time) {
      out.push({ t: 'time', v: time[0] });
      i += time[0].length;
      continue;
    }
    if (c === '(' || c === ')') {
      out.push({ t: c, v: c });
      i++;
      continue;
    }
    if ('!¬/·*&+|↑^↓'.includes(c)) {
      out.push({ t: 'op', v: c });
      i++;
      continue;
    }
    if (ID.test(c)) {
      let j = i;
      while (j < s.length && ID.test(s[j])) j++;
      out.push({ t: 'id', v: s.slice(i, j) });
      i = j;
      continue;
    }
    throw new Error(`Carácter no válido «${c}»`);
  }
  return out;
}

/** Analiza una expresión. Lanza un Error con un mensaje en español si no es válida. */
export function parseExpr(src: string): Expr {
  const toks = tokenize(src);
  if (!toks.length) throw new Error('La expresión está vacía.');
  let i = 0;
  const peek = () => toks[i];
  const isAnd = (t?: Tok) => t?.t === 'op' && '·*&'.includes(t.v);
  const isOr = (t?: Tok) => t?.t === 'op' && '+|'.includes(t.v);
  // Empieza un factor (para la Y por yuxtaposición).
  const startsFactor = (t?: Tok) =>
    !!t &&
    (t.t === 'id' || t.t === '(' || t.t === 'time' || (t.t === 'op' && '!¬/↑^↓'.includes(t.v)));

  const or = (): Expr => {
    const a = [and()];
    while (isOr(peek())) {
      i++;
      a.push(and());
    }
    return a.length === 1 ? a[0] : { k: 'or', a };
  };
  const and = (): Expr => {
    const a = [factor()];
    for (;;) {
      if (isAnd(peek())) {
        i++;
        a.push(factor());
      } else if (startsFactor(peek())) a.push(factor());
      else break;
    }
    return a.length === 1 ? a[0] : { k: 'and', a };
  };
  const factor = (): Expr => {
    const t = peek();
    if (!t) throw new Error('Falta un operando al final.');
    i++;
    if (t.t === 'op' && '!¬/'.includes(t.v)) return { k: 'not', e: factor() };
    if (t.t === 'op' && '↑^↓'.includes(t.v)) {
      const n = peek();
      if (n?.t !== 'id') throw new Error(`Después de «${t.v}» va una variable.`);
      i++;
      return { k: 'edge', name: n.v, up: t.v !== '↓' };
    }
    if (t.t === '(') {
      const e = or();
      if (peek()?.t !== ')') throw new Error('Falta cerrar un paréntesis.');
      i++;
      return e;
    }
    if (t.t === 'time') {
      const m = /X(\d+)\s*\/\s*(\d+(?:[.,]\d+)?)\s*(ms|s)?/i.exec(t.v)!;
      const v = Number(m[2].replace(',', '.'));
      return {
        k: 'time',
        step: Number(m[1]),
        seconds: m[3]?.toLowerCase() === 'ms' ? v / 1000 : v,
      };
    }
    if (t.t === 'id') {
      if (t.v === '1' || t.v === '0') return { k: 'const', v: t.v === '1' };
      return { k: 'var', name: t.v };
    }
    throw new Error(`No se esperaba «${t.v}».`);
  };

  const e = or();
  if (i < toks.length) throw new Error(`No se esperaba «${toks[i].v}».`);
  return e;
}

export function evalExpr(e: Expr, env: ExprEnv): boolean {
  switch (e.k) {
    case 'const':
      return e.v;
    case 'var':
      return env.value(e.name);
    case 'not':
      return !evalExpr(e.e, env);
    case 'and':
      return e.a.every((x) => evalExpr(x, env));
    case 'or':
      return e.a.some((x) => evalExpr(x, env));
    case 'edge':
      return env.edge(e.name, e.up);
    case 'time':
      return env.stepTime(e.step) >= e.seconds;
  }
}

/** Variables que usa una expresión (para los flancos y la ayuda del editor). */
export function exprVars(e: Expr, out = new Set<string>()): Set<string> {
  if (e.k === 'var' || e.k === 'edge') out.add(e.name);
  else if (e.k === 'not') exprVars(e.e, out);
  else if (e.k === 'and' || e.k === 'or') e.a.forEach((x) => exprVars(x, out));
  return out;
}

/** Comprueba una expresión: null si es válida, o el mensaje de error. */
export function exprError(src: string): string | null {
  try {
    parseExpr(src);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

/** Texto canónico de una expresión (para mostrarla). */
export function exprText(e: Expr): string {
  switch (e.k) {
    case 'const':
      return e.v ? '1' : '0';
    case 'var':
      return e.name;
    case 'not':
      return `¬${e.e.k === 'var' ? exprText(e.e) : `(${exprText(e.e)})`}`;
    case 'and':
      return e.a.map((x) => (x.k === 'or' ? `(${exprText(x)})` : exprText(x))).join(' · ');
    case 'or':
      return e.a.map(exprText).join(' + ');
    case 'edge':
      return `${e.up ? '↑' : '↓'}${e.name}`;
    case 'time':
      return `t/X${e.step}/${e.seconds}s`;
  }
}

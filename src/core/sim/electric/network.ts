/**
 * Red eléctrica de mando (24 V DC), resuelta por conectividad como en los simuladores
 * didácticos: los cables y los contactos cerrados unen nodos; una carga (bobina, lámpara) está
 * energizada si uno de sus bornes llega a +24 V y el otro a 0 V. Las cargas no conducen: dos
 * cargas en serie no se encienden (no se calculan corrientes ni tensiones intermedias).
 *
 * Sólo se resuelve de nuevo cuando cambia algún contacto.
 */

export type RailKind = '+24' | '0';

/** Nivel de un nodo: +1 = +24 V, −1 = 0 V, 0 = sin tensión (flotante). */
export type Level = 1 | -1 | 0;

export class ElectricNetwork {
  nodeCount = 0;
  readonly contacts: { a: number; b: number; closed: boolean }[] = [];
  readonly loads: { a: number; b: number }[] = [];
  readonly rails: { node: number; kind: RailKind }[] = [];
  /** Resultado de la última resolución. */
  energized: boolean[] = [];
  level: Level[] = [];
  /** +24 V y 0 V unidos sin carga entre medias. */
  short = false;
  private dirty = true;

  addNode() {
    return this.nodeCount++;
  }

  addContact(a: number, b: number, closed = false) {
    this.contacts.push({ a, b, closed });
    this.dirty = true;
    return this.contacts.length - 1;
  }

  addLoad(a: number, b: number) {
    this.loads.push({ a, b });
    this.dirty = true;
    return this.loads.length - 1;
  }

  addRail(node: number, kind: RailKind) {
    this.rails.push({ node, kind });
    this.dirty = true;
  }

  setContact(i: number, closed: boolean) {
    const c = this.contacts[i];
    if (c.closed !== closed) {
      c.closed = closed;
      this.dirty = true;
    }
  }

  /** Resuelve la red si ha cambiado algo desde la última vez. */
  solve() {
    if (!this.dirty) return;
    this.dirty = false;
    const parent = Array.from({ length: this.nodeCount }, (_, i) => i);
    const find = (x: number): number => {
      while (parent[x] !== x) {
        parent[x] = parent[parent[x]];
        x = parent[x];
      }
      return x;
    };
    for (const c of this.contacts) {
      if (!c.closed) continue;
      const ra = find(c.a);
      const rb = find(c.b);
      if (ra !== rb) parent[ra] = rb;
    }
    const plus = new Set<number>();
    const zero = new Set<number>();
    for (const r of this.rails) (r.kind === '+24' ? plus : zero).add(find(r.node));
    this.short = [...plus].some((r) => zero.has(r));
    this.level = Array.from({ length: this.nodeCount }, (_, n) => {
      const r = find(n);
      return plus.has(r) ? 1 : zero.has(r) ? -1 : 0;
    });
    this.energized = this.loads.map(({ a, b }) => {
      if (this.short) return false;
      const la = this.level[a];
      const lb = this.level[b];
      return la * lb === -1;
    });
  }
}

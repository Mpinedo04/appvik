/**
 * Autómata programable (PLC) compacto de 8 entradas y 8 salidas a 24 V. Se alimenta por L+ y M;
 * una entrada I0.x está a 1 si su borne recibe +24 V, y cada salida Q0.x es un contacto entre
 * L+ y su borne (alimenta bobinas y lámparas del esquema eléctrico). El programa es el GRAFCET
 * o el esquema de contactos del proyecto; ejecuta un ciclo cada «tiempo de ciclo».
 */
import { num, str, type ComponentModel, type PortDef } from '../../core/registry';
import { GrafcetRuntime, type ControlIO } from '../../core/control/grafcet';
import { LadderRuntime } from '../../core/control/ladder';

export const PLC_IO = 8;
export const plcInputX = (i: number) => -70 + i * 20;

const E = (id: string, x: number, y: number, dir: PortDef['dir']): PortDef => ({
  id,
  medium: 'elec',
  x,
  y,
  dir,
  label: id,
});

export interface PlcState {
  powered: boolean;
  inputs: boolean[];
  outputs: boolean[];
  /** Errores del programa (receptividades o segmentos no válidos). */
  errors: string[];
  /** Tiempo hasta el siguiente ciclo. */
  wait: number;
}

interface PlcHandles {
  L: number;
  M: number;
  inputs: number[];
  outputs: number[];
  grafcet: GrafcetRuntime | null;
  ladder: LadderRuntime | null;
}

export const plcModel: ComponentModel<PlcState, PlcHandles> = {
  type: 'ctrl-plc',
  category: 'control',
  name: 'Autómata programable (PLC)',
  description:
    'PLC de 8 entradas (I0.0–I0.7) y 8 salidas (Q0.0–Q0.7) a 24 V. Se programa con el GRAFCET o con el esquema de contactos del proyecto (pestañas de la barra superior).',
  autoLabel: (n) => `PLC${n}`,
  params: [
    {
      key: 'program',
      label: 'Programa',
      type: 'select',
      default: 'ladder',
      options: [
        { value: 'ladder', label: 'Esquema de contactos' },
        { value: 'grafcet', label: 'GRAFCET' },
      ],
    },
    {
      key: 'cycle',
      label: 'Tiempo de ciclo',
      unit: 'ms',
      type: 'number',
      default: 1,
      min: 0.1,
      max: 100,
      step: 0.1,
    },
  ],
  ports: () => [
    E('L+', -90, -40, 'up'),
    ...Array.from({ length: PLC_IO }, (_, i) => E(`I0.${i}`, plcInputX(i), -40, 'up')),
    E('M', -90, 40, 'down'),
    ...Array.from({ length: PLC_IO }, (_, i) => E(`Q0.${i}`, plcInputX(i), 40, 'down')),
  ],
  bbox: () => ({ x0: -100, y0: -40, x1: 90, y1: 40 }),
  initState: () => ({
    powered: false,
    inputs: Array(PLC_IO).fill(false),
    outputs: Array(PLC_IO).fill(false),
    errors: [],
    wait: 0,
  }),
  build(b, p) {
    const L = b.ePort('L+');
    const grafcet = str(p, 'program') === 'grafcet' ? b.program('grafcet') : undefined;
    const ladder = str(p, 'program') === 'ladder' ? b.program('ladder') : undefined;
    return {
      L,
      M: b.ePort('M'),
      inputs: Array.from({ length: PLC_IO }, (_, i) => b.ePort(`I0.${i}`)),
      outputs: Array.from({ length: PLC_IO }, (_, i) => b.addContact(L, b.ePort(`Q0.${i}`))),
      grafcet: grafcet && Object.keys(grafcet.steps).length ? new GrafcetRuntime(grafcet) : null,
      ladder: ladder?.rungs.length ? new LadderRuntime(ladder) : null,
    };
  },
  update(ctx, s, h, p, dt) {
    s.powered = ctx.eLevel(h.L) === 1 && ctx.eLevel(h.M) === -1;
    s.errors = [...(h.grafcet?.errors() ?? []), ...(h.ladder?.errors() ?? [])].map(
      (e) => e.message,
    );
    s.wait -= dt;
    if (s.wait <= 0) {
      const cycle = num(p, 'cycle') / 1000;
      s.wait += cycle;
      for (let i = 0; i < PLC_IO; i++) s.inputs[i] = s.powered && ctx.eLevel(h.inputs[i]) === 1;
      const next = Array(PLC_IO).fill(false);
      const io: ControlIO = {
        read: (n) => {
          const m = /^([IQ])0\.([0-7])$/.exec(n);
          if (m) return m[1] === 'I' ? s.inputs[Number(m[2])] : s.outputs[Number(m[2])];
          return ctx.signal(n) > 0;
        },
        write: (n) => {
          const m = /^Q0\.([0-7])$/.exec(n);
          if (m) next[Number(m[1])] = true;
          else ctx.setSignal(n, 1);
        },
      };
      if (s.powered) {
        if (h.grafcet) ctx.publishControl({ grafcet: h.grafcet.cycle(ctx.t, io) });
        if (h.ladder) ctx.publishControl({ ladder: h.ladder.cycle(Math.max(cycle, dt), io) });
      } else h.grafcet?.reset(ctx.t);
      s.outputs = next;
    }
    h.outputs.forEach((c, i) => ctx.setContact(c, s.powered && s.outputs[i]));
  },
  explain(s, p) {
    if (!s.powered) return ['Sin alimentación: conecta L+ a +24 V y M a 0 V.'];
    const on = (arr: boolean[], pre: string) =>
      arr
        .map((v, i) => (v ? `${pre}0.${i}` : ''))
        .filter(Boolean)
        .join(', ') || 'ninguna';
    const lines = [
      `Programa: ${str(p, 'program') === 'grafcet' ? 'GRAFCET' : 'esquema de contactos'}, ciclo de ${num(p, 'cycle')} ms.`,
      `Entradas a 1: ${on(s.inputs, 'I')}.`,
      `Salidas a 1: ${on(s.outputs, 'Q')}.`,
    ];
    if (s.errors.length) lines.push(`Errores en el programa: ${s.errors.join(' · ')}`);
    return lines;
  },
};

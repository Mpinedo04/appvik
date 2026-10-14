/**
 * Motor de simulación: bucle de paso fijo desacoplado del renderizado.
 * No depende de React; la interfaz sólo consume instantáneas (SimSnapshot).
 */
import type { Circuit, ComponentInstance, Params } from '../model/types';
import {
  getModel,
  resolveParams,
  type ComponentModel,
  type StepCtx,
  type UserAction,
} from '../registry';
import {
  compileElectricNets,
  compileFluidNets,
  portKey,
  type CompiledElectric,
  type CompiledNets,
} from './compiler';
import { ElectricNetwork } from './electric/network';
import { FluidNetwork } from './fluid/network';
import type { Recorder } from './recorder';

/** Copia del estado con un nivel de profundidad (los estados son planos o casi planos). */
function cloneState(s: any): any {
  const out: any = {};
  for (const k in s) {
    const v = s[k];
    out[k] = Array.isArray(v) ? v.slice() : v && typeof v === 'object' ? { ...v } : v;
  }
  return out;
}

/** Paso de integración por defecto [s]. */
export const DEFAULT_DT = 1e-4;

interface Instance {
  inst: ComponentInstance;
  model: ComponentModel;
  params: Params;
  state: any;
  handles: any;
}

export interface SimSnapshot {
  t: number;
  /** Estado interno de cada componente (copia). */
  comp: Record<string, any>;
  /** Presión absoluta por nodo [Pa]. */
  nodeP: number[];
  portNode: Record<string, number>;
  connNode: Record<string, number>;
  junctionNode: Record<string, number>;
  /** Caudal másico por orificio [kg/s]. */
  orificeFlow: number[];
  /** Caudal másico por puerto `${comp}:${port}` [kg/s], positivo hacia el interior del componente. */
  portFlow: Record<string, number>;
  /** Señales publicadas por los componentes (finales de carrera, etc.). */
  signals: Record<string, number>;
  /** Red eléctrica: nivel de cada cable y derivación (+1 = +24 V, −1 = 0 V, 0 = sin tensión). */
  elec: {
    connLevel: Record<string, number>;
    junctionLevel: Record<string, number>;
    short: boolean;
  };
}

/** Orificio de un componente que toca uno de sus puertos (para medir el caudal por puerto). */
interface PortTap {
  key: string;
  orifice: number;
  /** +1 si el orificio sale del nodo del puerto hacia el componente, −1 al revés. */
  sign: 1 | -1;
}

export class Simulation {
  readonly net = new FluidNetwork();
  readonly nets: CompiledNets;
  readonly enet = new ElectricNetwork();
  readonly enets: CompiledElectric;
  readonly instances: Instance[] = [];
  private byId = new Map<string, Instance>();
  t = 0;
  dt: number;
  private ctx: StepCtx;
  private taps: PortTap[] = [];
  /** Grabador opcional para los diagramas. */
  recorder: Recorder | null = null;
  /** Señales legibles en este paso (las publicadas en el paso anterior). */
  private signals = new Map<string, number>();
  private nextSignals = new Map<string, number>();

  constructor(circuit: Circuit, opts: { dt?: number } = {}) {
    this.dt = opts.dt ?? DEFAULT_DT;
    this.nets = compileFluidNets(circuit, this.net);
    this.enets = compileElectricNets(circuit, this.enet);
    const net = this.net;
    const enet = this.enet;

    for (const inst of Object.values(circuit.components)) {
      const model = getModel(inst.type);
      const params = resolveParams(model, inst.params);
      // Nodo → puerto de este componente, para saber qué orificios miden el caudal de cada puerto.
      const nodePort = new Map<number, string>();
      for (const pd of model.ports(params)) {
        const n = this.nets.portNode.get(portKey(inst.id, pd.id));
        if (n !== undefined) nodePort.set(n, portKey(inst.id, pd.id));
      }
      const handles = model.build(
        {
          port: (portId) => {
            const n = this.nets.portNode.get(portKey(inst.id, portId));
            if (n === undefined) throw new Error(`Puerto ${portId} no existe en ${inst.label}`);
            return n;
          },
          addNode: (o) => net.addNode(o),
          atmosphere: net.atmosphere,
          addOrifice: (a, b, o) => {
            const index =
              'K' in o
                ? net.addOrifice(a, b, o.K, 0, o.name ?? `${inst.label}`, 'oil')
                : net.addOrifice(a, b, o.C, o.b ?? 0.3, o.name ?? `${inst.label}`);
            const ka = nodePort.get(a);
            const kb = nodePort.get(b);
            if (ka) this.taps.push({ key: ka, orifice: index, sign: 1 });
            if (kb) this.taps.push({ key: kb, orifice: index, sign: -1 });
            return index;
          },
          addSource: (a, b) => net.addSource(a, b, inst.label),
          addBaseVolume: (n, v) => {
            net.nodes[n].baseVolume += v;
          },
          label: inst.label,
          ePort: (portId) => {
            const n = this.enets.portNode.get(portKey(inst.id, portId));
            if (n === undefined) throw new Error(`Borne ${portId} no existe en ${inst.label}`);
            return n;
          },
          addContact: (a, b) => enet.addContact(a, b),
          addLoad: (a, b) => enet.addLoad(a, b),
          addRail: (n, kind) => enet.addRail(n, kind),
        },
        params,
      );
      const it: Instance = { inst, model, params, state: model.initState(params), handles };
      this.instances.push(it);
      this.byId.set(inst.id, it);
    }

    this.ctx = {
      t: 0,
      p: (n) => net.nodes[n].p,
      setOpening: (o, f) => {
        net.orifices[o].opening = f;
      },
      addVolume: (n, v) => {
        net.nodes[n].dynVolume += v;
      },
      massFlow: (o) => net.orifices[o].mdot,
      setSource: (i, mdot) => {
        net.sources[i].mdot = mdot;
      },
      dpdV: (n) => net.dpdV(n),
      storedOil: (n) => net.storedOil(n),
      signal: (name) => this.signals.get(name) ?? 0,
      setSignal: (name, v) => {
        this.nextSignals.set(name, typeof v === 'boolean' ? (v ? 1 : 0) : v);
      },
      setContact: (i, closed) => enet.setContact(i, closed),
      energized: (i) => enet.energized[i] ?? false,
    };

    // Paso de inicialización (dt = 0) para fijar volúmenes y aperturas iniciales.
    net.beginStep();
    for (const it of this.instances) it.model.update(this.ctx, it.state, it.handles, it.params, 0);
    this.swapSignals();
    enet.solve();
    net.initMasses();
  }

  private swapSignals() {
    const read = this.signals;
    this.signals = this.nextSignals;
    this.nextSignals = read;
    this.nextSignals.clear();
  }

  step() {
    const { net, dt } = this;
    (this.ctx as { t: number }).t = this.t;
    net.beginStep();
    for (const it of this.instances) it.model.update(this.ctx, it.state, it.handles, it.params, dt);
    // Las señales y la red eléctrica se leen en el paso siguiente (0,1 ms después): así el orden
    // de los componentes no importa y las autorretenciones se mantienen sin bucles.
    this.swapSignals();
    this.enet.solve();
    net.integrate(dt);
    this.t += dt;
    this.recorder?.maybeSample(this.t, (id) => this.byId.get(id)?.state);
  }

  /** Avanza `seconds` de tiempo simulado. */
  advance(seconds: number) {
    const n = Math.round(seconds / this.dt);
    for (let i = 0; i < n; i++) this.step();
  }

  userAction(compId: string, action: UserAction, side?: 'left' | 'right') {
    const it = this.byId.get(compId);
    it?.model.onUserAction?.(it.state, it.params, action, side);
  }

  state(compId: string): any {
    return this.byId.get(compId)?.state;
  }

  portPressure(compId: string, portId: string): number {
    const n = this.nets.portNode.get(portKey(compId, portId));
    return n === undefined ? NaN : this.net.nodes[n].p;
  }

  explain(compId: string): string[] {
    const it = this.byId.get(compId);
    if (!it) return [];
    return it.model.explain(it.state, it.params, { p: (port) => this.portPressure(compId, port) });
  }

  /** Caudal másico por puerto [kg/s], positivo hacia el componente. */
  portFlows(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const tap of this.taps)
      out[tap.key] = (out[tap.key] ?? 0) + tap.sign * this.net.orifices[tap.orifice].mdot;
    return out;
  }

  signal(name: string): number {
    return this.signals.get(name) ?? 0;
  }

  snapshot(): SimSnapshot {
    const comp: Record<string, any> = {};
    for (const it of this.instances) comp[it.inst.id] = cloneState(it.state);
    const level = this.enet.level;
    const levels = (m: Map<string, number>) =>
      Object.fromEntries([...m].map(([k, n]) => [k, level[n] ?? 0]));
    return {
      t: this.t,
      comp,
      nodeP: this.net.nodes.map((n) => n.p),
      portNode: Object.fromEntries(this.nets.portNode),
      connNode: Object.fromEntries(this.nets.connNode),
      junctionNode: Object.fromEntries(this.nets.junctionNode),
      orificeFlow: this.net.orifices.map((o) => o.mdot),
      portFlow: this.portFlows(),
      signals: Object.fromEntries(this.signals),
      elec: {
        connLevel: levels(this.enets.connNode),
        junctionLevel: levels(this.enets.junctionNode),
        short: this.enet.short,
      },
    };
  }
}

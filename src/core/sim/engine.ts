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
import { compileFluidNets, portKey, type CompiledNets } from './compiler';
import { FluidNetwork } from './fluid/network';

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
}

export class Simulation {
  readonly net = new FluidNetwork();
  readonly nets: CompiledNets;
  readonly instances: Instance[] = [];
  private byId = new Map<string, Instance>();
  t = 0;
  dt: number;
  private ctx: StepCtx;

  constructor(circuit: Circuit, opts: { dt?: number } = {}) {
    this.dt = opts.dt ?? DEFAULT_DT;
    this.nets = compileFluidNets(circuit, this.net);
    const net = this.net;

    for (const inst of Object.values(circuit.components)) {
      const model = getModel(inst.type);
      const params = resolveParams(model, inst.params);
      const handles = model.build(
        {
          port: (portId) => {
            const n = this.nets.portNode.get(portKey(inst.id, portId));
            if (n === undefined) throw new Error(`Puerto ${portId} no existe en ${inst.label}`);
            return n;
          },
          addNode: (o) => net.addNode(o),
          atmosphere: net.atmosphere,
          addOrifice: (a, b, o) => net.addOrifice(a, b, o.C, o.b ?? 0.3, o.name ?? `${inst.label}`),
          addBaseVolume: (n, v) => {
            net.nodes[n].baseVolume += v;
          },
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
    };

    // Paso de inicialización (dt = 0) para fijar volúmenes y aperturas iniciales.
    net.beginStep();
    for (const it of this.instances) it.model.update(this.ctx, it.state, it.handles, it.params, 0);
    net.initMasses();
  }

  step() {
    const { net, dt } = this;
    (this.ctx as { t: number }).t = this.t;
    net.beginStep();
    for (const it of this.instances) it.model.update(this.ctx, it.state, it.handles, it.params, dt);
    net.integrate(dt);
    this.t += dt;
  }

  /** Avanza `seconds` de tiempo simulado. */
  advance(seconds: number) {
    const n = Math.round(seconds / this.dt);
    for (let i = 0; i < n; i++) this.step();
  }

  userAction(compId: string, action: UserAction) {
    const it = this.byId.get(compId);
    it?.model.onUserAction?.(it.state, it.params, action);
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

  snapshot(): SimSnapshot {
    const comp: Record<string, any> = {};
    for (const it of this.instances) comp[it.inst.id] = cloneState(it.state);
    return {
      t: this.t,
      comp,
      nodeP: this.net.nodes.map((n) => n.p),
      portNode: Object.fromEntries(this.nets.portNode),
      connNode: Object.fromEntries(this.nets.connNode),
      junctionNode: Object.fromEntries(this.nets.junctionNode),
      orificeFlow: this.net.orifices.map((o) => o.mdot),
    };
  }
}

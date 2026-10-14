/** Señales que un GRAFCET o un esquema de contactos puede leer o activar en un circuito. */
import { parseMarks } from '../components/pneumatic/cylinder-core';
import type { Circuit } from '../core/model/types';
import { getModel, resolveParams } from '../core/registry';

export function availableSignals(circuit: Circuit): string[] {
  const out = new Set<string>();
  for (const c of Object.values(circuit.components)) {
    const m = getModel(c.type);
    const p = resolveParams(m, c.params);
    if (p.marks) for (const mk of parseMarks(String(p.marks))) out.add(mk.label);
    if (String(p.actLeft).startsWith('solenoid')) out.add(String(p.solLeft));
    if (String(p.actRight).startsWith('solenoid')) out.add(String(p.solRight));
    if (['elec-button-no', 'elec-button-nc', 'elec-switch', 'elec-estop'].includes(c.type))
      out.add(c.label);
    if (c.type === 'ctrl-plc') {
      for (let i = 0; i < 8; i++) out.add(`I0.${i}`);
      for (let i = 0; i < 8; i++) out.add(`Q0.${i}`);
    }
  }
  return [...out].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
}

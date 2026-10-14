/**
 * Circuitos de ejemplo construidos por código. `scripts/gen-examples.ts` los guarda como JSON
 * (lo que carga la aplicación) y los tests los usan directamente.
 */
import { CircuitBuilder } from '../core/model/builder';
import { getModel, resolveParams } from '../core/registry';
import type { Circuit } from '../core/model/types';

export interface ExampleDef {
  file: string;
  name: string;
  description: string;
  build: () => Circuit;
}

/** 01 · Mando directo de un cilindro de doble efecto. */
function directControl() {
  const b = new CircuitBuilder();
  const cyl = b.add('pneu-cyl-double', 300, 120);
  const valve = b.add('pneu-valve-52', 270, 260);
  const src = b.add('pneu-supply', 300, 400);
  const gauge = b.add('pneu-gauge', 450, 270);
  b.connect(valve, '4', cyl, '1');
  b.connect(valve, '2', cyl, '2');
  const feed = b.connect(src, '1', valve, '1');
  b.tee(feed, 300, 330, gauge, '1');
  return b.renumber().circuit;
}

/** 02 · Mando indirecto: el pulsador pilota una 5/2. */
function indirectControl() {
  const b = new CircuitBuilder();
  const cyl = b.add('pneu-cyl-double', 300, 100);
  const power = b.add('pneu-valve-52-pilot', 270, 240);
  const button = b.add('pneu-valve-32nc', 120, 360);
  const src = b.add('pneu-supply', 300, 480);
  b.connect(power, '4', cyl, '1');
  b.connect(power, '2', cyl, '2');
  b.connect(src, '1', power, '1');
  b.teeAt(300, 420, button, '1');
  b.connect(button, '2', power, '14');
  return b.renumber().circuit;
}

/** 03 / 04 · Función lógica O / Y con dos pulsadores. */
function logicControl(type: 'pneu-shuttle-or' | 'pneu-shuttle-and') {
  const b = new CircuitBuilder();
  const cyl = b.add('pneu-cyl-double', 300, 100);
  const power = b.add('pneu-valve-52-pilot', 270, 240);
  const gate = b.add(type, 110, 300);
  const s1 = b.add('pneu-valve-32nc', 40, 400);
  const s2 = b.add('pneu-valve-32nc', 180, 400);
  const src = b.add('pneu-supply', 300, 540);
  b.connect(power, '4', cyl, '1');
  b.connect(power, '2', cyl, '2');
  b.connect(gate, '2', power, '14');
  b.connect(s1, '2', gate, '1a');
  b.connect(s2, '2', gate, '1b');
  b.connect(src, '1', power, '1');
  b.teeAt(300, 480, s2, '1');
  b.teeAt(300, 500, s1, '1');
  return b.renumber().circuit;
}

/** 05 · Regulación de velocidad con estranguladoras antirretorno en el escape. */
function speedControl() {
  const b = new CircuitBuilder();
  const cyl = b.add('pneu-cyl-double', 300, 100, { mass: 2 });
  const fc1 = b.add('pneu-throttle-oneway', 250, 200, { pct: 15 });
  const fc2 = b.add('pneu-throttle-oneway', 330, 200, { pct: 40 });
  const valve = b.add('pneu-valve-52', 270, 330, { actLeft: 'lever', actRight: 'spring' });
  const src = b.add('pneu-supply', 300, 460);
  b.connect(fc1, '2', cyl, '1');
  b.connect(fc2, '2', cyl, '2');
  b.connect(valve, '4', fc1, '1');
  b.connect(valve, '2', fc2, '1');
  b.connect(src, '1', valve, '1');
  return b.renumber().circuit;
}

/** 06 · Temporizador: el cilindro sale un tiempo después de dar la señal. */
function timerControl() {
  const b = new CircuitBuilder();
  const cyl = b.add('pneu-cyl-double', 300, 100);
  const power = b.add('pneu-valve-52-pilot', 270, 240);
  const timer = b.add('pneu-timer', 190, 360, { delay: 2 });
  const lever = b.add('pneu-valve-32nc', 40, 460, { actLeft: 'lever' });
  const src = b.add('pneu-supply', 300, 560);
  b.connect(power, '4', cyl, '1');
  b.connect(power, '2', cyl, '2');
  b.connect(timer, '2', power, '14');
  b.connect(lever, '2', timer, '12');
  b.connect(src, '1', power, '1');
  b.teeAt(300, 470, timer, '1');
  b.teeAt(300, 520, lever, '1');
  return b.renumber().circuit;
}

/**
 * 07 · Ciclo A+ B+ B− A−. Memorias 5/2 de doble pilotaje; arranque = pulsador en serie con el
 * final de carrera 1S1 (A dentro); los rodillos abatibles 1S2 (A, al avanzar) y 2S1 (B, al
 * retroceder) dan sólo un impulso, así no hay señales en conflicto.
 */
export function cycleABBA() {
  const b = new CircuitBuilder();
  const A = b.add('pneu-cyl-double', 200, 100, { marks: '1S1@0; 1S2@90', mass: 0.5 });
  const B = b.add('pneu-cyl-double', 560, 100, { marks: '2S1@10; 2S2@100', mass: 0.5 });
  // Válvulas de potencia de poco caudal: cilindros lentos para que los rodillos abatibles
  // den impulsos suficientemente largos.
  const v1 = b.add('pneu-valve-52-memory', 170, 260, { qn: 80 });
  const v2 = b.add('pneu-valve-52-memory', 530, 260, { qn: 80 });
  const start = b.add('pneu-valve-32nc', 60, 470);
  const a0 = b.add('pneu-limit-32', 60, 380, { sensor: '1S1' });
  const b0 = b.add('pneu-limit-32', 300, 380, {
    sensor: '2S1',
    actLeft: 'roller-oneway',
    rollerDir: '-',
  });
  const a1 = b.add('pneu-limit-32', 420, 380, {
    sensor: '1S2',
    actLeft: 'roller-oneway',
    rollerDir: '+',
  });
  const b1 = b.add('pneu-limit-32', 660, 380, { sensor: '2S2' });
  b.connect(v1, '4', A, '1');
  b.connect(v1, '2', A, '2');
  b.connect(v2, '4', B, '1');
  b.connect(v2, '2', B, '2');
  // Señales
  b.connect(start, '2', a0, '1');
  b.connect(a0, '2', v1, '14');
  b.connect(b0, '2', v1, '12');
  b.connect(a1, '2', v2, '14');
  b.connect(b1, '2', v2, '12');
  // Alimentaciones (una toma de red por cada grupo)
  for (const [comp, port, x, y] of [
    [v1, '1', 200, 560],
    [v2, '1', 560, 560],
    [start, '1', 70, 560],
    [b0, '1', 310, 470],
    [a1, '1', 430, 470],
    [b1, '1', 670, 470],
  ] as const) {
    const s = b.add('pneu-supply', x, y);
    b.connect(s, '1', comp, port);
  }
  return b.renumber().circuit;
}

/* ───────────── Electroneumática ───────────── */

interface PathItem {
  type: string;
  label?: string;
  params?: Record<string, string | number | boolean>;
}

/** Bornes superior e inferior de un componente eléctrico vertical. */
function terminals(b: CircuitBuilder, id: string): [string, string] {
  const c = b.circuit.components[id];
  const m = getModel(c.type);
  const ports = m.ports(resolveParams(m, c.params)).filter((p) => p.medium === 'elec');
  return [ports.find((p) => p.dir === 'up')!.id, ports.find((p) => p.dir === 'down')!.id];
}

/**
 * Rama de corriente vertical en x: +24 V arriba, los elementos en serie y 0 V abajo.
 * Devuelve los componentes y el cable que entra en cada uno (el último entra en 0 V).
 */
function currentPath(b: CircuitBuilder, x: number, y0: number, items: PathItem[]) {
  const plus = b.add('elec-24v', x, y0);
  let prev: [string, string] = [plus, '1'];
  let y = y0 + 20;
  const ids: string[] = [];
  const wires: string[] = [];
  for (const it of items) {
    const center = y + 20 + 30;
    const id = b.add(it.type, x, center, it.params ?? {}, { label: it.label });
    const [top, bottom] = terminals(b, id);
    wires.push(b.connect(prev[0], prev[1], id, top));
    ids.push(id);
    prev = [id, bottom];
    y = center + 30;
  }
  const zero = b.add('elec-0v', x, y + 40);
  wires.push(b.connect(prev[0], prev[1], zero, '1'));
  return { ids, wires };
}

/** Pone un elemento en paralelo con el elemento k de una rama (a la derecha, a `dx`). */
function parallel(
  b: CircuitBuilder,
  path: ReturnType<typeof currentPath>,
  k: number,
  dx: number,
  it: PathItem,
) {
  const c = b.circuit.components[path.ids[k]];
  const id = b.add(it.type, c.x + dx, c.y, it.params ?? {}, { label: it.label });
  const [top, bottom] = terminals(b, id);
  b.tee(path.wires[k], c.x, c.y - 40, id, top);
  b.tee(path.wires[k + 1], c.x, c.y + 40, id, bottom);
  return id;
}

/** Cilindro de doble efecto con su válvula de potencia y su alimentación. */
function powerStage(
  b: CircuitBuilder,
  x: number,
  valveType: string,
  cylParams: Record<string, string | number>,
  valveParams: Record<string, string | number> = {},
) {
  const cyl = b.add('pneu-cyl-double', x, 100, cylParams);
  const valve = b.add(valveType, x - 30, 240, valveParams);
  const src = b.add('pneu-supply', x, 380);
  b.connect(valve, '4', cyl, '1');
  b.connect(valve, '2', cyl, '2');
  b.connect(src, '1', valve, '1');
  return { cyl, valve };
}

/**
 * 08 · Enclavamiento marcha/paro: S1 (marcha) activa K1, que se mantiene por su propio
 * contacto K1; S0 (paro) o la seta de emergencia S2 lo cortan. K1 manda la bobina Y1 de una
 * electroválvula 5/2 monoestable y enciende la lámpara H1.
 */
export function latchStartStop() {
  const b = new CircuitBuilder();
  powerStage(b, 220, 'pneu-valve-52-sol', {});
  const p1 = currentPath(b, 520, 20, [
    { type: 'elec-estop', label: 'S2' },
    { type: 'elec-button-nc', label: 'S0' },
    { type: 'elec-button-no', label: 'S1' },
    { type: 'elec-relay', label: 'K1' },
  ]);
  parallel(b, p1, 2, 60, { type: 'elec-contact', label: 'K1' });
  currentPath(b, 680, 20, [
    { type: 'elec-contact', label: 'K1' },
    { type: 'elec-solenoid', label: 'Y1' },
  ]);
  currentPath(b, 780, 20, [
    { type: 'elec-contact', label: 'K1' },
    { type: 'elec-lamp', label: 'H1', params: { color: 'green' } },
  ]);
  return b.renumber().circuit;
}

/**
 * 09 · Ciclo A+ B+ A− B− electroneumático con electroválvulas biestables y sensores
 * magnéticos. Y1 = marcha · 2B1, Y3 = 1B2, Y2 = 2B2, Y4 = 1B1: ninguna señal se solapa con la
 * contraria. Con el interruptor S2 el ciclo se repite solo.
 */
export function cycleABAB() {
  const b = new CircuitBuilder();
  powerStage(
    b,
    150,
    'pneu-valve-52-sol2',
    { marks: '1B1@0; 1B2@100' },
    // Válvulas de poco caudal: un ciclo de unos 2 s, que se puede seguir con la vista.
    { solLeft: 'Y1', solRight: 'Y2', qn: 25 },
  );
  powerStage(
    b,
    420,
    'pneu-valve-52-sol2',
    { marks: '2B1@0; 2B2@100' },
    { solLeft: 'Y3', solRight: 'Y4', qn: 25 },
  );
  const sensor = (label: string): PathItem => ({
    type: 'elec-proximity',
    label,
    params: { sensorType: 'magnetic' },
  });
  const p1 = currentPath(b, 640, 20, [
    { type: 'elec-button-no', label: 'S1' },
    sensor('2B1'),
    { type: 'elec-solenoid', label: 'Y1' },
  ]);
  parallel(b, p1, 0, 60, { type: 'elec-switch', label: 'S2' });
  currentPath(b, 780, 20, [sensor('1B2'), { type: 'elec-solenoid', label: 'Y3' }]);
  currentPath(b, 860, 20, [sensor('2B2'), { type: 'elec-solenoid', label: 'Y2' }]);
  currentPath(b, 940, 20, [sensor('1B1'), { type: 'elec-solenoid', label: 'Y4' }]);
  return b.renumber().circuit;
}

/**
 * 10 · Temporizado: S1 hace salir el cilindro (Y1); al llegar al final (1B2) se activa el relé
 * temporizado KT1 y, 2 s después, su contacto da tensión a Y2 y el cilindro vuelve.
 */
export function timedReturn() {
  const b = new CircuitBuilder();
  powerStage(b, 220, 'pneu-valve-52-sol2', { marks: '1B1@0; 1B2@100' });
  currentPath(b, 520, 20, [
    { type: 'elec-button-no', label: 'S1' },
    { type: 'elec-proximity', label: '1B1' },
    { type: 'elec-solenoid', label: 'Y1' },
  ]);
  currentPath(b, 620, 20, [
    { type: 'elec-proximity', label: '1B2' },
    { type: 'elec-relay-timer', label: 'KT1', params: { mode: 'on-delay', delay: 2 } },
  ]);
  currentPath(b, 720, 20, [
    { type: 'elec-contact', label: 'KT1' },
    { type: 'elec-solenoid', label: 'Y2' },
  ]);
  return b.renumber().circuit;
}

/* ───────────── Hidráulica ───────────── */

/**
 * Grupo hidráulico + 4/3 + cilindro, con el retorno de la válvula al grupo y, opcionalmente,
 * una limitadora externa y un manómetro en la línea P.
 */
function hydStage(
  b: CircuitBuilder,
  valveType: string,
  valveParams: Record<string, string | number | boolean>,
  cylParams: Record<string, string | number>,
  opts: { relief?: number; gauge?: boolean } = {},
) {
  const cyl = b.add('hyd-cyl-double', 300, 100, cylParams);
  const valve = b.add(valveType, 240, 240, valveParams);
  const pu = b.add('hyd-power-unit', 260, 420, { flow: 8, pset: 100 });
  const feed = b.connect(pu, 'P', valve, 'P');
  b.connect(valve, 'T', pu, 'T');
  if (opts.relief) {
    const relief = b.add('hyd-relief', 190, 330, { pset: opts.relief }, { flip: true });
    b.tee(feed, 250, 330, relief, 'P');
    b.connect(relief, 'T', b.add('hyd-tank', 190, 400), '1');
  }
  if (opts.gauge) {
    const gauge = b.add('hyd-gauge', 330, 290, { range: 100 });
    b.teeAt(250, 350, gauge, '1');
  }
  return { cyl, valve, pu, feed };
}

/**
 * 11 · Prensa hidráulica: 4/3 en tándem con palancas y limitadora tarada a 50 bar. Al llegar
 * el cilindro al tope, la presión sube hasta el tarado y la limitadora devuelve la bomba al
 * depósito; en el centro, la bomba descarga sin presión.
 */
export function hydPress() {
  const b = new CircuitBuilder();
  const { cyl, valve } = hydStage(
    b,
    'hyd-valve-43-tandem',
    { actLeft: 'lever', actRight: 'lever' },
    { mass: 20 },
    { relief: 50, gauge: true },
  );
  b.connect(valve, 'A', cyl, 'A');
  b.connect(valve, 'B', cyl, 'B');
  return b.renumber().circuit;
}

/**
 * 12 · Regulación de velocidad con reguladora compensada en la entrada (A): la velocidad de
 * salida es la misma con cualquier carga (cámbiala en las propiedades del cilindro).
 */
export function hydSpeed() {
  const b = new CircuitBuilder();
  const { cyl, valve } = hydStage(
    b,
    'hyd-valve-43-closed',
    { actLeft: 'lever', actRight: 'lever' },
    { mass: 20, load: 2000 },
    { relief: 80, gauge: true },
  );
  const fc = b.add('hyd-flow-control', 200, 170, { qset: 3 });
  b.connect(valve, 'A', fc, '1');
  b.connect(fc, '2', cyl, 'A');
  b.connect(valve, 'B', cyl, 'B');
  return b.renumber().circuit;
}

/**
 * 13 · Carga sostenida: con la 4/3 de centro flotante el cilindro bajaría por su carga, pero el
 * antirretorno desbloqueable lo sostiene; sólo baja cuando llega presión por B (pilotaje X).
 */
export function hydLoadHolding() {
  const b = new CircuitBuilder();
  const { cyl, valve } = hydStage(
    b,
    'hyd-valve-43-float',
    { actLeft: 'lever', actRight: 'lever' },
    { mass: 20, load: 2000 },
    { relief: 80 },
  );
  const pc = b.add('hyd-pilot-check', 200, 170);
  b.connect(valve, 'A', pc, '1');
  b.connect(pc, '2', cyl, 'A');
  const lineB = b.connect(valve, 'B', cyl, 'B');
  b.teeAt(270, 180, pc, 'X');
  void lineB;
  return b.renumber().circuit;
}

/**
 * 14 · Electrohidráulica: 4/3 de centro cerrado con electroimanes. Mientras se pulsa S1 el
 * cilindro sale (Y1) hasta el final de carrera 1S2; con S2 entra (Y2) hasta 1S1.
 */
export function hydElectro() {
  const b = new CircuitBuilder();
  const { cyl, valve } = hydStage(
    b,
    'hyd-valve-43-closed',
    { actLeft: 'solenoid', actRight: 'solenoid', solLeft: 'Y1', solRight: 'Y2' },
    { mass: 20, marks: '1S1@0; 1S2@200' },
    { relief: 60 },
  );
  b.connect(valve, 'A', cyl, 'A');
  b.connect(valve, 'B', cyl, 'B');
  currentPath(b, 560, 20, [
    { type: 'elec-button-no', label: 'S1' },
    { type: 'elec-limit', label: '1S2', params: { kind: 'nc' } },
    { type: 'elec-solenoid', label: 'Y1' },
  ]);
  currentPath(b, 660, 20, [
    { type: 'elec-button-no', label: 'S2' },
    { type: 'elec-limit', label: '1S1', params: { kind: 'nc' } },
    { type: 'elec-solenoid', label: 'Y2' },
  ]);
  return b.renumber().circuit;
}

/** 99 · Prueba de rendimiento: 12 mandos directos (48 componentes). */
function stress() {
  const b = new CircuitBuilder();
  for (let i = 0; i < 12; i++) {
    const ox = (i % 4) * 300;
    const oy = Math.floor(i / 4) * 360;
    const cyl = b.add('pneu-cyl-double', 300 + ox, 120 + oy);
    const valve = b.add('pneu-valve-52', 270 + ox, 260 + oy, {
      actLeft: i % 2 ? 'lever' : 'pushbutton',
    });
    const src = b.add('pneu-supply', 300 + ox, 400 + oy);
    const sil = b.add('pneu-silencer', 330 + ox, 330 + oy);
    b.connect(valve, '4', cyl, '1');
    b.connect(valve, '2', cyl, '2');
    b.connect(src, '1', valve, '1');
    b.connect(valve, '3', sil, '1');
  }
  return b.circuit;
}

export const EXAMPLE_DEFS: ExampleDef[] = [
  {
    file: '01-mando-directo-cilindro.json',
    name: 'Mando directo de un cilindro de doble efecto',
    description:
      'Al mantener pulsada la válvula 5/2 el cilindro avanza; al soltarla, el muelle devuelve la válvula y el cilindro retrocede.',
    build: directControl,
  },
  {
    file: '02-mando-indirecto.json',
    name: 'Mando indirecto',
    description:
      'Un pulsador 3/2 pequeño envía una señal de pilotaje a la 5/2 de potencia, que es la que mueve el cilindro.',
    build: indirectControl,
  },
  {
    file: '03-funcion-o.json',
    name: 'Función lógica O (selectora)',
    description: 'El cilindro sale si se pulsa cualquiera de los dos pulsadores (o los dos).',
    build: () => logicControl('pneu-shuttle-or'),
  },
  {
    file: '04-funcion-y.json',
    name: 'Función lógica Y (simultaneidad)',
    description:
      'El cilindro sólo sale si se pulsan los dos pulsadores a la vez (mando a dos manos).',
    build: () => logicControl('pneu-shuttle-and'),
  },
  {
    file: '05-regulacion-velocidad.json',
    name: 'Regulación de velocidad',
    description:
      'Estranguladoras antirretorno en el escape: el avance es lento (15 %) y el retroceso más rápido (40 %). Cambia la apertura en sus propiedades.',
    build: speedControl,
  },
  {
    file: '06-temporizador.json',
    name: 'Temporizador neumático',
    description:
      'Al accionar la palanca, el temporizador tarda unos 2 s en dar señal a la 5/2 y entonces sale el cilindro.',
    build: timerControl,
  },
  {
    file: '07-ciclo-AB-BA.json',
    name: 'Ciclo A+ B+ B− A−',
    description:
      'Dos cilindros en secuencia automática con finales de carrera. Pulsa el arranque (abajo a la izquierda) y abre el diagrama espacio-fase.',
    build: cycleABBA,
  },
  {
    file: '08-enclavamiento-marcha-paro.json',
    name: 'Enclavamiento marcha/paro (electroneumática)',
    description:
      'Pulsa S1 (marcha): el relé K1 se queda enclavado por su propio contacto, la bobina Y1 hace salir el cilindro y se enciende H1. S0 (paro) o la seta S2 lo cortan.',
    build: latchStartStop,
  },
  {
    file: '09-ciclo-AB-AB-electro.json',
    name: 'Ciclo A+ B+ A− B− electroneumático',
    description:
      'Electroválvulas biestables y sensores magnéticos en los cilindros. Pulsa S1 para un ciclo o activa el interruptor S2 para ciclo continuo.',
    build: cycleABAB,
  },
  {
    file: '10-retorno-temporizado.json',
    name: 'Retorno temporizado con relé',
    description:
      'Pulsa S1: el cilindro sale y, al llegar al final (1B2), el relé temporizado KT1 espera 2 s antes de dar la orden de retorno (Y2).',
    build: timedReturn,
  },
  {
    file: '11-prensa-hidraulica.json',
    name: 'Prensa hidráulica',
    description:
      'Grupo hidráulico, 4/3 en tándem con palancas y limitadora a 50 bar. Mueve la palanca izquierda: el cilindro sale y, al llegar al tope, la presión sube hasta 50 bar y el aceite vuelve por la limitadora. En el centro la bomba descarga sin presión.',
    build: hydPress,
  },
  {
    file: '12-regulacion-velocidad-hidraulica.json',
    name: 'Regulación de velocidad hidráulica',
    description:
      'Reguladora de caudal compensada a la entrada del cilindro: sale a la misma velocidad (3 l/min) tenga la carga que tenga. Prueba a cambiar la carga del cilindro.',
    build: hydSpeed,
  },
  {
    file: '13-carga-sostenida.json',
    name: 'Carga sostenida con antirretorno desbloqueable',
    description:
      'El cilindro soporta una carga de 2000 N. Con la válvula en el centro (flotante) no baja porque el antirretorno desbloqueable lo sujeta; baja sólo al mandar presión por B.',
    build: hydLoadHolding,
  },
  {
    file: '14-electrohidraulica.json',
    name: 'Electrohidráulica',
    description:
      '4/3 de centro cerrado con electroimanes Y1/Y2. Mantén S1 para sacar el cilindro (se para solo en 1S2) y S2 para meterlo (se para en 1S1).',
    build: hydElectro,
  },
  {
    file: '99-prueba-rendimiento.json',
    name: 'Prueba de rendimiento (48 componentes)',
    description:
      'Doce mandos directos para comprobar la fluidez de la simulación y de la vista 3D.',
    build: stress,
  },
];

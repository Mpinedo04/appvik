/**
 * Circuitos de ejemplo construidos por código. `scripts/gen-examples.ts` los guarda como JSON
 * (lo que carga la aplicación) y los tests los usan directamente.
 */
import { CircuitBuilder } from '../core/model/builder';
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
    file: '99-prueba-rendimiento.json',
    name: 'Prueba de rendimiento (48 componentes)',
    description:
      'Doce mandos directos para comprobar la fluidez de la simulación y de la vista 3D.',
    build: stress,
  },
];

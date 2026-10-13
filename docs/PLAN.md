# Plan de desarrollo de FluidLab 3D

> **Estado:** fases 0 a 3 terminadas. Siguiente: fase 4 (electroneumática).

## Contexto
El usuario quiere una aplicación con las funciones y la libertad de diseño de FluidSIM (editor libre de circuitos con símbolos ISO 1219 y simulación neumática, electroneumática e hidráulica), pero con una vista 3D sincronizada donde se vea por dentro cómo actúa cada componente: émbolos, correderas, muelles, flujo de aire o aceite, presiones…

Es un proyecto nuevo desde cero. No se usa la marca, el logotipo ni los recursos de Festo. Toda la interfaz estará en español.

Este documento es la "arquitectura propuesta + plan por fases" que pide el prompt antes de empezar a escribir código. Tras aprobarlo se implementan las fases 0 y 1, y cada fase siguiente se entrega funcionando.

---

## Arquitectura

### Stack
- **Vite + TypeScript + React 18**: la aplicación funciona en el navegador.
- **Editor 2D:** SVG renderizado con React (los símbolos ISO son vectoriales y el SVG facilita la selección y la exportación).
- **Vista 3D:** Three.js con `@react-three/fiber` y `@react-three/drei` (OrbitControls, Html, Outlines). El corte se hace con `clippingPlanes`.
- **Estado:** Zustand + Immer. Deshacer/rehacer con instantáneas del circuito (Immer comparte la estructura que no cambia).
- **Gráficas:** uPlot para el diagrama espacio-fase y los registros de presión (es ligero y rápido).
- **Tests:** Vitest para el núcleo de simulación y Playwright para un test de humo de la interfaz.
- **Exportación:** SVG a PNG con canvas, y PDF con jsPDF + svg2pdf.js.
- **Escritorio (fase 5):** Tauri.

### Estructura de carpetas
```
src/
  core/                 # TypeScript puro, sin React (se puede testear y ejecutar en un Worker)
    model/              # Circuit, ComponentInstance, Port, Connection, Project (+ esquema JSON con versión)
    registry.ts         # registro de tipos de componente
    sim/
      compiler.ts       # Circuit -> SimNetwork (une los puertos conectados en nodos, valida)
      fluid/            # red neumática/hidráulica de parámetros concentrados
      electric/         # resolvedor de la red eléctrica (24 V DC)
      mechanics.ts      # dinámica de émbolos (masa, carga, fricción, topes)
      engine.ts         # bucle de paso fijo, subpasos, eventos, snapshots
      recorder.ts       # historial para los diagramas
    units.ts
  components/           # UNA carpeta por tipo de componente (patrón de plugin)
    pneumatic/cylinder-double/
      model.ts          # puertos, parámetros, comportamiento, explain()
      Symbol2D.tsx      # símbolo ISO 1219 (SVG)
      Model3D.tsx       # modelo 3D procedural animado (fase 2)
    pneumatic/valve-52/...
    electric/relay/...
    hydraulic/...
  editor/               # lienzo 2D, cuadrícula, trazado de tuberías, selección, herramientas, comandos
  view3d/               # escena, colocación 3D a partir del layout 2D, tuberías, partículas, modos de corte/rayos X
  ui/                   # barra de herramientas, biblioteca, panel de propiedades, controles de simulación, paneles de instrumentos y explicación
  store/                # stores de Zustand (proyecto, selección, simulación, vista)
  examples/             # circuitos de ejemplo en .json
```

### Contrato de un componente (`src/core/registry.ts`)
```ts
interface ComponentDef<P, S> {
  type: string; category: Category; name: string;    // p. ej. 'valve-52'
  ports: PortDef[];               // id, tipo ('pneu'|'hyd'|'elec'|'mech'), posición en el símbolo
  params: ParamSchema<P>;         // genera el panel de propiedades automáticamente
  initState(p: P): S;
  build(ctx: BuildCtx, p: P): void;      // declara cámaras, orificios, contactos y bobinas en la red
  step(ctx: StepCtx, s: S, p: P, dt): S; // actualiza el estado interno (corredera, émbolo, temporizador)
  onUserAction?(s: S, action): S;        // clic en pulsador o accionamiento manual
  explain(s: S, p: P): string;           // texto para el panel "¿Qué está pasando dentro?"
  Symbol2D: React.FC<{ p: P; s?: S }>;
  Model3D: React.FC<{ p: P; s: S; viewMode: 'normal'|'xray'|'cut' }>;
}
```
Para añadir un componente solo hay que crear una carpeta y registrarla. El núcleo no cambia.

### Motor de simulación (lo más delicado)
- **Fluidos:** modelo de **parámetros concentrados**. Cada red de puertos conectados forma un **nodo** con su volumen (tubería + cámaras) y su presión. Los componentes añaden:
  - **Orificios** entre nodos, cuya apertura depende del estado (posición de la corredera, estrangulador, antirretorno). El caudal neumático sigue el modelo ISO 6358 (conductancia C, relación crítica b), con flujo sónico o subsónico.
  - **Cámaras de volumen variable** (cilindros). Presión de la cámara: `dp/dt = (n·R·T/V)·ṁ − (n·p/V)·dV/dt`.
  - **Fuentes:** presión regulada (alimentación) o caudal (bomba). **Escape/tanque:** nodo a presión atmosférica.
- **Mecánica:** émbolo como masa, con `F = p₁A₁ − p₂A₂ − F_muelle − F_carga − fricción (Stribeck simplificada)`, topes de final de carrera y amortiguación opcional.
- **Integración:** paso fijo `dt` = 0,5 ms con subpasos, desacoplado del render. Explícito para neumática y semi-implícito con compresibilidad efectiva (módulo de compresibilidad) para hidráulica, que es un sistema rígido. El solver va detrás de una interfaz para poder cambiarlo.
- **Válvulas:** la corredera tiene una posición continua 0..1 con un tiempo de conmutación pequeño. Se usa para el caudal y para animar el 3D de forma fluida.
- **Electricidad:** en cada paso se calcula la conectividad booleana desde +24 V hasta 0 V a través de los contactos cerrados (unión de conjuntos sobre el grafo). Así se sabe qué bobinas, relés y lámparas están energizados, con retardos de relé y temporizadores. Los sensores (finales de carrera, sensores de proximidad, presostatos) leen el estado mecánico/fluido y cierran contactos. Se itera hasta alcanzar un punto fijo para que las realimentaciones de los relés (enclavamientos) funcionen.
- **Ejecución:** al principio en el hilo principal. Si el rendimiento lo pide, se pasa a un Web Worker; el núcleo es puro TypeScript, así que el cambio es trivial.
- **Controles:** iniciar, pausar, parar (restablece el estado), paso a paso y factor de tiempo de 0,01× a 2× (cámara lenta).

### Sincronización 2D ↔ 3D
Una única fuente de verdad: `Project` (topología + layout 2D) y `SimSnapshot` (estado por componente y presión por nodo). La escena 3D coloca cada modelo a partir de su posición 2D, mapeada al plano XZ sobre un "tablero de prácticas" virtual. Las tuberías se trazan como tubos (`TubeGeometry`) siguiendo el recorrido 2D elevado. Seleccionar un componente en una vista lo resalta en la otra.

---

## Fases

### Fase 0: Base del proyecto (preparación) ✅
- Andamiaje con Vite + TS + React, ESLint/Prettier, Vitest y Playwright.
- Modelo de datos en `core/model` y esquema JSON del proyecto con `version` para migraciones.
- `registry.ts`, store de Zustand con deshacer/rehacer (parches de Immer).
- Diseño de la interfaz: barra superior (archivo, simulación), biblioteca a la izquierda, lienzo en el centro, propiedades a la derecha y panel inferior (diagramas/explicación).
- **Criterio de aceptación:** `npm run dev` abre la interfaz vacía y `npm test` pasa.

### Fase 1: MVP (editor 2D + neumática básica) ✅
- **Editor:** arrastrar desde la biblioteca, mover, rotar 90°, reflejar, ajuste a cuadrícula, zoom/desplazamiento, selección múltiple con recuadro, copiar/pegar, borrar, deshacer/rehacer.
- **Tuberías:** se arrastran de puerto a puerto con trazado ortogonal y puntos de codo editables, y se pueden crear uniones en T sobre una tubería existente.
- **Validación:** aviso de puertos abiertos (fuga) y de conexiones de tipos incompatibles.
- **Componentes:** fuente de aire comprimido, escape/silenciador, **cilindro de doble efecto**, **válvula 5/2** con pulsador manual + muelle y con palanca con enclavamiento, manómetro.
- **Motor neumático completo** (nodos, orificios ISO 6358, cámaras, mecánica del émbolo) y tests unitarios: el cilindro sale y entra, los tiempos de carrera son coherentes con el diámetro, la presión y la carga.
- **Simulación en el 2D:** colores en las tuberías según la presión (azul → rojo), vástago animado en el símbolo, clic sobre el pulsador para accionarlo.
- Guardar/abrir `.json` (descarga/subida de archivo) y autoguardado en localStorage. Exportar a PNG.
- **Ejemplo:** `examples/01-mando-directo-cilindro.json`.
- **Criterio de aceptación:** se construye el circuito desde cero, se simula, al pulsar sale el cilindro y al soltar vuelve. El manómetro marca valores realistas.

### Fase 2: Vista 3D sincronizada con interior visible ✅
- Escena 3D: tablero de perfiles de aluminio, iluminación PBR suave, OrbitControls, doble clic para enfocar un componente.
- Modos de vista: **2D**, **3D** y **dividida**, con selección sincronizada.
- Modelos procedurales detallados del cilindro (camisa, émbolo, juntas, vástago, culatas, amortiguadores) y de la válvula 5/2 (cuerpo, corredera con juntas, muelle helicoidal que se comprime, pulsador).
- Modos por componente (y global): **normal**, **rayos X** (materiales transparentes con contornos) y **corte** (plano de clipping con relleno de la sección y un deslizador para mover el plano).
- **Flujo:** partículas instanciadas (`InstancedMesh`) que recorren tuberías y canales internos con velocidad proporcional al caudal y color según la presión. Las cámaras del cilindro se tiñen según su presión.
- Panel **"¿Qué está pasando dentro?"**: muestra el texto de `explain()` del componente seleccionado (por ejemplo: "La corredera está desplazada: P→A abierto, B→R a escape…") con las presiones en vivo.
- Rendimiento: geometrías compartidas e instancing, objetivo de 60 FPS con 50 componentes (medido con un circuito de prueba).
- **Criterio de aceptación:** con el circuito de la fase 1, en vista de corte y cámara lenta 0,1× se ve cómo se desplaza la corredera, cómo pasa el aire de P a A, cómo se llena la cámara y cómo sale el vástago.

### Fase 3: Biblioteca neumática completa + diagramas ✅
- **Válvulas de vías:** 2/2, 3/2 NA/NC, 4/2, 5/2 y 5/3 (centro cerrado, a escape y a presión). El accionamiento se configura por separado en cada lado: pulsador, palanca, pedal, rodillo, rodillo abatible, muelle, piloto neumático y servopilotado (el solenoide queda para la fase 4). El símbolo y el modelo 3D se componen a partir del cuerpo + los accionamientos.
- **Lógica y bloqueo:** antirretorno, selectora (O), simultaneidad (Y), escape rápido.
- **Caudal y presión:** estranguladora, estranguladora unidireccional, limitadora, reguladora y de secuencia.
- **Alimentación:** compresor (con depósito y presostato), unidad de mantenimiento (FRL), depósito.
- **Actuadores:** cilindro de simple efecto (retorno por muelle), doble efecto con amortiguación regulable, cilindro sin vástago, motor neumático, actuador de giro, pinza.
- **Temporizador neumático** (estrangulador + depósito + 3/2 piloto). Final de carrera con rodillo **colocable en la posición del vástago** con una marca (como en FluidSIM) y vinculado por etiqueta (1S1, 1S2…).
- **Etiquetado automático** según la norma (1A, 1V1, 1S1…), editable.
- **Instrumentos:** manómetro y caudalímetro. **Diagrama espacio-fase/espacio-tiempo** generado automáticamente a partir de `recorder.ts` (carrera de cada cilindro + estados de válvulas y señales), exportable a PNG/CSV.
- Modelos 3D y `explain()` para todos los componentes, con tests de comportamiento para cada uno.
- **Ejemplos:** mando indirecto, puerta Y/O, ciclo A+ B+ B− A− con finales de carrera, temporizador y regulación de velocidad.
- **Criterio de aceptación:** el ciclo A+ B+ B− A− funciona solo y el diagrama espacio-fase coincide con el esperado.

### Fase 4: Electroneumática
- **Componentes eléctricos** con símbolos IEC: fuente de 24 V / 0 V, pulsadores NA/NC, interruptor, seta de emergencia, relé con contactos configurables (NA/NC/conmutados, enlazados por etiqueta K1), relé temporizado (a la conexión y a la desconexión), contador, lámpara, final de carrera eléctrico, sensores de proximidad (inductivo, capacitivo, magnético en el cilindro), presostato.
- **Electroválvulas:** accionamiento por solenoide (Y1, Y2) en todas las válvulas de vías, con monoestable y biestable, y servopilotado.
- Resolvedor eléctrico (conectividad + punto fijo) acoplado al motor de fluidos dentro del mismo paso. Cables y nodos con color según estén energizados. Esquema eléctrico en el mismo lienzo o en una hoja aparte.
- **3D:** bobina con efecto de energización (brillo) y núcleo móvil, relé con contacto móvil visible.
- **Ejemplos:** enclavamiento (marcha/paro), ciclo A+ B+ A− B− electroneumático con sensores, temporizado.
- **Criterio de aceptación:** el enclavamiento con relé se mantiene, el paro de emergencia lo corta y el ciclo con sensores funciona de forma continua.

### Fase 5: Hidráulica, GRAFCET/PLC, ejemplos y escritorio
- **Hidráulica:** grupo hidráulico (motor + bomba de cilindrada fija), tanque, limitadora, filtro, válvulas 4/3 (centros cerrado, en tándem, flotante, H), antirretorno pilotado, reguladora de caudal compensada, acumulador, cilindros, motor hidráulico, manómetro. Solver semi-implícito con compresibilidad del aceite. La partícula y el color del aceite son distintos a los del aire.
- **GRAFCET:** editor de etapas, transiciones, acciones y receptividades vinculadas a las señales del circuito (sensores → transiciones, acciones → bobinas). Se ejecuta como un "controlador" dentro del motor.
- **PLC simulado** (alternativa o complemento): bloque con entradas I0.x y salidas Q0.x, programable con una lista de instrucciones/diagrama de contactos sencillo o directamente con el GRAFCET.
- **Galería de ejemplos** (unos 15 circuitos) con una descripción didáctica por cada uno.
- Exportación a PDF. Empaquetado de escritorio con **Tauri** (ejecutable de Windows) y apertura/guardado con diálogos nativos.
- **Criterio de aceptación:** una prensa hidráulica con 4/3 y limitadora se comporta de forma realista (la presión sube hasta el tarado al llegar al tope) y un GRAFCET controla un ciclo electroneumático.

---

## Verificación (en cada fase)
- `npm test`: tests unitarios del núcleo, uno por componente (comportamiento) y uno de física (conservación de masa en nodos cerrados, tiempos de carrera dentro de una tolerancia frente al cálculo analítico).
- `npm run test:e2e` (Playwright): abre un ejemplo, inicia la simulación y comprueba que el estado del cilindro cambia.
- Prueba manual en el navegador con `npm run dev`: construir el circuito de ejemplo de la fase desde cero, simularlo y revisar las vistas 2D/3D/dividida, el corte y la cámara lenta.
- Medición de FPS con un circuito de estrés de 50 componentes (desde la fase 2).
- Cada fase termina con: código funcionando, un README actualizado con instrucciones y el `.json` de ejemplo de la fase.

## Orden de trabajo inmediato tras la aprobación
1. Fase 0 completa.
2. Fase 1. Primero el núcleo `core/sim` con sus tests (antes que la interfaz), después el editor y por último el acoplamiento.
3. Revisión con el usuario antes de empezar la fase 2.

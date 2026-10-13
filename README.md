# FluidLab 3D

Simulador de circuitos neumáticos y electroneumáticos (y, en la fase 5, hidráulicos) con editor libre de símbolos ISO 1219 / IEC 60617 y una vista 3D en la que se ve por dentro cómo funciona cada componente.

> Proyecto independiente, inspirado en los simuladores didácticos de neumática. No usa marcas, logotipos ni recursos de terceros.

## Requisitos

- Node.js 20 o superior (probado con Node 24)

## Puesta en marcha

```bash
npm install
npm run dev          # abre http://localhost:5173
```

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm test` | Tests unitarios del núcleo (Vitest) |
| `npm run test:e2e` | Test de humo de la interfaz (Playwright; la primera vez: `npx playwright install chromium`) |
| `npm run build` | Comprobación de tipos + build de producción en `dist/` |
| `npm run lint` | ESLint |
| `npm run examples` | Regenera los circuitos de ejemplo de `src/examples/` |

## Uso rápido

- **Añadir componentes:** arrástralos desde la biblioteca (o doble clic).
- **Conectar:** arrastra desde un puerto ○ hasta otro. Si sueltas sobre una tubería se crea una derivación en T.
- **Editar tuberías:** arrastra un tramo intermedio para desplazarlo.
- **Atajos:** `R` girar · `F` reflejar · `Supr` borrar · `Ctrl+Z / Ctrl+Y` deshacer/rehacer · `Ctrl+C / Ctrl+V` copiar/pegar · `Ctrl+A` seleccionar todo · `Ctrl+S` guardar · `F9` iniciar/pausar · `Esc` parar.
- **Vista:** rueda = zoom; botón central o `Espacio` + arrastrar = desplazar.
- **Vistas 2D / 3D:** el selector `2D · 2D | 3D · 3D` de la barra superior. El esquema 2D sirve para diseñar; la vista 3D, generada automáticamente a partir del esquema, sirve para ver por dentro cómo funciona cada pieza. En 3D: arrastrar = girar, rueda = zoom, botón derecho = desplazar, doble clic = enfocar un componente. Los modos **Normal**, **Rayos X** y **Corte** (con altura del plano ajustable) se eligen arriba a la izquierda y también por componente en el panel de propiedades. Las válvulas se accionan también haciendo clic en 3D. Las válvulas de vías se ven por defecto con su **corredera real** (cuerpo con taladro y ranuras, corredera con resaltes y juntas, cámaras anulares que se tiñen según la presión); el botón **Esquema ISO** las muestra como cámaras que se desplazan igual que las casillas del símbolo.
- **Simular:** pulsa ▶. Mantén pulsado el botón del ratón sobre una válvula con pulsador para accionarla (las palancas con enclavamiento cambian con cada clic). Selecciona un componente para ver en el panel derecho **qué está pasando dentro**. La velocidad baja hasta 0,01× (cámara lenta).
- **Finales de carrera:** en las propiedades del cilindro escribe sus marcas, p. ej. `1S1@0; 1S2@100` (etiqueta@mm). Una válvula con rodillo (p. ej. «Final de carrera (3/2 con rodillo)») se acciona cuando la leva pasa por la marca con la misma etiqueta. El rodillo abatible sólo actúa en el sentido elegido.
- **Diagramas:** botón 📈 junto a los controles de simulación. *Espacio-tiempo* (carrera de los actuadores y estado de las válvulas frente al tiempo) y *espacio-fase* (un paso por movimiento, con la secuencia, p. ej. `1A+ → 2A+ → 2A− → 1A−`). Se exportan a PNG y CSV.
- **Electroneumática:** el esquema eléctrico se dibuja en el mismo lienzo con los componentes de las categorías *Eléctricos*, *Relés, contadores y bobinas* y *Sensores eléctricos*, unidos con cables (arrastrando de borne a borne). Las ramas van de **+24 V** a **0 V**. Como en los simuladores clásicos, **la etiqueta es el enlace**: los contactos con la etiqueta `K1` los mueve la bobina `K1`; la bobina `Y1` acciona el lado de la válvula cuyo accionamiento *Electroimán* tiene `Y1`; los sensores y finales de carrera eléctricos con la etiqueta `1B1` se activan en la marca `1B1@…` del cilindro. Durante la simulación los cables con +24 V se ven en rojo y los de 0 V en azul, las bobinas activadas se rellenan y las lámparas se encienden; un cortocircuito se avisa en la barra de estado. Los pulsadores, interruptores y la seta de emergencia se accionan con clic (en 2D o en 3D).
- **Renumerar:** botón 🏷 de la barra: etiqueta la parte neumática según la norma (`1A`, `1V1`, `1S1`, `0Z1`…). Las etiquetas de los componentes eléctricos no se tocan, porque son sus enlaces.
- Los proyectos se guardan como `.fluidlab.json`; además hay autoguardado en el navegador.

## Componentes

| Grupo | Componentes |
| --- | --- |
| Alimentación | Fuente de aire, compresor con depósito y presostato, unidad de mantenimiento (FRL), depósito, silenciador |
| Actuadores | Cilindro de simple efecto (muelle), de doble efecto (amortiguación regulable), sin vástago, actuador de giro, motor neumático, pinza |
| Válvulas de vías | 2/2, 3/2 NC, 3/2 NA, 4/2, 5/2, 5/3 (centro cerrado, a escape, a presión), 5/2 pilotada, 5/2 biestable y electroválvulas 3/2, 5/2 monoestable y 5/2 biestable. Accionamientos por lado: pulsador, palanca con enclavamiento, pedal, rodillo, rodillo abatible, pilotaje, servopilotado, electroimán, electroimán servopilotado, muelle |
| Bloqueo y lógica | Antirretorno, selectora (O), simultaneidad (Y), escape rápido |
| Caudal y presión | Estranguladora, estranguladora antirretorno, limitadora, reguladora con escape, válvula de secuencia, temporizador neumático |
| Sensores | Final de carrera 3/2 con rodillo |
| Instrumentos | Manómetro, caudalímetro |
| Eléctricos | Alimentación +24 V y 0 V, pulsador NA, pulsador NC, interruptor, seta de emergencia, lámpara |
| Relés y bobinas | Relé, relé temporizado (a la conexión / a la desconexión), contacto de relé (NA, NC, conmutado), contador con puesta a cero, bobina de electroválvula |
| Sensores eléctricos | Final de carrera eléctrico, sensor de proximidad (magnético, inductivo, capacitivo, óptico), presostato |

Ejemplos incluidos: mando directo, mando indirecto, funciones O e Y, regulación de velocidad, temporizador, ciclo A+ B+ B− A−, enclavamiento marcha/paro con relé, ciclo A+ B+ A− B− electroneumático con sensores (ciclo único o continuo), retorno temporizado con relé y una prueba de rendimiento.

## Arquitectura

```
src/
  core/            TypeScript puro (sin React): se puede testear y ejecutar en un Worker
    model/         Datos del circuito, geometría, operaciones de edición, validación
    registry.ts    Contrato ComponentModel + registro de tipos
    sim/           Compilador (circuito → redes), red neumática ISO 6358, red eléctrica,
                   mecánica, motor, grabador de diagramas
  components/      Un directorio por componente: model.ts (física) + Symbol2D.tsx (símbolo)
                   + Model3D.tsx (modelo 3D procedural)
  view3d/          Escena 3D (Three.js / react-three-fiber): tablero, tuberías, partículas,
                   materiales por modo (normal, rayos X, corte), cámara
  editor/          Lienzo SVG (selección, arrastre, trazado de tuberías)
  store/           Zustand: proyecto (historial) y simulación
  ui/              Barra de herramientas, biblioteca, propiedades, barra de estado
  examples/        Circuitos de ejemplo (.json)
```

### Modelo físico

- **Neumática de parámetros concentrados:** cada conjunto de puertos unidos por tuberías es un nodo con masa de aire y volumen (tuberías + volúmenes muertos + cámaras). Presión isoterma `p = m·R·T/V`.
- **Restricciones ISO 6358** (conductancia sónica C, relación crítica b) con régimen sónico y subsónico. Las válvulas abren/cierran sus vías según la posición continua de la corredera (con recubrimiento positivo).
- **Émbolos** con masa, carga, fricción estática, de Coulomb y viscosa, y topes de final de carrera.
- **Integración** de paso fijo (0,1 ms) con limitador de equilibrio por orificio: estable con volúmenes pequeños.
- **Red eléctrica de 24 V** resuelta por conectividad: los cables y los contactos cerrados unen nodos; una bobina o lámpara está activada si un borne llega a +24 V y el otro a 0 V. Se resuelve sólo cuando cambia algún contacto y se lee en el paso siguiente (0,1 ms después), así las autorretenciones funcionan sin bucles. Simplificación didáctica: no se calculan corrientes, así que dos cargas en serie no se encienden.

Para añadir un componente: crea su carpeta en `src/components/…` con `model.ts` (puertos, parámetros, `build`, `update`, `explain`) y `Symbol2D.tsx`, y regístralo en `components/models.ts` y `components/views.ts`.

## Estado por fases

El plan completo, con la arquitectura y los criterios de aceptación de cada fase, está en [docs/PLAN.md](docs/PLAN.md).

- [x] **Fase 0:** base del proyecto (Vite + TS + React, Vitest, Playwright, ESLint/Prettier, modelo de datos, registro, store con deshacer/rehacer, maquetación).
- [x] **Fase 1:** editor 2D + neumática básica (fuente, silenciador, cilindro de doble efecto, válvulas 5/2, 3/2 NC y 3/2 NA con pulsador/palanca/pedal y muelle, manómetro), simulación con colores de presión, guardar/abrir, exportar PNG, ejemplo `01`.
- [x] **Fase 2:** vista 3D sincronizada (2D / 3D / dividida) con modos normal, rayos X y corte, partículas de flujo por tuberías y conductos internos, cámara con enfoque, accionamiento desde el 3D; 60 FPS con 48 componentes. Además: válvulas de N posiciones (2/2, 4/2, 5/3) y accionamientos por lado (rodillo, rodillo abatible, pilotaje, servopilotado…).
- [x] **Fase 3:** biblioteca neumática completa (tabla de arriba) con símbolo 2D, modelo 3D, explicación y test de cada componente; finales de carrera vinculados a marcas del cilindro; etiquetado automático; diagramas espacio-tiempo y espacio-fase (PNG/CSV); 7 ejemplos, entre ellos el ciclo A+ B+ B− A−.
- [x] **Fase 4:** electroneumática: red eléctrica de 24 V acoplada al motor neumático, 15 componentes eléctricos (pulsadores, interruptor, seta, lámpara, relés normal y temporizado, contactos, contador, bobina de electroválvula, finales de carrera, sensores de proximidad, presostato) con símbolo IEC, modelo 3D (bobinas que brillan, contactos y armaduras que se mueven) y explicación; electroimanes en todas las válvulas de vías; cables coloreados en 2D y 3D; ejemplos `08`–`10`. Además, las válvulas 3D muestran su **corredera real**.
- [ ] Fase 5: hidráulica, GRAFCET/PLC, galería de ejemplos y versión de escritorio.

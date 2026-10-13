# FluidLab 3D

Simulador de circuitos neumáticos (y, en próximas fases, electroneumáticos e hidráulicos) con editor libre de símbolos ISO 1219 y, a partir de la fase 2, una vista 3D en la que se ve por dentro cómo funciona cada componente.

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
- **Vistas 2D / 3D:** el selector `2D · 2D | 3D · 3D` de la barra superior. El esquema 2D sirve para diseñar; la vista 3D, generada automáticamente a partir del esquema, sirve para ver por dentro cómo funciona cada pieza. En 3D: arrastrar = girar, rueda = zoom, botón derecho = desplazar, doble clic = enfocar un componente. Los modos **Normal**, **Rayos X** y **Corte** (con altura del plano ajustable) se eligen arriba a la izquierda y también por componente en el panel de propiedades. Las válvulas se accionan también haciendo clic en 3D.
- **Simular:** pulsa ▶. Mantén pulsado el botón del ratón sobre una válvula con pulsador para accionarla (las palancas con enclavamiento cambian con cada clic). Selecciona un componente para ver en el panel derecho **qué está pasando dentro**. La velocidad baja hasta 0,01× (cámara lenta).
- **Finales de carrera:** en las propiedades del cilindro escribe sus marcas, p. ej. `1S1@0; 1S2@100` (etiqueta@mm). Una válvula con rodillo (p. ej. «Final de carrera (3/2 con rodillo)») se acciona cuando la leva pasa por la marca con la misma etiqueta. El rodillo abatible sólo actúa en el sentido elegido.
- **Diagramas:** botón 📈 junto a los controles de simulación. *Espacio-tiempo* (carrera de los actuadores y estado de las válvulas frente al tiempo) y *espacio-fase* (un paso por movimiento, con la secuencia, p. ej. `1A+ → 2A+ → 2A− → 1A−`). Se exportan a PNG y CSV.
- **Renumerar:** botón 🏷 de la barra: etiqueta todo según la norma (`1A`, `1V1`, `1S1`, `0Z1`…).
- Los proyectos se guardan como `.fluidlab.json`; además hay autoguardado en el navegador.

## Componentes

| Grupo | Componentes |
| --- | --- |
| Alimentación | Fuente de aire, compresor con depósito y presostato, unidad de mantenimiento (FRL), depósito, silenciador |
| Actuadores | Cilindro de simple efecto (muelle), de doble efecto (amortiguación regulable), sin vástago, actuador de giro, motor neumático, pinza |
| Válvulas de vías | 2/2, 3/2 NC, 3/2 NA, 4/2, 5/2, 5/3 (centro cerrado, a escape, a presión), 5/2 pilotada y 5/2 biestable. Accionamientos por lado: pulsador, palanca con enclavamiento, pedal, rodillo, rodillo abatible, pilotaje, servopilotado, muelle |
| Bloqueo y lógica | Antirretorno, selectora (O), simultaneidad (Y), escape rápido |
| Caudal y presión | Estranguladora, estranguladora antirretorno, limitadora, reguladora con escape, válvula de secuencia, temporizador neumático |
| Sensores | Final de carrera 3/2 con rodillo |
| Instrumentos | Manómetro, caudalímetro |

Ejemplos incluidos: mando directo, mando indirecto, funciones O e Y, regulación de velocidad, temporizador, ciclo A+ B+ B− A− y una prueba de rendimiento.

## Arquitectura

```
src/
  core/            TypeScript puro (sin React): se puede testear y ejecutar en un Worker
    model/         Datos del circuito, geometría, operaciones de edición, validación
    registry.ts    Contrato ComponentModel + registro de tipos
    sim/           Compilador (circuito → red), red neumática ISO 6358, mecánica, motor
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

Para añadir un componente: crea su carpeta en `src/components/…` con `model.ts` (puertos, parámetros, `build`, `update`, `explain`) y `Symbol2D.tsx`, y regístralo en `components/models.ts` y `components/views.ts`.

## Estado por fases

El plan completo, con la arquitectura y los criterios de aceptación de cada fase, está en [docs/PLAN.md](docs/PLAN.md).

- [x] **Fase 0:** base del proyecto (Vite + TS + React, Vitest, Playwright, ESLint/Prettier, modelo de datos, registro, store con deshacer/rehacer, maquetación).
- [x] **Fase 1:** editor 2D + neumática básica (fuente, silenciador, cilindro de doble efecto, válvulas 5/2, 3/2 NC y 3/2 NA con pulsador/palanca/pedal y muelle, manómetro), simulación con colores de presión, guardar/abrir, exportar PNG, ejemplo `01`.
- [x] **Fase 2:** vista 3D sincronizada (2D / 3D / dividida) con modos normal, rayos X y corte, partículas de flujo por tuberías y conductos internos, cámara con enfoque, accionamiento desde el 3D; 60 FPS con 48 componentes. Además: válvulas de N posiciones (2/2, 4/2, 5/3) y accionamientos por lado (rodillo, rodillo abatible, pilotaje, servopilotado…).
- [x] **Fase 3:** biblioteca neumática completa (tabla de arriba) con símbolo 2D, modelo 3D, explicación y test de cada componente; finales de carrera vinculados a marcas del cilindro; etiquetado automático; diagramas espacio-tiempo y espacio-fase (PNG/CSV); 7 ejemplos, entre ellos el ciclo A+ B+ B− A−.
- [ ] Fase 4: electroneumática.
- [ ] Fase 5: hidráulica, GRAFCET/PLC, galería de ejemplos y versión de escritorio.

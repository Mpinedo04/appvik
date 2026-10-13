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
- **Simular:** pulsa ▶. Mantén pulsado el botón del ratón sobre una válvula con pulsador para accionarla (las palancas con enclavamiento cambian con cada clic). Selecciona un componente para ver en el panel derecho **qué está pasando dentro**. La velocidad baja hasta 0,01× (cámara lenta).
- Los proyectos se guardan como `.fluidlab.json`; además hay autoguardado en el navegador.

## Arquitectura

```
src/
  core/            TypeScript puro (sin React): se puede testear y ejecutar en un Worker
    model/         Datos del circuito, geometría, operaciones de edición, validación
    registry.ts    Contrato ComponentModel + registro de tipos
    sim/           Compilador (circuito → red), red neumática ISO 6358, mecánica, motor
  components/      Un directorio por componente: model.ts (física) + Symbol2D.tsx (símbolo)
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
- [ ] Fase 2: vista 3D sincronizada con corte, rayos X y partículas de flujo.
- [ ] Fase 3: biblioteca neumática completa + diagrama espacio-fase.
- [ ] Fase 4: electroneumática.
- [ ] Fase 5: hidráulica, GRAFCET/PLC, galería de ejemplos y versión de escritorio.

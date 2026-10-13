import { RENDER_LABELS, useView, type Render3D } from '../store/view';
import { sceneApi } from './sceneApi';

/** Controles de la vista 3D (modo de visualización, plano de corte, encuadre, etiquetas). */
export function ViewOverlay() {
  const render3d = useView((s) => s.render3d);
  const cutOffset = useView((s) => s.cutOffset);
  const labels = useView((s) => s.labels);
  const valveStyle = useView((s) => s.valveStyle);
  const { setRender, setCutOffset, setLabels, setValveStyle } = useView.getState();
  return (
    <div className="overlay3d">
      <div className="seg" role="group" aria-label="Modo de visualización 3D">
        {(Object.keys(RENDER_LABELS) as Render3D[]).map((r) => (
          <button
            key={r}
            className={render3d === r ? 'on' : ''}
            onClick={() => setRender(r)}
            data-testid={`render-${r}`}
          >
            {RENDER_LABELS[r]}
          </button>
        ))}
      </div>
      {render3d === 'cut' && (
        <label className="cut">
          <span>Altura del corte</span>
          <input
            type="range"
            min={-12}
            max={12}
            step={0.5}
            value={cutOffset}
            onChange={(e) => setCutOffset(Number(e.target.value))}
          />
        </label>
      )}
      <div className="seg" role="group" aria-label="Dibujo de las válvulas">
        <button
          className={valveStyle === 'real' ? 'on' : ''}
          onClick={() => setValveStyle('real')}
          title="Cuerpo con taladro y corredera con resaltes, como la válvula real"
          data-testid="valve-real"
        >
          Corredera real
        </button>
        <button
          className={valveStyle === 'iso' ? 'on' : ''}
          onClick={() => setValveStyle('iso')}
          title="Una cámara por cada casilla del símbolo ISO"
          data-testid="valve-iso"
        >
          Esquema ISO
        </button>
      </div>
      <button className="plain" onClick={() => sceneApi.fitAll()}>
        Encuadrar
      </button>
      <label className="chk">
        <input type="checkbox" checked={labels} onChange={(e) => setLabels(e.target.checked)} />{' '}
        Etiquetas
      </label>
      <span className="hint3d">
        Arrastrar: girar · rueda: zoom · botón derecho: desplazar · doble clic: enfocar
      </span>
    </div>
  );
}

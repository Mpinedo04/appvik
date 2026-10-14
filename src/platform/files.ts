/**
 * Guardar y abrir archivos. En el navegador: descarga y selector de archivos. En la aplicación
 * de escritorio (Tauri): diálogos nativos de Windows y escritura directa en disco, usando la API
 * global `window.__TAURI__` (se activa con `withGlobalTauri` en src-tauri/tauri.conf.json).
 */

interface TauriGlobal {
  dialog: {
    save(o: {
      defaultPath?: string;
      filters?: { name: string; extensions: string[] }[];
    }): Promise<string | null>;
    open(o: {
      multiple?: boolean;
      filters?: { name: string; extensions: string[] }[];
    }): Promise<string | string[] | null>;
  };
  fs: {
    writeTextFile(path: string, text: string): Promise<void>;
    writeFile(path: string, data: Uint8Array): Promise<void>;
    readTextFile(path: string): Promise<string>;
  };
}

const tauri = () => (window as unknown as { __TAURI__?: TauriGlobal }).__TAURI__;

/** ¿Se está ejecutando como aplicación de escritorio? */
export const isDesktop = () => typeof window !== 'undefined' && !!tauri()?.dialog;

export interface FileKind {
  /** Nombre del tipo en el diálogo, p. ej. «Proyecto FluidLab». */
  label: string;
  ext: string;
  mime: string;
}

function download(name: string, blob: Blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Guarda un archivo. Devuelve false si el usuario cancela el diálogo. */
export async function saveFile(
  name: string,
  data: string | Uint8Array,
  kind: FileKind,
): Promise<boolean> {
  const t = tauri();
  if (t?.dialog) {
    const path = await t.dialog.save({
      defaultPath: name,
      filters: [{ name: kind.label, extensions: [kind.ext] }],
    });
    if (!path) return false;
    if (typeof data === 'string') await t.fs.writeTextFile(path, data);
    else await t.fs.writeFile(path, data);
    return true;
  }
  download(name, new Blob([data as BlobPart], { type: kind.mime }));
  return true;
}

/** Pide un archivo de texto al usuario. null si cancela. */
export async function openTextFile(kind: FileKind): Promise<{ name: string; text: string } | null> {
  const t = tauri();
  if (t?.dialog) {
    const path = await t.dialog.open({
      multiple: false,
      filters: [{ name: kind.label, extensions: [kind.ext] }],
    });
    if (!path || Array.isArray(path)) return null;
    return { name: path.split(/[\\/]/).pop() ?? path, text: await t.fs.readTextFile(path) };
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = `.${kind.ext},${kind.mime}`;
    input.onchange = async () => {
      const f = input.files?.[0];
      resolve(f ? { name: f.name, text: await f.text() } : null);
    };
    input.click();
  });
}

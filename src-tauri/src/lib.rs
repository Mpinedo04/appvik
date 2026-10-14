/// Aplicación de escritorio: la misma interfaz web (carpeta dist) en una ventana nativa, con
/// los diálogos de abrir/guardar y el acceso a archivos del sistema.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .run(tauri::generate_context!())
        .expect("no se pudo iniciar FluidLab 3D");
}

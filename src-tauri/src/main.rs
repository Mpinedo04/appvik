// Sin consola en Windows al ejecutar la versión final.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    fluidlab_3d_lib::run()
}

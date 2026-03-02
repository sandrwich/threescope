#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    satvisor_lib::run()
}

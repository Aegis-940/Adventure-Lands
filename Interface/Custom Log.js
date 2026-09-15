// --------------------------------------------------------------------------------------------------------------------------------- //
// LOG SHIM — routes log() into the enhanced game log
// --------------------------------------------------------------------------------------------------------------------------------- //

function create_custom_log_window() {
	if (typeof enhance_game_log === "function") enhance_game_log();
}

function log(msg, color = "#fff", type = "General") {
	if (typeof al_log_push !== "function") return void game_log(msg, color);
	al_log_push(msg, color, type === "Errors" ? "errors" : "other");
}

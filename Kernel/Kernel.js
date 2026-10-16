// --------------------------------------------------------------------------------------------------------------------------------- //
// KERNEL — the boot phase: files register boot steps at load, and kernel_boot() runs them once, in Bootstrapper list order
// --------------------------------------------------------------------------------------------------------------------------------- //

const _boot_steps = {};
const _boot_report = { started: 0, finished: 0, ran: [], skipped: [], failed: [] };
const _console_api = {};

function on_boot(file, fn, options) {
	if (!_boot_steps[file]) _boot_steps[file] = [];
	_boot_steps[file].push({ fn, needs: (options && options.needs) || [] });
}

function boot_failure(file, reason, fatal) {
	_boot_report.failed.push({ file, reason });
	log_msg("error", `boot: ${file}: ${reason}${fatal ? " — this character cannot run" : ""}`);
	errlog_record("boot", `${file}: ${reason}`);
}

function run_boot_step(file, step, plan) {
	for (const need of step.needs) {
		if (plan.loaded.includes(need)) continue;
		if (plan.optional.includes(need)) {
			_boot_report.skipped.push({ file, need });
			log_msg("warn", `boot: ${file} skipped a step that needs ${need}, which did not load`);
			return;
		}
		return boot_failure(file, `needs ${need}, which did not load`, file === plan.entry);
	}
	try {
		step.fn();
		_boot_report.ran.push(file);
	} catch (e) {
		boot_failure(file, (e && e.message) || String(e), file === plan.entry);
		console.error(e);
	}
}

function kernel_boot(plan) {
	if (window.__al_booted) {
		log_msg("warn", "kernel_boot called twice — ignoring the second. Reload the tab to restart.");
		return;
	}
	window.__al_booted = true;
	_boot_report.started = Date.now();

	for (const file in _boot_steps) {
		if (!plan.order.includes(file)) boot_failure(file, "registered a boot step under a name the Bootstrapper does not list", false);
	}
	for (const file of plan.order) {
		if (!plan.loaded.includes(file)) continue;
		for (const step of _boot_steps[file] || []) run_boot_step(file, step, plan);
	}
	window.addEventListener("pagehide", kernel_teardown);
	_boot_report.finished = Date.now();
}

function kernel_teardown() {
	stop_loops();
	release_listeners();
	release_wrapped();
}

function al_boot() {
	return {
		ms: _boot_report.finished - _boot_report.started,
		ran: _boot_report.ran.length,
		skipped: _boot_report.skipped,
		failed: _boot_report.failed,
	};
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// CONSOLE API — the entry points meant to be typed into the console, listed in one place
// --------------------------------------------------------------------------------------------------------------------------------- //

function console_api(entries) {
	Object.assign(_console_api, entries);
}

function al_help() {
	const out = {};
	for (const name of Object.keys(_console_api).sort()) {
		out[name] = (window[name] ? "" : "(missing) ") + _console_api[name];
	}
	return out;
}

console_api({
	al_help: "this list",
	al_boot: "what the boot phase ran, skipped and failed",
	al_loops: "every kernel loop: kind, rate, runs, last error",
	al_storage_keys: "every localStorage key prefix, its kind and the file that owns it",
});

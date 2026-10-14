// --------------------------------------------------------------------------------------------------------------------------------- //
// SCHEDULER — every loop the kernel owns: named, counted, error-caught, and stopped on pagehide
// --------------------------------------------------------------------------------------------------------------------------------- //

const _loops = [];

function every(name, options, fn) {
	const loop = {
		name,
		kind: options.kind || "automation",
		ms: options.ms,
		fixed: !!options.fixed,
		runs: 0,
		errors: 0,
		last_error: null,
		last_at: 0,
		timer: null,
	};
	_loops.push(loop);

	const run = () => {
		loop.runs++;
		loop.last_at = Date.now();
		try {
			fn();
		} catch (e) {
			loop.errors++;
			loop.last_error = (e && e.message) || String(e);
			catcher(e, name);
		}
	};

	loop.timer = setInterval(run, loop.ms);
	return loop;
}

function stop_loops() {
	for (const loop of _loops) clearInterval(loop.timer);
}

function al_loops() {
	const now = Date.now();
	return _loops.map(l => ({
		name: l.name,
		kind: l.kind,
		ms: l.ms,
		runs: l.runs,
		errors: l.errors,
		last_error: l.last_error,
		last_ago_ms: l.last_at ? now - l.last_at : null,
	}));
}

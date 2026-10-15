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
		beat: !!options.beat,
		runs: 0,
		errors: 0,
		last_error: null,
		last_at: 0,
		last_lag: null,
		due: 0,
		timer: null,
		stopped: false,
	};
	_loops.push(loop);

	if (loop.fixed) {
		loop.timer = setInterval(() => run_loop(loop, fn), loop.ms);
		return loop;
	}

	const step = async () => {
		loop.timer = null;
		const next = await run_loop(loop, fn);
		if (loop.stopped) return;
		if (next === false) return stop_loop(loop);
		loop.due = Date.now() + next;
		loop.timer = setTimeout(step, next);
	};

	if (options.after) loop.timer = setTimeout(step, options.after);
	else step();
	return loop;
}

async function run_loop(loop, fn) {
	const now = Date.now();
	loop.runs++;
	loop.last_at = now;
	if (loop.beat) {
		errlog_beat(loop.name);
		if (loop.due) {
			loop.last_lag = now - loop.due;
			errlog_time("lag " + loop.name, loop.last_lag);
		}
	}
	try {
		const next = await fn();
		return next === false || typeof next === "number" ? next : loop.ms;
	} catch (e) {
		loop.errors++;
		loop.last_error = (e && e.message) || String(e);
		catcher(e, loop.name);
		return loop.ms;
	}
}

function when(name, ready, fn, ms) {
	return every(name, { ms, kind: "ui" }, () => {
		if (!ready()) return ms;
		fn();
		return false;
	});
}

function stop_loop(loop) {
	loop.stopped = true;
	clearTimeout(loop.timer);
	clearInterval(loop.timer);
	const i = _loops.indexOf(loop);
	if (i !== -1) _loops.splice(i, 1);
}

function stop_loops() {
	for (const loop of _loops) {
		loop.stopped = true;
		clearTimeout(loop.timer);
		clearInterval(loop.timer);
	}
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
		last_lag: l.last_lag,
		last_ago_ms: l.last_at ? now - l.last_at : null,
	}));
}

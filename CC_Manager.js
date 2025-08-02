const cc_profiles = {};
const original_functions = {};

// Call this once with an array of { fn, label } pairs
function profile_cc(functions) {
	for (const { fn, label } of functions) {
		if (!label || typeof fn !== "function") continue;

		// Store original function
		original_functions[label] = fn;

		// Initialize stats
		cc_profiles[label] = {
			total_calls: 0,
			total_time: 0,
			total_cc: 0,
			avg_time: 0,
			avg_cc: 0,
		};

		// Create and assign the profiled wrapper
		const wrapped = function (...args) {
			const cc_before = character.cc;
			const time_before = performance.now();

			const result = fn(...args);

			const time_after = performance.now();
			const cc_after = character.cc;

			const duration = time_after - time_before;
			const cc_used = cc_after - cc_before;

			const profile = cc_profiles[label];
			profile.total_calls++;
			profile.total_time += duration;
			profile.total_cc += cc_used;
			profile.avg_time = profile.total_time / profile.total_calls;
			profile.avg_cc = profile.total_cc / profile.total_calls;

			return result;
		};

		// Replace the original function with the wrapped one in its scope
		window[label] = wrapped;
	}
}

// Log profiling results every 60s to the game UI
setInterval(() => {
	game_log("=== CC PROFILE: 60s Report ===");
	for (const [label, profile] of Object.entries(cc_profiles)) {
		game_log(
			`${label}: ${profile.total_calls} calls | avg ${profile.avg_time.toFixed(2)}ms | avg ${profile.avg_cc.toFixed(2)} CC`
		);
		// Reset for next window
		profile.total_calls = 0;
		profile.total_time = 0;
		profile.total_cc = 0;
		profile.avg_time = 0;
		profile.avg_cc = 0;
	}
}, 60000);

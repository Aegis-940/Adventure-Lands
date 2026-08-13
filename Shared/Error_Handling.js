// --------------------------------------------------------------------------------------------------------------------------------- //
// ERROR HANDLING — catcher(), the shared error-triage/logging helper
// (split out of Common_Functions.js — real <script> tag, same global scope, no eval boundary)
// --------------------------------------------------------------------------------------------------------------------------------- //

// --------------------------------------------------------------------------------------------------------------------------------- //
// ERROR CATCHER
// --------------------------------------------------------------------------------------------------------------------------------- //

const CRITICAL_ERROR = "#ff1100ff";
const GENERAL_ERROR = "#ffa127ff";

function catcher(e, context = "Error") {
	// Map keywords to either a shorthand function or [shorthand, color]
	const keyword_map = {
		"attack cooldown": [
			(msg, ctx) => {
				if (msg.toLowerCase().includes("attack") && msg.toLowerCase().includes("cooldown") && msg.toLowerCase().includes("ms")) {
					let ms_match = msg.match(/"ms":\s*(\d+)/) || msg.match(/ms[:=]\s*(\d+)/i);
					let ms_text = ms_match ? `, ${ms_match[1]}ms` : "";
					return `Attack c/d${ms_text} (${ctx})`;
				}
				return null;
			},
			GENERAL_ERROR
		],
		"3shot cooldown": [
			(msg, ctx) => {
				if (msg.toLowerCase().includes("3shot") && msg.toLowerCase().includes("cooldown") && msg.toLowerCase().includes("ms")) {
					let ms_match = msg.match(/"ms":\s*(\d+)/) || msg.match(/ms[:=]\s*(\d+)/i);
					let ms_text = ms_match ? `, ${ms_match[1]}ms` : "";
					return `3-Shot c/d${ms_text} (${ctx})`;
				}
				return null;
			},
			GENERAL_ERROR
		],
		"5shot cooldown": [
			(msg, ctx) => {
				if (msg.toLowerCase().includes("5shot") && msg.toLowerCase().includes("cooldown") && msg.toLowerCase().includes("ms")) {
					let ms_match = msg.match(/"ms":\s*(\d+)/) || msg.match(/ms[:=]\s*(\d+)/i);
					let ms_text = ms_match ? `, ${ms_match[1]}ms` : "";
					return `5-Shot c/d${ms_text} (${ctx})`;
				}
				return null;
			},
			GENERAL_ERROR
		],
		"supershot cooldown": [
			(msg, ctx) => {
				if (msg.toLowerCase().includes("supershot") && msg.toLowerCase().includes("cooldown") && msg.toLowerCase().includes("ms")) {
					let ms_match = msg.match(/"ms":\s*(\d+)/) || msg.match(/ms[:=]\s*(\d+)/i);
					let ms_text = ms_match ? `, ${ms_match[1]}ms` : "";
					return `Super Shot c/d${ms_text} (${ctx})`;
				}
				return null;
			},
			GENERAL_ERROR
		],
		"huntersmark cooldown": [
			(msg, ctx) => {
				if (msg.toLowerCase().includes("huntersmark") && msg.toLowerCase().includes("cooldown") && msg.toLowerCase().includes("ms")) {
					let ms_match = msg.match(/"ms":\s*(\d+)/) || msg.match(/ms[:=]\s*(\d+)/i);
					let ms_text = ms_match ? `, ${ms_match[1]}ms` : "";
					return `Hunters Mark c/d${ms_text} (${ctx})`;
				}
				return null;
			},
			GENERAL_ERROR
		],
		"heal cooldown": [
			(msg, ctx) => {
				if (msg.toLowerCase().includes("heal") && msg.toLowerCase().includes("cooldown") && msg.toLowerCase().includes("ms")) {
					let ms_match = msg.match(/"ms":\s*(\d+)/) || msg.match(/ms[:=]\s*(\d+)/i);
					let ms_text = ms_match ? `, ${ms_match[1]}ms` : "";
					return `Heal c/d${ms_text} (${ctx})`;
				}
				return null;
			},
			GENERAL_ERROR
		],
		"missing monster": [
			(msg, ctx) => {
				if (msg.toLowerCase().includes("not_there")) {
					return `Monster already dead (${ctx})`;
				}
				return null;
			},
			GENERAL_ERROR
		],
		"out of range": [
			(msg, ctx) => {
				if (msg.toLowerCase().includes("too_far")) {
					return `Monster out of range (${ctx})`;
				}
				return null;
			},
			GENERAL_ERROR
		],
		"out of mana": [
			(msg, ctx) => {
				if (msg.toLowerCase().includes("no_mp")) {
					return `Out of mana (${ctx})`;
				}
				return null;
			},
			GENERAL_ERROR
		],
		// Add more as needed
	};

	// Robust error message extraction
	let msg;
	if (typeof e === "string") {
		msg = e;
	} else if (e && e.message) {
		msg = e.message;
	} else {
		try {
			msg = JSON.stringify(e);
		} catch {
			msg = String(e);
		}
	}

	// Check for keywords and print shorthand if matched
	for (const [keyword, value] of Object.entries(keyword_map)) {
		if (Array.isArray(value)) {
			const [handler_or_str, color] = value;
			if (typeof handler_or_str === "function") {
				const result = handler_or_str(msg, context);
				if (result) {
					log(result, color, "Errors");
					return;
				}
			} else if (msg && msg.toLowerCase().includes(keyword)) {
				log(`${handler_or_str} (${context})`, color, "Errors");
				return;
			}
		}
	}

	// Default: print full error and stack trace if available
	let stack = "";
	if (e && e.stack) {
		stack = `\nStack trace:\n${e.stack}`;
	}
	log(`⚠️ ${context}: ${msg}${stack}`, "#FF0000", "Errors");
}


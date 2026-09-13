// --------------------------------------------------------------------------------------------------------------------------------- //
// ERROR HANDLING — catcher(), the shared error-triage/logging helper
// (split out of Global Config.js — real <script> tag, same global scope, no eval boundary)
// --------------------------------------------------------------------------------------------------------------------------------- //

// --------------------------------------------------------------------------------------------------------------------------------- //
// ERROR CATCHER
// --------------------------------------------------------------------------------------------------------------------------------- //

const GENERAL_ERROR = "#ffa127ff";

const COOLDOWN_SKILLS = {
	attack: "Attack",
	"3shot": "3-Shot",
	"5shot": "5-Shot",
	supershot: "Super Shot",
	huntersmark: "Hunters Mark",
	heal: "Heal",
};

const REJECTIONS = [
	["not_there", "Monster already dead", true],
	["too_far", "Monster out of range", false],
	["no_mp", "Out of mana", false],
];

function cooldown_summary(msg) {
	const low = msg.toLowerCase();
	if (!low.includes("cooldown") || !low.includes("ms")) return null;
	for (const skill in COOLDOWN_SKILLS) {
		if (!low.includes(skill)) continue;
		const m = msg.match(/"ms":\s*(\d+)/) || msg.match(/ms[:=]\s*(\d+)/i);
		return `${COOLDOWN_SKILLS[skill]} c/d${m ? `, ${m[1]}ms` : ""}`;
	}
	return null;
}

function catcher(e, context = "Error") {
	let msg;
	if (typeof e === "string") msg = e;
	else if (e && e.message) msg = e.message;
	else {
		try { msg = JSON.stringify(e); } catch { msg = String(e); }
	}

	function report(text, quiet) {
		if (!quiet) return log(`${text} (${context})`, GENERAL_ERROR, "Errors");
		try { if (typeof errlog_record === "function") errlog_record("quiet", `${text} (${context})`); } catch (x) {}
	}

	const cd = cooldown_summary(msg || "");
	if (cd) return report(cd, true);

	const low = (msg || "").toLowerCase();
	for (const [needle, label, quiet] of REJECTIONS) {
		if (low.includes(needle)) return report(label, quiet);
	}

	const stack = e && e.stack ? `\nStack trace:\n${e.stack}` : "";
	log(`⚠️ ${context}: ${msg}${stack}`, "#FF0000", "Errors");
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// SHARED HELPERS
// --------------------------------------------------------------------------------------------------------------------------------- //

function fmt_err(e) {
	if (e && e.message) return e.message;
	try { return JSON.stringify(e); } catch (x) { return String(e); }
}

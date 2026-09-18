// --------------------------------------------------------------------------------------------------------------------------------- //
// TIMERS WINDOW — the server-side countdowns: event windows, seasonal respawns, the realm schedule
// --------------------------------------------------------------------------------------------------------------------------------- //

const TIMERS_WINDOW_ID = "timers-window";
const TIMERS_REFRESH_MS = 1000;
const TIMERS_HISTORY_SHOWN = 8;

let _timers_interval = null;

function timers_build_tag() {
	const base = window.__AL_BASE__ || "";
	const pinned = base.match(/@([0-9a-f]{7,40})\//);
	if (pinned) return pinned[1].slice(0, 7);
	return base.indexOf("@main") >= 0 ? "main (SHA lookup failed)" : "unknown";
}

function timers_ready() {
	return typeof my_realm === "function" && typeof fmt_eta === "function" && typeof local_timers === "function";
}

function timers_row(label, value, color) {
	return `<div style="display:flex;justify-content:space-between;gap:12px;">`
		+ `<span style="color:#bbb;">${label}</span>`
		+ `<span style="color:${color || "#fff"};white-space:nowrap;">${value}</span></div>`;
}

function timers_heading(text) {
	return `<div style="margin:8px 0 4px;color:#7FD1FF;font-weight:bold;border-bottom:1px solid #444;">${text}</div>`;
}

function fmt_short(value) {
	const n = Number(value) || 0;
	if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
	if (n >= 1000) return Math.round(n / 1000) + "k";
	return String(Math.round(n));
}

function server_clock(schedule) {
	if (!schedule || !isFinite(schedule.time_offset)) return "";

	const now = new Date();
	const local = (now.getUTCHours() + 24 + schedule.time_offset) % 24;
	const night = schedule.night === undefined ? local <= 5 : schedule.night;

	return `${String(local).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}`
		+ (night ? " 🌙" : "");
}

function realm_line(realm, states) {
	const now = Date.now();
	const seen = realm_timers(realm);
	const short = realm.split(" ").slice(1).join(" ") || realm;
	const here = realm === my_realm();
	const label = `<span style="color:${here ? "#9FE08F" : "#bbb"};">`
		+ `&nbsp;&nbsp;${short}${here ? " ◀" : ""}</span>`;

	if (!seen) return timers_row(label, (states || {})[realm] || "waiting", "#666");

	for (const name in seen.bosses) {
		const boss = seen.bosses[name];
		const max = boss_max_hp(name, boss);
		const pct = max && isFinite(boss.hp) ? `${Math.round((boss.hp / max) * 100)}%` : "?";
		const left = boss.end ? ` · ${fmt_eta(boss.end - now)}` : "";
		const busy = boss.target || (boss.dps && now - (boss.damaged_at || 0) < 15000)
			? ` · 🔥${fmt_short(boss.dps)}`
			: " · idle";
		return timers_row(label, `⚔️ ${name} ${pct}${left}${busy}`, "#FF9B6A");
	}

	for (const name in seen.windows) {
		return timers_row(label, `🎲 ${name} · ${fmt_eta(seen.windows[name] - now)}`, "#FFD479");
	}

	for (const name in seen.spawns) {
		return timers_row(label, `🥚 ${name} in ${fmt_eta(seen.spawns[name] - now)}`, "#9FE08F");
	}

	const last = (seen.history || [])[0];
	if (last) {
		const style = TIMERS_OUTCOMES[last.outcome] || TIMERS_OUTCOMES.gone;
		return timers_row(label,
			`${style.icon} ${last.name} ${last.outcome} ${fmt_eta(now - last.at)} ago ${last.present ? "🟢" : "⚪"}`,
			style.color);
	}

	return timers_row(label, "quiet", "#666");
}

function timers_tracker_html() {
	if (typeof region_schedules !== "function") return "";

	const now = Date.now();
	const regions = region_schedules();
	const stored = (typeof storage_read === "function" && storage_read(SERVER_WATCH_KEY)) || {};
	const next = {};

	for (const slot of next_slot_per_region()) {
		if (!next[slot.region] || slot.at < next[slot.region].at) next[slot.region] = slot;
	}

	const names = Object.keys(regions).sort();
	if (!names.length) return timers_missing_html();

	let html = "";

	for (const region of names) {
		const group = regions[region];
		const slot = next[region];
		const clock = server_clock({ time_offset: group.offset });
		const when = slot
			? `${slot.kind} ${slot.hour}:00 in ${fmt_eta(slot.at - now)}`
			: "schedule unknown";

		html += `<div style="display:flex;justify-content:space-between;gap:12px;margin-top:6px;">`
			+ `<span style="color:#7FD1FF;font-weight:bold;">${region}`
			+ `<span style="color:#666;font-weight:normal;"> ${clock}${group.observed ? "" : " *"}</span></span>`
			+ `<span style="color:${slot && slot.kind === "nightly" ? "#C9A7FF" : "#FFD479"};white-space:nowrap;">${when}</span></div>`;

		for (const realm of group.realms) html += realm_line(realm, stored.states);
	}

	return html;
}

function timers_missing_html() {
	let html = timers_row("observers", "no realms listed", "#FFA500");

	if (typeof server_watch_probe === "function") {
		for (const row of server_watch_probe()) {
			html += timers_row(`frame ${row.frame}`,
				`X.servers ${row.servers} · usable ${row.usable} · api_call ${row.api}`, "#888");
			if (row.sample) {
				html += `<div style="color:#777;word-break:break-all;margin-bottom:4px;">`
					+ row.sample.replace(/&/g, "&amp;").replace(/</g, "&lt;") + `</div>`;
			}
		}
	}

	if (typeof _watch_complained !== "undefined" && _watch_complained) {
		html += timers_row("last error", _watch_complained, "#FFA500");
	}

	return html;
}

const TIMERS_OUTCOMES = {
	started: { icon: "▶️", color: "#FFD479" },
	killed: { icon: "💀", color: "#9FE08F" },
	expired: { icon: "⌛", color: "#888" },
	gone: { icon: "❔", color: "#888" },
};

function timers_last_html(last, now) {
	const style = TIMERS_OUTCOMES[last.outcome] || TIMERS_OUTCOMES.gone;
	const seen = last.outcome === "started" && last.pct !== null && last.pct !== undefined ? ` at ${last.pct}%` : "";
	const there = last.present ? "🟢 we were there" : "⚪ away";

	return timers_row(`${style.icon} ${last.name} ${last.outcome}${seen}`,
		`${fmt_eta(now - last.at)} ago · ${there}`, style.color);
}

function timers_history_html(realms) {
	const now = Date.now();
	const rows = [];

	for (const realm in realms) {
		for (const entry of (realms[realm].history || [])) {
			rows.push({ realm, ...entry });
		}
	}

	if (!rows.length) return timers_row("observed", "nothing yet — events are recorded as they happen", "#888");

	rows.sort((a, b) => b.at - a.at);

	let html = "";
	for (const row of rows.slice(0, TIMERS_HISTORY_SHOWN)) {
		const style = TIMERS_OUTCOMES[row.outcome] || TIMERS_OUTCOMES.gone;
		const there = row.present ? "🟢" : "⚪";
		html += timers_row(`${style.icon} ${row.realm} · ${row.name} ${row.outcome}`,
			`${fmt_eta(now - row.at)} ago ${there}`, style.color);
	}
	return html;
}

function timers_seasons_html() {
	const flags = [];
	for (const name in (parent.S || {})) {
		if (parent.S[name] === true) flags.push(name);
	}
	return flags.length ? timers_row("seasons", flags.join(", "), "#9FE08F") : "";
}

function timers_hop_html() {
	const state = typeof storage_read === "function" ? storage_read(SERVER_HOP_KEY) : null;
	const last = typeof storage_read === "function" ? storage_read(SERVER_HOP_LAST_KEY) : null;
	const now = Date.now();

	let html = "";

	if (state && state.away) {
		html += timers_row("hop", state.returning ? `returning to ${state.home}` : `${state.boss} on ${state.away}`, "#7FD1FF");
		if (state.left_at) html += timers_row("returns by", fmt_eta(state.left_at + SERVER_HOP.max_stay_ms - now), "#7FD1FF");
	} else if (last && now - (last.at || 0) < SERVER_HOP.cooldown_ms) {
		html += timers_row("hop cooldown", fmt_eta(last.at + SERVER_HOP.cooldown_ms - now), "#888");
	} else {
		html += timers_row("hop", "ready", "#888");
	}

	const candidates = typeof bosses_elsewhere === "function" ? bosses_elsewhere() : [];
	for (const candidate of candidates.slice(0, 3)) {
		html += timers_row(candidate === candidates[0] ? "joinable now" : "&nbsp;",
			`${candidate.name} ${Math.round(candidate.ratio * 100)}% on ${candidate.realm}`
			+ (candidate.busy ? ` · 🔥${fmt_short(candidate.dps)}` : " · idle"),
			candidate.busy ? "#FF9B6A" : "#888");
	}

	return html;
}

function timers_html() {
	if (!timers_ready()) return timers_row("server watch", "not loaded", "#FF7B7B");

	const realms = typeof watch_realms === "function" ? watch_realms() : {};
	const lease = typeof storage_read === "function" ? storage_read(SERVER_WATCH_LEASE_KEY) : null;

	let html = timers_heading(`Event tracker — ${lease ? lease.name : "no watcher"}`);
	html += timers_tracker_html();
	html += timers_seasons_html();

	html += timers_heading("Recent events — 🟢 we were there");
	html += timers_history_html(realms);

	html += timers_heading("Server hop");
	html += timers_hop_html();

	html += `<div style="margin-top:8px;color:#555;text-align:right;">build ${timers_build_tag()}</div>`;

	return html;
}

function close_timers_window() {
	const doc = parent.document;
	const existing = doc.getElementById(TIMERS_WINDOW_ID);
	if (existing) existing.remove();
	if (_timers_interval) {
		clearInterval(_timers_interval);
		_timers_interval = null;
	}
}

function open_timers_window() {
	const doc = parent.document;
	if (doc.getElementById(TIMERS_WINDOW_ID)) return close_timers_window();

	const div = doc.createElement("div");
	div.id = TIMERS_WINDOW_ID;
	div.style.position = "absolute";
	const WINDOW_WIDTH = 380;
	div.style.left = (parent.window.innerWidth - WINDOW_WIDTH - 24) + "px";
	div.style.top = "80px";
	div.style.width = WINDOW_WIDTH + "px";
	div.style.maxHeight = (parent.window.innerHeight - 140) + "px";
	div.style.background = "rgba(12,12,12,0.96)";
	div.style.color = "#fff";
	div.style.zIndex = 9999;
	div.style.fontSize = "12px";
	div.style.fontFamily = "sans-serif";
	div.style.border = "2px solid #888";
	div.style.borderRadius = "4px";
	div.style.overflow = "hidden";
	div.style.display = "flex";
	div.style.flexDirection = "column";

	const drag_handle = doc.createElement("div");
	drag_handle.style.height = "24px";
	drag_handle.style.background = "#444";
	drag_handle.style.cursor = "move";
	drag_handle.style.display = "flex";
	drag_handle.style.alignItems = "center";
	drag_handle.style.justifyContent = "space-between";
	drag_handle.style.padding = "0 8px";
	drag_handle.style.fontWeight = "bold";
	drag_handle.style.flex = "0 0 auto";
	drag_handle.innerHTML = `<span>⏳ Timers — ${character.name}</span><span style="cursor:pointer;">✖</span>`;
	drag_handle.lastChild.onclick = close_timers_window;
	make_draggable(div, drag_handle);
	div.appendChild(drag_handle);

	const body = doc.createElement("div");
	body.style.padding = "8px 10px 10px";
	body.style.overflowY = "auto";
	body.style.flex = "1 1 auto";
	div.appendChild(body);
	doc.body.appendChild(div);

	const paint = () => {
		if (!doc.getElementById(TIMERS_WINDOW_ID)) return close_timers_window();
		try {
			body.innerHTML = timers_html();
		} catch (e) {
			body.innerHTML = timers_row("error", String(e && e.message), "#FF7B7B");
		}
	};

	paint();
	_timers_interval = setInterval(paint, TIMERS_REFRESH_MS);
}

function add_timers_button() {
	const $ = parent.$;
	const trc = $("#toprightcorner");
	const pause_btn = $("#pause-btn");
	if (!trc.length || !pause_btn.length) return setTimeout(add_timers_button, 500);

	$("#timers-btn").remove();

	const timers_btn = $(`
	<div id="timers-btn" class="gamebutton" style="cursor: pointer;" title="Event windows, respawns and the realm schedule">
		⏳
	</div>`);
	timers_btn.on("click", open_timers_window);

	pause_btn.after(timers_btn);
}
add_timers_button();

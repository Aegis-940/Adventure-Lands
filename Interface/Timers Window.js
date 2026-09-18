// --------------------------------------------------------------------------------------------------------------------------------- //
// TIMERS WINDOW — every countdown the client can see: realms, events, respawns, conditions, cooldowns
// --------------------------------------------------------------------------------------------------------------------------------- //

const TIMERS_WINDOW_ID = "timers-window";
const TIMERS_REFRESH_MS = 1000;
const TIMERS_DAILY_ROTATION = ["crabxx", "goobrawl", "abtesting"];
const TIMERS_NIGHTLY_ROTATION = ["icegolem", "franky"];

let _timers_interval = null;

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

function server_clock(schedule) {
	if (!schedule) return null;
	const offset = schedule.time_offset || 0;
	const now = new Date();
	const local = (now.getUTCHours() + 24 + offset) % 24;
	return `${String(local).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}`
		+ (schedule.night ? " 🌙" : "");
}

function timers_realm_html(realm, seen, detailed) {
	if (!seen) return timers_row(realm, "not watched", "#888");

	const now = Date.now();
	let html = "";

	for (const name in seen.bosses) {
		const boss = seen.bosses[name];
		const max = boss_max_hp(name, boss);
		const pct = max && isFinite(boss.hp) ? `${Math.round((boss.hp / max) * 100)}%` : "?";
		const left = boss.end ? fmt_eta(boss.end - now) : "no limit";
		const where = detailed && boss.map ? ` ${boss.map}${isFinite(boss.x) ? ` ${Math.round(boss.x)},${Math.round(boss.y)}` : ""}` : "";
		html += timers_row(`⚔️ ${name}${where}`, `${pct} · ${left}`, "#FF9B6A");
		if (detailed && boss.target) html += timers_row("&nbsp;&nbsp;holding", boss.target, "#888");
	}

	for (const name in seen.windows) {
		html += timers_row(`🎲 ${name}`, fmt_eta(seen.windows[name] - now), "#FFD479");
	}

	for (const name in seen.spawns) {
		html += timers_row(`🥚 ${name}`, fmt_eta(seen.spawns[name] - now), "#9FE08F");
	}

	const windows = next_event_windows(seen.schedule);
	if (windows.length) {
		html += timers_row(`⏳ next ${windows[0].kind}`, fmt_eta(windows[0].at - now), "#C9A7FF");
		if (detailed && windows[1]) {
			html += timers_row(`⏳ then ${windows[1].kind}`, fmt_eta(windows[1].at - now), "#C9A7FF");
		}
	}

	if (detailed && seen.schedule) {
		const clock = server_clock(seen.schedule);
		if (clock) html += timers_row("🕑 server clock", clock, "#888");
		html += timers_row("dailies", (seen.schedule.dailies || []).map(h => `${h}:00`).join(", "), "#888");
		html += timers_row("nightlies", (seen.schedule.nightlies || []).map(h => `${h}:00`).join(", "), "#888");
	}

	if (!html) html = timers_row(realm, "quiet", "#888");
	return html;
}

function timers_seasons_html() {
	const flags = [];
	for (const name in (parent.S || {})) {
		if (parent.S[name] === true) flags.push(name);
	}
	return flags.length ? timers_row("seasons", flags.join(", "), "#9FE08F") : "";
}

function timers_conditions_html() {
	const s = character.s || {};
	const timed = [];
	const flags = [];

	for (const name in s) {
		const cond = s[name];
		const definition = (G.conditions && G.conditions[name]) || {};
		const label = definition.name || name;
		if (cond && isFinite(cond.ms) && cond.ms > 0) timed.push({ label, ms: cond.ms, bad: !!definition.debuff });
		else flags.push(label);
	}

	timed.sort((a, b) => a.ms - b.ms);

	let html = "";
	for (const c of timed) html += timers_row(c.bad ? `☠️ ${c.label}` : `✨ ${c.label}`, fmt_eta(c.ms), c.bad ? "#FF7B7B" : "#9FE08F");
	if (flags.length) html += timers_row("flags", flags.join(", "), "#888");
	if (!html) html = timers_row("conditions", "none", "#888");
	return html;
}

function timers_cooldowns_html() {
	const now = Date.now();
	const rows = [];

	for (const name in (parent.next_skill || {})) {
		const at = parent.next_skill[name];
		const ms = (at instanceof Date ? at.getTime() : new Date(at).getTime()) - now;
		if (isFinite(ms) && ms > 250) rows.push({ name, ms });
	}

	rows.sort((a, b) => a.ms - b.ms);

	let html = "";
	for (const row of rows.slice(0, 8)) html += timers_row(`⏱️ ${row.name}`, fmt_eta(row.ms), "#FFD479");
	return html || timers_row("cooldowns", "all ready", "#888");
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
	if (candidates.length) {
		html += timers_row("joinable now", candidates.map(c => `${c.name} ${Math.round(c.ratio * 100)}% (${c.realm})`).join(", "), "#FF9B6A");
	}

	return html;
}

function timers_html() {
	if (!timers_ready()) return timers_row("server watch", "not loaded", "#FF7B7B");

	const mine = my_realm();
	const realms = typeof watch_realms === "function" ? watch_realms() : {};
	const lease = typeof storage_read === "function" ? storage_read(SERVER_WATCH_LEASE_KEY) : null;

	let html = timers_heading(`This realm — ${mine}`);
	html += timers_realm_html(mine, local_timers(), true);
	html += timers_seasons_html();

	html += timers_heading("Other realms");
	const others = Object.keys(realms).filter(r => r !== mine).sort();
	if (!others.length) {
		html += timers_row("observers", lease ? `${lease.name} watching, nothing reported yet` : "no watcher", "#888");
	}
	for (const realm of others) {
		const age = Math.round((Date.now() - (realms[realm].at || 0)) / 1000);
		html += timers_heading(`${realm} <span style="float:right;font-weight:normal;color:#888;">${age}s ago</span>`);
		html += timers_realm_html(realm, realms[realm], false);
	}

	html += timers_heading("Rotation (not broadcast — inferred order)");
	html += timers_row("dailies", TIMERS_DAILY_ROTATION.join(" → "), "#888");
	html += timers_row("nightlies", TIMERS_NIGHTLY_ROTATION.join(" → "), "#888");

	html += timers_heading(`${character.name} — server hop`);
	html += timers_hop_html();

	html += timers_heading(`${character.name} — conditions`);
	html += timers_conditions_html();

	html += timers_heading(`${character.name} — cooldowns`);
	html += timers_cooldowns_html();

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
	const WINDOW_WIDTH = 340;
	div.style.left = (parent.window.innerWidth - WINDOW_WIDTH - 24) + "px";
	div.style.top = "80px";
	div.style.width = WINDOW_WIDTH + "px";
	div.style.maxHeight = (parent.window.innerHeight - 140) + "px";
	div.style.background = "rgba(0,0,0,0.88)";
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
	<div id="timers-btn" class="gamebutton" style="cursor: pointer;" title="Event, respawn and cooldown timers">
		⏳
	</div>`);
	timers_btn.on("click", open_timers_window);

	pause_btn.after(timers_btn);
}
add_timers_button();

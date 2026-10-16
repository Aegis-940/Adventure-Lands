const DAMAGE_TYPES = ["Base", "Burn", "Blast", "DPS"];

const DAMAGE_TYPE_COLORS = {
	Base: "#A92000",
	Blast: "#782D33",
	Burn: "#FF7F27",
	DPS: "#FFD700",
};

const METER_START = performance.now();
const DPS_WINDOW_MS = 5 * 60 * 1000;
const DPS_MAX_EVENTS = 20000;

let player_damage_sums = {};

function get_player_entry(id) {
	if (!player_damage_sums[id]) player_damage_sums[id] = { start_time: performance.now(), Base: [], Burn: [], Blast: [], DPS: [] };
	return player_damage_sums[id];
}

function push_damage(entry, type, value) {
	entry[type].push({ t: performance.now(), v: value });
}

function dps_meter_hit(data) {
	if (!parent.party_list.includes(data.hid) && !parent.party_list.includes(data.id)) return;
	const attacker = get_player(data.hid);
	const victim = get_player(data.id);

	if (victim && !attacker) {
		for (const returned of [data.dreturn, data.reflect]) if (returned) push_damage(get_player_entry(data.id), "DPS", returned);
	}
	if (victim && data.damage) get_player_entry(data.id);
	if (!attacker) return;
	if (data.damage || data.dreturn || data.reflect || data.heal || data.lifesteal || data.manasteal) get_player_entry(data.hid);
	if (!data.damage) return;
	const entry = get_player_entry(data.hid);
	push_damage(entry, data.source === "burn" ? "Burn" : data.splash ? "Blast" : "Base", data.damage);
	push_damage(entry, "DPS", data.damage);
}

function prune_dps_events() {
	const cutoff = performance.now() - DPS_WINDOW_MS;
	let deepest = 0;
	for (const id in player_damage_sums) {
		for (const type of DAMAGE_TYPES) {
			const events = prune_before(player_damage_sums[id][type], cutoff);
			if (events.length > DPS_MAX_EVENTS) events.splice(0, events.length - DPS_MAX_EVENTS);
			deepest = Math.max(deepest, events.length);
		}
	}
	errlog_size("mem dps events", deepest);
}

function get_type_value(type, entry) {
	const now = performance.now();
	const window_start = Math.max(entry.start_time, now - DPS_WINDOW_MS);
	const window_ms = now - window_start;
	if (window_ms <= 0) return 0;
	return Math.floor(window_sum(entry[type], window_start) * 1000 / window_ms);
}

function dps_meter_html() {
	const elapsed_ms = performance.now() - METER_START;
	const hrs = Math.floor(elapsed_ms / 3600000);
	const mins = Math.floor((elapsed_ms % 3600000) / 60000);

	const rows = Object.keys(player_damage_sums)
		.map(id => {
			const entry = player_damage_sums[id];
			const vals = {};
			for (const type of DAMAGE_TYPES) vals[type] = get_type_value(type, entry);
			return { player: get_player(id), vals, dps: get_type_value("DPS", entry) };
		})
		.filter(row => row.player)
		.sort((a, b) => b.dps - a.dps);

	const headers = DAMAGE_TYPES
		.map(type => `<th style="color:${DAMAGE_TYPE_COLORS[type]}">${type}</th>`)
		.join("");

	const body = rows
		.map(({ player, vals }) => {
			const colour = CLASS_COLORS[player.ctype.toLowerCase()] || "#FFFFFF";
			return `<tr><td style="color:${colour}">${player.name}</td>`
				+ DAMAGE_TYPES.map(type => `<td>${commas(vals[type])}</td>`).join("")
				+ "</tr>";
		})
		.join("");

	const totals = `<tr><td style="color:${DAMAGE_TYPE_COLORS.DPS}">Total DPS</td>`
		+ DAMAGE_TYPES.map(type => `<td>${commas(rows.reduce((sum, r) => sum + r.vals[type], 0))}</td>`).join("")
		+ "</tr>";

	return `<div>👑 Elapsed Time: ${hrs}h ${mins}m 👑</div>`
		+ '<table>'
		+ `<tr><th></th>${headers}</tr>${body}${totals}</table>`;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// BOOT
// --------------------------------------------------------------------------------------------------------------------------------- //

on_boot("DPS Meter", () => {
	on_socket("hit", "dps_meter_hit_handler", dps_meter_hit);
	register_widget("dpsmeter", {
		tick_ms: 250,
		render: () => dps_meter_html(),
	});
	every("prune dps events", { ms: 1000, kind: "ui", fixed: true }, prune_dps_events);
});

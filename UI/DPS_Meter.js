// All currently supported DAMAGE_TYPES: "Base", "Blast", "Burn", "HPS", "MPS", "DR", "RF", "DPS", "Dmg Taken"
// Displaying too many "Types" will result in a really wide meter that will effect the game_log window. i recommend only tracking 4/5 things at a time for general use
const DAMAGE_TYPES = ["Base", "Burn", "Blast", "DPS"];

// Toggle settings
let DISPLAY_CLASS_TYPE_COLORS = true;
let DISPLAY_DAMAGE_TYPE_COLORS = true;
let SHOW_OVERHEAL = false;
let SHOW_OVER_MANASTEAL = true;

// Color mapping
const DAMAGE_TYPE_COLORS = {
	Base: "#A92000",
	Blast: "#782D33",
	Burn: "#FF7F27",
	HPS: "#9A1D27",
	MPS: "#353C9C",
	DR: "#E94959",
	RF: "#D880F0",
	DPS: "#FFD700",
	"Dmg Taken": "#FF4C4C"
};

// Initialize the class color mapping
const CLASS_COLORS = {
	mage: "#3FC7EB",
	paladin: "#F48CBA",
	priest: "#FFFFFF",
	ranger: "#AAD372",
	rogue: "#FFF468",
	warrior: "#C69B6D"
};

// Overall-sums variables (optional use)
let damage = 0, burn_damage = 0, blast_damage = 0, base_damage = 0;
let base_heal = 0, lifesteal = 0, manasteal = 0, dreturn = 0, reflect = 0;
const METER_START = performance.now();

// Per-member tracking
let player_damage_sums = {};

function get_player_entry(id) {
	if (!player_damage_sums[id]) {
		player_damage_sums[id] = {
			start_time: performance.now(),
			sum_damage: 0,
			sum_burn_damage: 0,
			sum_blast_damage: 0,
			sum_base_damage: 0,
			sum_heal: 0,
			sum_lifesteal: 0,
			sum_mana_steal: 0,
			sum_damage_return: 0,
			sum_reflection: 0,
			sum_damage_taken_phys: 0,
			sum_damage_taken_mag: 0,
			// Rolling‐window event buffers:
			damage_events: [],
			burn_events: [],
			blast_events: [],
			base_events: [],
			heal_events: [],
			mana_steal_events: [],
			dreturn_events: [],
			reflect_events: [],
			dmg_taken_phys_events: [],
			dmg_taken_mag_events: []
		};
	}
	return player_damage_sums[id];
}

function get_formatted(val) {
	return val.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function init_dps_meter() {
	const container = create_bottomrightcorner_widget("dpsmeter", {
		fontSize: "20px", color: "white", textAlign: "center", display: "table",
		overflow: "hidden", marginBottom: "-3px", width: "100%", backgroundColor: "rgba(0,0,0,0.6)"
	});
	container.append(
		parent.$("<div id='dpsmetercontent'></div>").css({
			display: "table-cell", verticalAlign: "middle", padding: "2px",
			border: "4px solid grey"
		})
	);
}

// Handle all hit events. Guard against duplicate registration if this script
// is re-injected without a full page reload (parent.socket persists across that).
if (parent.socket._dps_meter_hit_handler) {
	parent.socket.off("hit", parent.socket._dps_meter_hit_handler);
}

parent.socket._dps_meter_hit_handler = data => {
	const is_party = id => parent.party_list.includes(id);
	try {
		// == Party-only filter ==
		const attacker_in_party = is_party(data.hid);
		const target_in_party   = is_party(data.id);
		if (!attacker_in_party && !target_in_party) return;

		// == Overall sums ==
		if (data.damage) {
			damage += data.damage;
			if (data.source === "burn") burn_damage  += data.damage;
			else if (data.splash)   blast_damage += data.damage;
			else                     base_damage  += data.damage;
		}
		if (data.heal || data.lifesteal) {
			base_heal    += (data.heal    ?? 0) + (data.lifesteal ?? 0);
			lifesteal   += data.lifesteal ?? 0;
		}
		if (data.manasteal) manasteal += data.manasteal;

		// == Damage Return attribution (only mob→player) ==
		if (data.dreturn && get_player(data.id) && !get_player(data.hid)) {
			dreturn += data.dreturn;
			const e = get_player_entry(data.id);
			if (e.sum_damage_return == null) e.sum_damage_return = 0;
			e.sum_damage_return += data.dreturn;
			// Rolling window
			e.dreturn_events.push({ t: performance.now(), v: data.dreturn });
			e.damage_events.push ({ t: performance.now(), v: data.dreturn });
		}

		// == Reflection attribution (only mob→player) ==
		if (data.reflect && get_player(data.id) && !get_player(data.hid)) {
			reflect += data.reflect;
			const e = get_player_entry(data.id);
			if (e.sum_reflection == null) e.sum_reflection = 0;
			e.sum_reflection += data.reflect;
			// Rolling window
			e.reflect_events.push({ t: performance.now(), v: data.reflect });
			e.damage_events.push ({ t: performance.now(), v: data.reflect });
		}

		// == Damage taken by character ==
		if (data.damage && get_player(data.id)) {
			const e = get_player_entry(data.id);
			if (data.damage_type === "physical") {
				e.sum_damage_taken_phys += data.damage;
				e.dmg_taken_phys_events.push({ t: performance.now(), v: data.damage });
			} else {
				e.sum_damage_taken_mag += data.damage;
				e.dmg_taken_mag_events.push({ t: performance.now(), v: data.damage });
			}
		}
		// — self-damage from hitting a dreturn mob (physical)
		if (data.dreturn && get_player(data.hid)) {
			const e = get_player_entry(data.hid);
			e.sum_damage_taken_phys += data.dreturn;
			e.dmg_taken_phys_events.push({ t: performance.now(), v: data.dreturn });
		}
		// — self-damage from hitting a reflect mob (magical)
		if (data.reflect && get_player(data.hid)) {
			const e = get_player_entry(data.hid);
			e.sum_damage_taken_mag += data.reflect;
			e.dmg_taken_mag_events.push({ t: performance.now(), v: data.reflect });
		}

		// == Character actions – Heal / Lifesteal ==
		if (get_player(data.hid) && (data.heal || data.lifesteal)) {
			const e = get_player_entry(data.hid);
			const healer = get_player(data.hid);
			const target = get_player(data.id);
			const total_heal = (data.heal ?? 0) + (data.lifesteal ?? 0);
			if (SHOW_OVERHEAL) {
				e.sum_heal += total_heal;
				e.heal_events.push({ t: performance.now(), v: total_heal });
			} else {
				const actual_heal =
					(data.heal ? Math.min(data.heal, (target?.max_hp ?? 0) - (target?.hp ?? 0)) : 0)
					+ (data.lifesteal ? Math.min(data.lifesteal, healer.max_hp - healer.hp) : 0);
				e.sum_heal += actual_heal;
				e.heal_events.push({ t: performance.now(), v: actual_heal });
			}
		}

		// == Mana steal ==
		if (get_player(data.hid) && data.manasteal) {
			const e = get_player_entry(data.hid);
			const p = get_entity(data.hid);
			const amount = SHOW_OVER_MANASTEAL
				? data.manasteal
				: Math.min(data.manasteal, p.max_mp - p.mp);
			e.sum_mana_steal += amount;
			e.mana_steal_events.push({ t: performance.now(), v: amount });
		}

		// == Other damage done (per-player breakdown) ==
		if (data.damage && get_player(data.hid)) {
			const e = get_player_entry(data.hid);
			e.sum_damage += data.damage;
			if (data.source === "burn") {
				e.sum_burn_damage += data.damage;
				e.burn_events.push({ t: performance.now(), v: data.damage });
			} else if (data.splash) {
				e.sum_blast_damage += data.damage;
				e.blast_events.push({ t: performance.now(), v: data.damage });
			} else {
				e.sum_base_damage += data.damage;
				e.base_events.push({ t: performance.now(), v: data.damage });
			}
			// Rolling window
			e.damage_events.push({ t: performance.now(), v: data.damage });
		}
	} catch (err) {
		console.error("hit handler error", err);
	}
};

parent.socket.on("hit", parent.socket._dps_meter_hit_handler);

const DPS_WINDOW_MS = 5 * 60 * 1000;

// Drop events older than the rolling window so the per-type buffers don't grow forever.
// Events are pushed in chronological order, so a prefix trim is sufficient.
function prune_entry_events(entry) {
	const cutoff = performance.now() - DPS_WINDOW_MS;
	for (const key in entry) {
		if (!key.endsWith("Events")) continue;
		const arr = entry[key];
		let i = 0;
		while (i < arr.length && arr[i].t < cutoff) i++;
		if (i > 0) arr.splice(0, i);
	}
}

// Compute stat value for type using a 5-minute rolling window
function get_type_value(type, entry) {
	const now = performance.now();
	const window_start = Math.max(entry.start_time, now - DPS_WINDOW_MS);
	const window_ms = now - window_start;
	if (window_ms <= 0) return 0;

	function sum_events(arr) {
		return arr.reduce((sum, ev) => ev.t >= window_start ? sum + ev.v : sum, 0);
	}

	switch (type) {
		case "DPS": {
			const total = sum_events(entry.damage_events);
			return Math.floor(total * 1000 / window_ms);
		}
		case "Burn": {
			const total = sum_events(entry.burn_events);
			return Math.floor(total * 1000 / window_ms);
		}
		case "Blast": {
			const total = sum_events(entry.blast_events);
			return Math.floor(total * 1000 / window_ms);
		}
		case "Base": {
			const total = sum_events(entry.base_events);
			return Math.floor(total * 1000 / window_ms);
		}
		case "HPS": {
			const total = sum_events(entry.heal_events);
			return Math.floor(total * 1000 / window_ms);
		}
		case "MPS": {
			const total = sum_events(entry.mana_steal_events);
			return Math.floor(total * 1000 / window_ms);
		}
		case "DR": {
			const total = sum_events(entry.dreturn_events);
			return Math.floor(total * 1000 / window_ms);
		}
		case "RF": {
			const total = sum_events(entry.reflect_events);
			return Math.floor(total * 1000 / window_ms);
		}
		case "Dmg Taken": {
			const phys = sum_events(entry.dmg_taken_phys_events);
			const mag  = sum_events(entry.dmg_taken_mag_events);
			return {
				phys: Math.floor(phys * 1000 / window_ms),
				mag:  Math.floor(mag  * 1000 / window_ms)
			};
		}
		default:
			return 0;
	}
}

// Calculate DPS for sorting (also rolling window)
function calculate_dps_for_entry(entry) {
	const now = performance.now();
	const window_start = Math.max(entry.start_time, now - DPS_WINDOW_MS);
	const window_ms = now - window_start;
	if (window_ms <= 0) return 0;
	const total = entry.damage_events.reduce((sum, ev) => ev.t >= window_start ? sum + ev.v : sum, 0);
	return Math.floor(total * 1000 / window_ms);
}

// Render the DPS meter UI
function update_dps_meter_ui() {
	const $ = parent.$;
	const c = $("#dpsmetercontent");
	if (!c.length) return;

	// Elapsed time display
	const elapsed_ms = performance.now() - METER_START;
	const hrs = Math.floor(elapsed_ms / 3600000);
	const mins = Math.floor((elapsed_ms % 3600000) / 60000);

	let html = `<div>👑 Elapsed Time: ${hrs}h ${mins}m 👑</div>` +
		'<table border="1" style="width:100%"><tr><th></th>';

	// Header row
	DAMAGE_TYPES.forEach(t => {
		const col = DISPLAY_DAMAGE_TYPE_COLORS ? DAMAGE_TYPE_COLORS[t] || "white" : "white";
		html += `<th style="color:${col}">${t}</th>`;
	});
	html += "</tr>";

	Object.values(player_damage_sums).forEach(prune_entry_events);

	// Player rows
	const sorted = Object.entries(player_damage_sums)
		.map(([id, e]) => ({ id, dps: calculate_dps_for_entry(e), e }))
		.sort((a, b) => b.dps - a.dps);

	sorted.forEach(({ id, e }) => {
		const p = get_player(id);
		if (!p) return;
		const name_col = DISPLAY_CLASS_TYPE_COLORS
			? CLASS_COLORS[p.ctype.toLowerCase()] || "#FFFFFF"
			: "#FFFFFF";
		html += `<tr><td style="color:${name_col}">${p.name}</td>`;
		DAMAGE_TYPES.forEach(t => {
			if (t === "Dmg Taken") {
				const { phys, mag } = get_type_value(t, e);
				html += `<td><span style="color:#FF4C4C">${get_formatted(phys)}</span> | <span style="color:#6ECFF6">${get_formatted(mag)}</span></td>`;
			} else {
				const val = get_type_value(t, e);
				html += `<td>${get_formatted(val)}</td>`;
			}
		});
		html += "</tr>";
	});

	// Total row (unchanged logic)
	html += `<tr><td style="color:${DAMAGE_TYPE_COLORS["DPS"]}">Total DPS</td>`;
	DAMAGE_TYPES.forEach(t => {
		if (t === "Dmg Taken") {
			let tot_p = 0, tot_m = 0;
			Object.values(player_damage_sums).forEach(e => {
				const { phys, mag } = get_type_value(t, e);
				tot_p += phys; tot_m += mag;
			});
			html += `<td><span style="color:#FF4C4C">${get_formatted(tot_p)}</span> | <span style="color:#6ECFF6">${get_formatted(tot_m)}</span></td>`;
		} else if (t === "DPS") {
			// Same 5-minute rolling window as the per-player rows above, so this reconciles with their sum.
			const total_dps = sorted.reduce((sum, p) => sum + p.dps, 0);
			html += `<td>${get_formatted(total_dps)}</td>`;
		} else {
			let tot = 0;
			Object.values(player_damage_sums).forEach(e => tot += get_type_value(t, e));
			html += `<td>${get_formatted(tot)}</td>`;
		}
	});

	html += "</tr></table>";
	c.html(html);
}

// Initialize and run — create_bottomrightcorner_widget() lives in Shared/Widgets.js,
// which Bootstrapper.js loads in parallel with this file (no ordering guarantee), so
// retry until it's actually available instead of assuming it already is.
(function start_dps_meter() {
	if (typeof create_bottomrightcorner_widget !== "function") {
		return void setTimeout(start_dps_meter, 100);
	}
	init_dps_meter();
})();
setInterval(update_dps_meter_ui, 250);

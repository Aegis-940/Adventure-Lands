const DAMAGE_TYPES = ["Base", "Burn", "Blast", "DPS"];

let DISPLAY_CLASS_TYPE_COLORS = true;
let DISPLAY_DAMAGE_TYPE_COLORS = true;
let SHOW_OVERHEAL = false;
let SHOW_OVER_MANASTEAL = true;

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

let damage = 0, burn_damage = 0, blast_damage = 0, base_damage = 0;
let base_heal = 0, lifesteal = 0, manasteal = 0, dreturn = 0, reflect = 0;
const METER_START = performance.now();

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

if (parent.socket._dps_meter_hit_handler) {
	parent.socket.off("hit", parent.socket._dps_meter_hit_handler);
}

parent.socket._dps_meter_hit_handler = data => {
	const is_party = id => parent.party_list.includes(id);
	try {
		const attacker_in_party = is_party(data.hid);
		const target_in_party   = is_party(data.id);
		if (!attacker_in_party && !target_in_party) return;

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

		if (data.dreturn && get_player(data.id) && !get_player(data.hid)) {
			dreturn += data.dreturn;
			const e = get_player_entry(data.id);
			if (e.sum_damage_return == null) e.sum_damage_return = 0;
			e.sum_damage_return += data.dreturn;
			e.dreturn_events.push({ t: performance.now(), v: data.dreturn });
			e.damage_events.push ({ t: performance.now(), v: data.dreturn });
		}

		if (data.reflect && get_player(data.id) && !get_player(data.hid)) {
			reflect += data.reflect;
			const e = get_player_entry(data.id);
			if (e.sum_reflection == null) e.sum_reflection = 0;
			e.sum_reflection += data.reflect;
			e.reflect_events.push({ t: performance.now(), v: data.reflect });
			e.damage_events.push ({ t: performance.now(), v: data.reflect });
		}

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
		if (data.dreturn && get_player(data.hid)) {
			const e = get_player_entry(data.hid);
			e.sum_damage_taken_phys += data.dreturn;
			e.dmg_taken_phys_events.push({ t: performance.now(), v: data.dreturn });
		}
		if (data.reflect && get_player(data.hid)) {
			const e = get_player_entry(data.hid);
			e.sum_damage_taken_mag += data.reflect;
			e.dmg_taken_mag_events.push({ t: performance.now(), v: data.reflect });
		}

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

		if (get_player(data.hid) && data.manasteal) {
			const e = get_player_entry(data.hid);
			const p = get_entity(data.hid);
			const amount = SHOW_OVER_MANASTEAL
				? data.manasteal
				: Math.min(data.manasteal, p.max_mp - p.mp);
			e.sum_mana_steal += amount;
			e.mana_steal_events.push({ t: performance.now(), v: amount });
		}

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
			e.damage_events.push({ t: performance.now(), v: data.damage });
		}
	} catch (err) {
		console.error("hit handler error", err);
	}
};

parent.socket.on("hit", parent.socket._dps_meter_hit_handler);

const DPS_WINDOW_MS = 5 * 60 * 1000;
const DPS_MAX_EVENTS = 20000;

function prune_entry_events(entry) {
	const cutoff = performance.now() - DPS_WINDOW_MS;
	for (const key in entry) {
		if (!key.endsWith("_events")) continue;
		const arr = prune_before(entry[key], cutoff);
		if (arr.length > DPS_MAX_EVENTS) arr.splice(0, arr.length - DPS_MAX_EVENTS);
	}
}

function prune_dps_events() {
	let deepest = 0;
	for (const id in player_damage_sums) {
		const entry = player_damage_sums[id];
		prune_entry_events(entry);
		for (const key in entry) {
			if (key.endsWith("_events") && entry[key].length > deepest) deepest = entry[key].length;
		}
	}
	errlog_size("mem dps events", deepest);
}

const DAMAGE_TYPE_SERIES = {
	DPS: "damage_events",
	Burn: "burn_events",
	Blast: "blast_events",
	Base: "base_events",
	HPS: "heal_events",
	MPS: "mana_steal_events",
	DR: "dreturn_events",
	RF: "reflect_events",
};

function get_type_value(type, entry) {
	const now = performance.now();
	const window_start = Math.max(entry.start_time, now - DPS_WINDOW_MS);
	const window_ms = now - window_start;
	if (window_ms <= 0) return type === "Dmg Taken" ? { phys: 0, mag: 0 } : 0;

	const per_second = series => Math.floor(window_sum(entry[series], window_start) * 1000 / window_ms);

	if (type === "Dmg Taken") {
		return { phys: per_second("dmg_taken_phys_events"), mag: per_second("dmg_taken_mag_events") };
	}

	const series = DAMAGE_TYPE_SERIES[type];
	return series ? per_second(series) : 0;
}

function dps_cell(type, value) {
	if (type !== "Dmg Taken") return `<td>${commas(value)}</td>`;
	return `<td><span style="color:#FF4C4C">${commas(value.phys)}</span>`
		+ ` | <span style="color:#6ECFF6">${commas(value.mag)}</span></td>`;
}

function dps_total(type, rows) {
	if (type !== "Dmg Taken") return rows.reduce((sum, r) => sum + r.vals[type], 0);
	return {
		phys: rows.reduce((sum, r) => sum + r.vals[type].phys, 0),
		mag: rows.reduce((sum, r) => sum + r.vals[type].mag, 0),
	};
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
		.map(type => {
			const colour = DISPLAY_DAMAGE_TYPE_COLORS ? DAMAGE_TYPE_COLORS[type] || "white" : "white";
			return `<th style="color:${colour}">${type}</th>`;
		})
		.join("");

	const body = rows
		.map(({ player, vals }) => {
			const colour = DISPLAY_CLASS_TYPE_COLORS
				? CLASS_COLORS[player.ctype.toLowerCase()] || "#FFFFFF"
				: "#FFFFFF";
			return `<tr><td style="color:${colour}">${player.name}</td>`
				+ DAMAGE_TYPES.map(type => dps_cell(type, vals[type])).join("")
				+ "</tr>";
		})
		.join("");

	const totals = `<tr><td style="color:${DAMAGE_TYPE_COLORS.DPS}">Total DPS</td>`
		+ DAMAGE_TYPES.map(type => dps_cell(type, dps_total(type, rows))).join("")
		+ "</tr>";

	return `<div>👑 Elapsed Time: ${hrs}h ${mins}m 👑</div>`
		+ '<table border="1" style="width:100%">'
		+ `<tr><th></th>${headers}</tr>${body}${totals}</table>`;
}

register_widget("dpsmeter", {
	tick_ms: 250,
	container: {
		fontSize: "20px", color: "white", textAlign: "center", display: "table",
		overflow: "hidden", marginBottom: "-3px", width: "100%", backgroundColor: "rgba(0,0,0,0.6)",
	},
	content: {
		display: "table-cell", verticalAlign: "middle", padding: "2px",
		border: "4px solid grey",
	},
	render: () => dps_meter_html(),
});

setInterval(prune_dps_events, 1000);

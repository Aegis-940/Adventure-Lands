// --------------------------------------------------------------------------------------------------------------------------------- //
// METRICS GRAPHS — the 📊 popout: session gold, XP, party DPS, kills, loot and boss contribution, with charts
// --------------------------------------------------------------------------------------------------------------------------------- //

const METRICS_START = performance.now();
const METRICS_SAMPLE_MS = 5000;
const METRICS_MAX_SAMPLES = 60;
const METRICS_INCLUDE_OVERHEAL = false;
const METRICS_INCLUDE_OVER_MANA = false;

const METRICS_INTERVAL_SECONDS = { second: 1, minute: 60, hour: 3600, day: 86400 };

const METRICS_SECTION_COLORS = {
	gold: "#FFD700",
	xp: "#3B8ED2",
	dps: "#E94959",
	kills: "#B484E5",
	items: "#7AC0F5",
	coop: "#E9973A",
};

const METRICS_DAMAGE_TYPES = {
	DPS: { label: "Total DPS", button: "Total", color: "#E53935" },
	Base: { label: "Base Damage", button: "Base", color: "#6D1B7B" },
	Cleave: { label: "Cleave Damage", button: "Cleave", color: "#8D6E63" },
	Blast: { label: "Blast Damage", button: "Blast", color: "#FB8C00" },
	Burn: { label: "Burn Damage", button: "Burn", color: "#FDD835" },
	HPS: { label: "Healing", button: "Heal", color: "#43A047" },
	MPS: { label: "Mana Steal", button: "Mana", color: "#1E88E5" },
	DR: { label: "Damage Return", button: "Return", color: "#546E7A" },
	Reflect: { label: "Reflection", button: "Reflect", color: "#26A69A" },
};

const METRICS_MOB_COLORS = ["#FF6B9D", "#4ECDC4", "#FFE66D", "#95E1D3", "#FF8B94", "#A8E6CF", "#FFD3B6", "#FFAAA5", "#AA96DA", "#FCBAD3"];
const METRICS_ITEM_COLORS = [
	"#00E5FF", "#69F0AE", "#FFD740", "#FF6D00", "#EA80FC", "#F06292", "#AED581", "#4FC3F7",
	"#FFB74D", "#CE93D8", "#80CBC4", "#DCE775", "#FF8A65", "#90CAF9", "#A5D6A7",
];

const METRICS_MUTED = "#8A8D8F";
const METRICS_AXIS = "#2A2A2A";
const METRICS_PAD = 60;
const METRICS_LABEL_H = 50;
const METRICS_SCROLL_H = 12;
const METRICS_GROUP_W = 80;
const METRICS_BAR_W = 50;

const metrics = {
	gold: 0,
	largest_gold: 0,
	xp: 0,
	xp_level: character.level,
	xp_last: character.xp,
	kills: 0,
	mob_kills: {},
	items: {},
	damage: {},
	gold_history: [],
	xp_history: [],
};

const metrics_view = {
	gold: "hour",
	xp: "second",
	kills: "day",
	damage_types: ["DPS"],
	offsets: { kill_chart: 0, item_chart: 0, coop_chart: 0 },
	counts: { kill_chart: 0, item_chart: 0, coop_chart: 0 },
	drag: null,
	timer: null,
};

const metrics_palette = { mobs: {}, items: {} };

// --------------------------------------------------------------------------------------------------------------------------------- //
// COLLECTION
// --------------------------------------------------------------------------------------------------------------------------------- //

function metrics_elapsed_s() {
	return (performance.now() - METRICS_START) / 1000;
}

function metrics_damage_entry(id) {
	if (!metrics.damage[id]) {
		metrics.damage[id] = { start: performance.now(), DPS: 0, Base: 0, Cleave: 0, Blast: 0, Burn: 0, HPS: 0, MPS: 0, DR: 0, Reflect: 0 };
	}
	return metrics.damage[id];
}

function metrics_damage_rate(id, type) {
	const entry = metrics.damage[id];
	if (!entry) return 0;
	const elapsed = performance.now() - entry.start;
	return elapsed > 0 ? Math.floor(entry[type] * 1000 / elapsed) : 0;
}

function metrics_damage_kind(data) {
	if (data.source === "burn") return "Burn";
	if (data.splash) return "Blast";
	if (data.source === "cleave") return "Cleave";
	return "Base";
}

function metrics_record_hit(data) {
	const in_party = id => parent.party_list.includes(id);
	const attacker = get_player(data.hid);
	const target = get_player(data.id);

	if (target && !attacker && in_party(data.id)) {
		const e = metrics_damage_entry(data.id);
		if (data.dreturn) {
			e.DR += data.dreturn;
			e.DPS += data.dreturn;
		}
		if (data.reflect) {
			e.Reflect += data.reflect;
			e.DPS += data.reflect;
		}
	}

	if (!attacker || !in_party(data.hid)) return;
	const e = metrics_damage_entry(data.hid);

	if (data.heal || data.lifesteal) {
		const heal = data.heal || 0;
		const lifesteal = data.lifesteal || 0;
		e.HPS += METRICS_INCLUDE_OVERHEAL
			? heal + lifesteal
			: Math.min(heal, target ? target.max_hp - target.hp : 0) + Math.min(lifesteal, attacker.max_hp - attacker.hp);
	}
	if (data.manasteal) {
		e.MPS += METRICS_INCLUDE_OVER_MANA ? data.manasteal : Math.min(data.manasteal, attacker.max_mp - attacker.mp);
	}
	if (data.damage) {
		e.DPS += data.damage;
		e[metrics_damage_kind(data)] += data.damage;
	}
}

function metrics_track_xp() {
	if (character.level !== metrics.xp_level) {
		metrics.xp += parent.G.levels[metrics.xp_level] - metrics.xp_last + character.xp;
	} else {
		metrics.xp += character.xp - metrics.xp_last;
	}
	metrics.xp_level = character.level;
	metrics.xp_last = character.xp;
}

function metrics_push_sample(history, value) {
	history.push({ t: performance.now(), v: value });
	if (history.length > METRICS_MAX_SAMPLES) history.shift();
}

function metrics_sample() {
	metrics_track_xp();
	const elapsed = metrics_elapsed_s();
	metrics_push_sample(metrics.gold_history, metrics.gold / elapsed);
	metrics_push_sample(metrics.xp_history, metrics.xp / elapsed);
}

if (parent.socket._metrics_hit_handler) {
	parent.socket.off("hit", parent.socket._metrics_hit_handler);
}
parent.socket._metrics_hit_handler = metrics_record_hit;
parent.socket.on("hit", parent.socket._metrics_hit_handler);

if (parent.socket._metrics_kill_handler) {
	parent.socket.off("kill_credit", parent.socket._metrics_kill_handler);
}
parent.socket._metrics_kill_handler = data => {
	metrics.kills++;
	metrics.mob_kills[data.mtype] = (metrics.mob_kills[data.mtype] || 0) + 1;
};
parent.socket.on("kill_credit", parent.socket._metrics_kill_handler);

character.on("loot", data => {
	if (typeof data.gold === "number" && !Number.isNaN(data.gold)) {
		const chest_total = Math.round(data.gold / (parent.party[character.name]?.share || 1));
		metrics.gold += chest_total;
		if (chest_total > metrics.largest_gold) metrics.largest_gold = chest_total;
	}
	for (const item of data.items || []) {
		metrics.items[item.name] = (metrics.items[item.name] || 0) + (item.q || 1);
	}
});

setInterval(metrics_sample, METRICS_SAMPLE_MS);

// --------------------------------------------------------------------------------------------------------------------------------- //
// FORMATTING
// --------------------------------------------------------------------------------------------------------------------------------- //

function metrics_capitalise(text) {
	return text.charAt(0).toUpperCase() + text.slice(1);
}

function metrics_nice_max(raw) {
	if (raw <= 0) return 1;
	const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
	for (const step of [1, 2, 2.5, 5, 10]) {
		const candidate = Math.ceil(raw / (magnitude * step)) * magnitude * step;
		if (candidate >= raw) return candidate;
	}
	return Math.ceil(raw / magnitude) * magnitude;
}

function metrics_short(value) {
	const a = Math.abs(value);
	if (a >= 1e9) return parseFloat((value / 1e9).toFixed(2)) + "B";
	if (a >= 1e6) return parseFloat((value / 1e6).toFixed(2)) + "M";
	if (a >= 1e3) return parseFloat((value / 1e3).toFixed(1)) + "K";
	return value.toLocaleString();
}

function metrics_duration(seconds) {
	const d = Math.floor(seconds / 86400);
	const h = Math.floor((seconds % 86400) / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	return `${d}d ${h}h ${m}m`;
}

function metrics_hex_to_rgba(hex, alpha) {
	return `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${alpha})`;
}

function metrics_assigned_color(map, palette, key) {
	if (!map[key]) map[key] = palette[Object.keys(map).length % palette.length];
	return map[key];
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// CANVAS DRAWING
// --------------------------------------------------------------------------------------------------------------------------------- //

function metrics_canvas(id) {
	const canvas = parent.document.getElementById(id);
	const rect = canvas.getBoundingClientRect();
	if (canvas.width !== rect.width || canvas.height !== rect.height) {
		canvas.width = rect.width;
		canvas.height = rect.height;
	}
	const ctx = canvas.getContext("2d");
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	return ctx;
}

function metrics_empty(ctx, text) {
	ctx.fillStyle = METRICS_MUTED;
	ctx.font = "24px pixel, monospace";
	ctx.textAlign = "center";
	ctx.fillText(text, ctx.canvas.width / 2, ctx.canvas.height / 2);
}

function metrics_outlined_text(ctx, text, x, y, font, color) {
	ctx.font = font;
	ctx.textAlign = "center";
	ctx.lineWidth = 3;
	ctx.strokeStyle = "black";
	ctx.strokeText(text, x, y);
	ctx.fillStyle = color;
	ctx.fillText(text, x, y);
}

function metrics_grid(ctx, chart_h, max_value) {
	ctx.strokeStyle = METRICS_AXIS;
	ctx.lineWidth = 1;
	for (let i = 0; i <= 5; i++) {
		const y = METRICS_PAD + chart_h * (1 - i / 5);
		ctx.beginPath();
		ctx.moveTo(METRICS_PAD, y);
		ctx.lineTo(ctx.canvas.width - METRICS_PAD, y);
		ctx.stroke();

		ctx.fillStyle = METRICS_MUTED;
		ctx.font = "16px pixel, monospace";
		ctx.textAlign = "right";
		ctx.fillText(metrics_short(max_value * i / 5), METRICS_PAD - 10, y + 5);
	}
}

function metrics_line_chart(id, history, scale, color) {
	const ctx = metrics_canvas(id);
	const canvas = ctx.canvas;
	if (history.length < 2) return metrics_empty(ctx, "Collecting data...");

	const values = history.map(s => s.v * scale);
	const range = metrics_nice_max(Math.max(1, ...values) * 1.1);

	ctx.font = "18px pixel, monospace";
	const pad = ctx.measureText(metrics_short(range)).width + 15;
	const gw = canvas.width - 2 * pad;
	const gh = canvas.height - 2 * pad;
	const point = i => ({ x: pad + gw * i / (values.length - 1), y: canvas.height - pad - gh * values[i] / range });

	ctx.strokeStyle = METRICS_AXIS;
	ctx.lineWidth = 1;
	for (let i = 0; i <= 5; i++) {
		const y = pad + gh * i / 5;
		ctx.beginPath();
		ctx.moveTo(pad, y);
		ctx.lineTo(canvas.width - pad, y);
		ctx.stroke();
	}

	ctx.strokeStyle = "#555";
	ctx.lineWidth = 2;
	ctx.beginPath();
	ctx.moveTo(pad, pad);
	ctx.lineTo(pad, canvas.height - pad);
	ctx.lineTo(canvas.width - pad, canvas.height - pad);
	ctx.stroke();

	ctx.fillStyle = color + "26";
	ctx.beginPath();
	ctx.moveTo(pad, canvas.height - pad);
	values.forEach((_, i) => ctx.lineTo(point(i).x, point(i).y));
	ctx.lineTo(pad + gw, canvas.height - pad);
	ctx.closePath();
	ctx.fill();

	ctx.strokeStyle = color;
	ctx.lineWidth = 2;
	ctx.beginPath();
	values.forEach((_, i) => (i ? ctx.lineTo(point(i).x, point(i).y) : ctx.moveTo(point(i).x, point(i).y)));
	ctx.stroke();

	ctx.fillStyle = color;
	values.forEach((_, i) => ctx.fillRect(point(i).x - 3, point(i).y - 3, 6, 6));

	ctx.fillStyle = METRICS_MUTED;
	ctx.font = "18px pixel, monospace";
	ctx.textAlign = "right";
	for (let i = 0; i <= 5; i++) {
		ctx.fillText(metrics_short(range * i / 5), pad - 6, canvas.height - pad - gh * i / 5 + 4);
	}

	const minutes = Math.round((history[history.length - 1].t - history[0].t) / 60000);
	ctx.textAlign = "center";
	ctx.fillText(`Last ${minutes} min${minutes !== 1 ? "s" : ""}`, canvas.width / 2, canvas.height - 10);
}

function metrics_bar_chart(id, rows, empty_text, accent) {
	const ctx = metrics_canvas(id);
	const canvas = ctx.canvas;
	metrics_view.counts[id] = rows.length;
	if (!rows.length) return metrics_empty(ctx, empty_text);

	const chart_h = canvas.height - METRICS_PAD - METRICS_LABEL_H - METRICS_SCROLL_H - 6;
	const chart_w = canvas.width - 2 * METRICS_PAD;
	const visible_count = Math.floor(chart_w / METRICS_GROUP_W);
	const offset = Math.min(metrics_view.offsets[id], Math.max(0, rows.length - visible_count));
	metrics_view.offsets[id] = offset;

	const visible = rows.slice(offset, offset + visible_count);
	const centre = visible.length < visible_count ? (chart_w - visible.length * METRICS_GROUP_W) / 2 : 0;
	const max_value = metrics_nice_max(Math.max(1, ...visible.map(r => r.value)) * 1.1);

	metrics_grid(ctx, chart_h, max_value);

	visible.forEach((row, i) => {
		const group_x = METRICS_PAD + centre + i * METRICS_GROUP_W;
		const bar_h = row.value / max_value * chart_h;
		const bar_x = group_x + (METRICS_GROUP_W - METRICS_BAR_W) / 2;
		const bar_y = METRICS_PAD + chart_h - bar_h;
		const centre_x = bar_x + METRICS_BAR_W / 2;

		ctx.fillStyle = row.color;
		ctx.fillRect(bar_x, bar_y, METRICS_BAR_W, bar_h);
		ctx.strokeStyle = "gray";
		ctx.lineWidth = 2;
		ctx.strokeRect(bar_x, bar_y, METRICS_BAR_W, bar_h);

		metrics_outlined_text(ctx, row.top, centre_x, Math.max(18, bar_y - 6), "20px pixel, monospace", row.top_color || "white");
		if (row.inside && bar_h > 30) metrics_outlined_text(ctx, row.inside, centre_x, bar_y + 18, "16px pixel, monospace", "white");

		const label_y = METRICS_PAD + chart_h + METRICS_SCROLL_H + 14;
		ctx.fillStyle = row.color;
		ctx.font = "16px pixel, monospace";
		ctx.textAlign = "center";
		ctx.fillText(row.label, centre_x, label_y);
		if (row.sublabel) {
			ctx.fillStyle = METRICS_MUTED;
			ctx.font = "14px pixel, monospace";
			ctx.fillText(row.sublabel, centre_x, label_y + 16);
		}
	});

	if (rows.length > visible_count) {
		const track_y = METRICS_PAD + chart_h + 4;
		ctx.fillStyle = "#222";
		ctx.fillRect(METRICS_PAD, track_y, chart_w, METRICS_SCROLL_H);
		ctx.fillStyle = accent + "AA";
		ctx.fillRect(METRICS_PAD + offset / rows.length * chart_w, track_y, Math.max(30, visible_count / rows.length * chart_w), METRICS_SCROLL_H);

		ctx.fillStyle = METRICS_MUTED;
		ctx.font = "14px pixel, monospace";
		ctx.textAlign = "right";
		ctx.fillText(`${offset + 1}–${offset + visible.length} of ${rows.length}`, canvas.width - METRICS_PAD, METRICS_PAD - 8);
	}
}

function metrics_dps_chart() {
	const ctx = metrics_canvas("dps_chart");
	const canvas = ctx.canvas;
	const types = metrics_view.damage_types;

	const players = Object.keys(metrics.damage)
		.map(id => get_player(id))
		.filter(Boolean)
		.map(player => {
			const values = {};
			for (const type of types) values[type] = metrics_damage_rate(player.id, type);
			return { name: player.name, color: CLASS_COLORS[player.ctype] || "#FFFFFF", values, total: types.reduce((sum, t) => sum + values[t], 0) };
		})
		.sort((a, b) => b.total - a.total);

	if (!players.length) return metrics_empty(ctx, "No data available");
	if (!types.length) return metrics_empty(ctx, "Select a damage type to display");

	const chart_h = canvas.height - METRICS_PAD - 40;
	const chart_w = canvas.width - 2 * METRICS_PAD;
	const max_value = metrics_nice_max(Math.max(1, ...players.flatMap(p => types.map(t => p.values[t]))) * 1.1);

	metrics_grid(ctx, chart_h, max_value);

	const group_w = chart_w / players.length;
	const bar_w = Math.min(group_w / types.length - 10, 60);
	const group_pad = (group_w - bar_w * types.length) / 2;

	players.forEach((player, i) => {
		const group_x = METRICS_PAD + i * group_w;
		types.forEach((type, j) => {
			const value = player.values[type];
			const bar_h = value / max_value * chart_h;
			const bar_x = group_x + group_pad + j * bar_w;
			const bar_y = METRICS_PAD + chart_h - bar_h;

			ctx.fillStyle = type === "DPS" ? player.color : METRICS_DAMAGE_TYPES[type].color;
			ctx.fillRect(bar_x, bar_y, bar_w, bar_h);
			ctx.strokeStyle = "gray";
			ctx.lineWidth = 2;
			ctx.strokeRect(bar_x, bar_y, bar_w, bar_h);

			if (bar_h > 30) metrics_outlined_text(ctx, value.toLocaleString(), bar_x + bar_w / 2, bar_y + 15, "18px pixel, monospace", "white");
		});

		ctx.fillStyle = player.color;
		ctx.font = "16px pixel, monospace";
		ctx.textAlign = "center";
		ctx.fillText(player.name, group_x + group_w / 2, canvas.height - 20 - (players.length > 9 && i % 2 ? 8 : 0));
	});

	let legend_x = METRICS_PAD;
	for (const type of types) {
		ctx.fillStyle = type === "DPS" && players.length === 1 ? players[0].color : METRICS_DAMAGE_TYPES[type].color;
		ctx.fillRect(legend_x, 10, 15, 15);
		ctx.fillStyle = "#E4E4E4";
		ctx.font = "16px pixel, monospace";
		ctx.textAlign = "left";
		ctx.fillText(METRICS_DAMAGE_TYPES[type].label, legend_x + 20, 22);
		legend_x += ctx.measureText(METRICS_DAMAGE_TYPES[type].label).width + 40;
	}
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// SECTIONS
// --------------------------------------------------------------------------------------------------------------------------------- //

function metrics_kill_rows() {
	const scale = METRICS_INTERVAL_SECONDS[metrics_view.kills] / metrics_elapsed_s();
	return Object.entries(metrics.mob_kills)
		.map(([mtype, count]) => ({
			label: metrics_capitalise(mtype),
			value: count * scale,
			top: commas(count * scale),
			color: metrics_assigned_color(metrics_palette.mobs, METRICS_MOB_COLORS, mtype),
		}))
		.sort((a, b) => b.value - a.value);
}

function metrics_item_rows() {
	const days = metrics_elapsed_s() / 86400;
	return Object.entries(metrics.items)
		.map(([name, count]) => ({
			label: name,
			sublabel: count.toLocaleString(),
			value: count / days,
			top: commas(count / days),
			color: metrics_assigned_color(metrics_palette.items, METRICS_ITEM_COLORS, name),
		}))
		.sort((a, b) => b.value - a.value);
}

function metrics_coop_rows(entries) {
	const total_weight = coop_total_weight(entries);
	return entries.map(e => {
		const color = CLASS_COLORS[e.ctype.toLowerCase()] || "#FFFFFF";
		const share = coop_share_weight(e.points) / total_weight;
		return {
			label: e.name,
			value: e.points,
			top: `${(share * 100).toFixed(1)}%`,
			top_color: share > COOP_CREDIT_SHARE ? color : "#D95A55",
			inside: commas(e.points),
			color,
		};
	});
}

function metrics_mob_breakdown() {
	const sorted = Object.entries(metrics.mob_kills).sort((a, b) => b[1] - a[1]);
	if (!sorted.length) return `<div style="text-align:center;color:${METRICS_MUTED};padding:20px;">No kills yet...</div>`;

	const cards = sorted.map(([mtype, count]) => {
		const color = metrics_assigned_color(metrics_palette.mobs, METRICS_MOB_COLORS, mtype);
		return `<div class="md-mob"><span style="color:${color};display:block;font-size:20px;">${mtype}</span>`
			+ `<span style="display:block;color:#C3C3C3;">${count.toLocaleString()} (${(count / metrics.kills * 100).toFixed(1)}%)</span></div>`;
	}).join("");

	return `<div style="text-align:center;color:${METRICS_SECTION_COLORS.kills};font-size:24px;margin-bottom:10px;">Mob Breakdown</div>`
		+ `<div style="display:flex;justify-content:center;gap:8px;flex-wrap:wrap;">${cards}</div>`;
}

function metrics_render() {
	const $ = parent.$;
	if (!$("#metrics_dashboard").is(":visible")) return;

	metrics_track_xp();
	const elapsed = metrics_elapsed_s();
	const per = section => METRICS_INTERVAL_SECONDS[metrics_view[section]];

	$("#md_gold_rate_label").text(`Gold/${metrics_capitalise(metrics_view.gold)}`);
	$("#md_gold_rate").text(commas(metrics.gold / elapsed * per("gold")));
	$("#md_gold_jackpot").text(commas(metrics.largest_gold));
	$("#md_gold_total").text(commas(metrics.gold));

	const xp_per_second = metrics.xp / elapsed;
	$("#md_xp_rate_label").text(`XP/${metrics_capitalise(metrics_view.xp)}`);
	$("#md_xp_rate").text(commas(xp_per_second * per("xp")));
	$("#md_xp_level").text(xp_per_second > 0 ? metrics_duration((parent.G.levels[character.level] - character.xp) / xp_per_second) : "--");
	$("#md_xp_total").text(commas(metrics.xp));

	const party_dps = Object.keys(metrics.damage).reduce((sum, id) => sum + metrics_damage_rate(id, "DPS"), 0);
	$("#md_dps_party").text(commas(party_dps));
	$("#md_dps_own").text(commas(metrics_damage_rate(character.id, "DPS")));
	$("#md_dps_session").text(`${Math.floor(elapsed / 3600)}h ${Math.floor((elapsed % 3600) / 60)}m`);

	$("#md_kill_rate_label").text(`Kills/${metrics_capitalise(metrics_view.kills)}`);
	$("#md_kill_rate").text(commas(metrics.kills / elapsed * per("kills")));
	$("#md_kill_total").text(commas(metrics.kills));
	$("#md_mob_breakdown").html(metrics_mob_breakdown());

	const item_counts = Object.values(metrics.items);
	$("#md_item_total").text(commas(item_counts.reduce((sum, q) => sum + q, 0)));
	$("#md_item_unique").text(item_counts.length);

	const coop = coop_contributors();
	const party_coop = coop.filter(e => parent.party_list.includes(e.name));
	const party_weight = party_coop.reduce((sum, e) => sum + coop_share_weight(e.points), 0);
	$("#md_coop_party").text(commas(party_coop.reduce((sum, e) => sum + e.points, 0)));
	$("#md_coop_share").text(`${(party_weight / coop_total_weight(coop) * 100).toFixed(2)}%`);

	metrics_line_chart("gold_chart", metrics.gold_history, per("gold"), METRICS_SECTION_COLORS.gold);
	metrics_line_chart("xp_chart", metrics.xp_history, per("xp"), METRICS_SECTION_COLORS.xp);
	metrics_dps_chart();
	metrics_bar_chart("kill_chart", metrics_kill_rows(), "No kills yet...", METRICS_SECTION_COLORS.kills);
	metrics_bar_chart("item_chart", metrics_item_rows(), "No items looted yet...", METRICS_SECTION_COLORS.items);
	metrics_bar_chart("coop_chart", metrics_coop_rows(coop), "No boss damage yet...", METRICS_SECTION_COLORS.coop);
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// DASHBOARD
// --------------------------------------------------------------------------------------------------------------------------------- //

function metrics_card(id, label) {
	return `<div class="md-card"><div class="md-label" id="${id}_label">${label}</div><div class="md-value" id="${id}">0</div></div>`;
}

function metrics_interval_buttons(section, intervals) {
	return `<div class="md-buttons">` + intervals.map(interval =>
		`<button class="gamebutton gamebutton-small md-btn md-interval${interval === metrics_view[section] ? " md-active" : ""}"`
		+ ` data-section="${section}" data-interval="${interval}">${metrics_capitalise(interval)}</button>`
	).join("") + `</div>`;
}

function metrics_damage_buttons() {
	return Object.entries(METRICS_DAMAGE_TYPES).map(([type, def]) => {
		const active = metrics_view.damage_types.includes(type);
		return `<button class="gamebutton gamebutton-small md-btn md-damage" data-type="${type}"`
			+ ` style="border-color:${def.color};background:${active ? metrics_hex_to_rgba(def.color, 0.4) : "#000"}">${def.button}</button>`;
	}).join("");
}

function metrics_section(key, title, body) {
	return `<div class="md-section" data-section="${key}" style="--md-color:${METRICS_SECTION_COLORS[key]}"><h3>${title}</h3>${body}</div>`;
}

function metrics_grid_html(cards) {
	return `<div class="md-grid">${cards.join("")}</div>`;
}

function ensure_metrics_styles() {
	const $ = parent.$;
	if ($("#metrics_dashboard_styles").length) return;
	$("<style id='metrics_dashboard_styles'>").text(`
		#metrics_dashboard{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:min(1250px,calc(100vw - 40px));overflow:hidden;background:#000;border:5px solid gray;z-index:9999;font-size:24px}
		#metrics_backdrop{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:9998}
		#metrics_dashboard .md-header{display:flex;justify-content:space-between;align-items:center;padding:6px 12px;border-bottom:5px solid gray;user-select:none}
		#metrics_dashboard .md-title{color:#F1C054;font-size:32px}
		#metrics_dashboard .md-content{padding:12px 16px;color:#E4E4E4;max-height:calc(100vh - 130px);overflow-y:auto;overflow-x:hidden}
		#metrics_dashboard .md-section{margin-bottom:18px;padding-top:14px;border-top:2px solid #555}
		#metrics_dashboard .md-section h3{display:inline-block;margin:0 0 12px;font-size:28px;font-weight:normal;border-bottom:2px dashed gray;color:var(--md-color)}
		#metrics_dashboard .md-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px;margin-bottom:12px}
		#metrics_dashboard .md-card{background:#000;border:2px solid gray;padding:8px 12px;text-align:left}
		#metrics_dashboard .md-label{font-size:20px;color:${METRICS_MUTED};margin-bottom:4px}
		#metrics_dashboard .md-value{font-size:28px;color:var(--md-color)}
		#metrics_dashboard .md-buttons{display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap}
		#metrics_dashboard .md-btn{font-family:inherit;font-size:22px;line-height:24px;padding:6px 10px;min-width:70px;color:#E4E4E4;cursor:pointer;border:3px solid gray;background:#000}
		#metrics_dashboard .md-interval.md-active{border-color:var(--md-color)}
		#metrics_dashboard .md-chart{background:#000;border:2px solid gray;width:100%;height:500px;display:block}
		#metrics_dashboard .md-breakdown{background:#000;border:2px solid gray;margin-top:8px;padding:10px}
		#metrics_dashboard .md-mob{text-align:center;font-size:18px;background:#000;border:2px solid gray;padding:6px 16px;min-width:120px}
	`).appendTo("head");
}

function create_metrics_dashboard() {
	const $ = parent.$;
	ensure_metrics_styles();

	const sections = [
		metrics_section("gold", "Gold Tracking",
			metrics_grid_html([metrics_card("md_gold_rate", "Gold/Hour"), metrics_card("md_gold_jackpot", "Largest Drop"), metrics_card("md_gold_total", "Total Gold")])
			+ metrics_interval_buttons("gold", ["minute", "hour", "day"])
			+ `<canvas id="gold_chart" class="md-chart"></canvas>`),
		metrics_section("xp", "XP Tracking",
			metrics_grid_html([metrics_card("md_xp_rate", "XP/Second"), metrics_card("md_xp_level", "Time to Level"), metrics_card("md_xp_total", "Total XP Gained")])
			+ metrics_interval_buttons("xp", ["second", "minute", "hour", "day"])
			+ `<canvas id="xp_chart" class="md-chart"></canvas>`),
		metrics_section("dps", "DPS Tracking",
			metrics_grid_html([metrics_card("md_dps_party", "Party Total"), metrics_card("md_dps_own", "Your Total"), metrics_card("md_dps_session", "Session Time")])
			+ `<div class="md-buttons" id="md_damage_buttons">${metrics_damage_buttons()}</div>`
			+ `<canvas id="dps_chart" class="md-chart"></canvas>`),
		metrics_section("kills", "Kill Tracking",
			metrics_grid_html([metrics_card("md_kill_rate", "Kills/Day"), metrics_card("md_kill_total", "Total Kills")])
			+ metrics_interval_buttons("kills", ["minute", "hour", "day"])
			+ `<canvas id="kill_chart" class="md-chart"></canvas><div id="md_mob_breakdown" class="md-breakdown"></div>`),
		metrics_section("items", "Item Tracking",
			metrics_grid_html([metrics_card("md_item_total", "Total Looted"), metrics_card("md_item_unique", "Unique Items")])
			+ `<canvas id="item_chart" class="md-chart"></canvas>`),
		metrics_section("coop", "Boss Contribution",
			metrics_grid_html([metrics_card("md_coop_party", "Party Points"), metrics_card("md_coop_share", "Party Loot Share")])
			+ `<canvas id="coop_chart" class="md-chart"></canvas>`),
	];

	const dashboard = $(`<div id="metrics_dashboard">
		<div class="md-header"><span class="md-title">Performance Metrics</span><button class="gamebutton md-btn md-close" style="min-width:40px">X</button></div>
		<div class="md-content">${sections.join("")}</div>
	</div>`).css("font-family", $("#bottomrightcorner").css("font-family") || "pixel");

	$("body").append($('<div id="metrics_backdrop"></div>'), dashboard);

	$("#metrics_backdrop").on("click", close_metrics_dashboard);
	dashboard.on("click", ".md-close", close_metrics_dashboard);

	dashboard.on("click", ".md-interval", function () {
		const button = $(this);
		metrics_view[button.data("section")] = button.data("interval");
		button.siblings().removeClass("md-active");
		button.addClass("md-active");
		metrics_render();
	});

	dashboard.on("click", ".md-damage", function () {
		const type = $(this).data("type");
		const types = metrics_view.damage_types;
		metrics_view.damage_types = types.includes(type) ? types.filter(t => t !== type) : [...types, type];
		$("#md_damage_buttons").html(metrics_damage_buttons());
		metrics_render();
	});

	dashboard.on("mousedown", ".md-chart", function (e) {
		const id = this.id;
		if (!(id in metrics_view.offsets)) return;
		const rect = this.getBoundingClientRect();
		const local_y = (e.clientY - rect.top) * this.height / rect.height;
		const track_y = this.height - METRICS_LABEL_H - METRICS_SCROLL_H - 2;
		if (local_y < track_y || local_y > track_y + METRICS_SCROLL_H) return;
		metrics_view.drag = { id, start_x: e.clientX, start_offset: metrics_view.offsets[id], width: this.width };
	});

	$(parent.document)
		.on("mousemove.metrics_dashboard", e => {
			const drag = metrics_view.drag;
			if (!drag) return;
			const count = metrics_view.counts[drag.id];
			const chart_w = drag.width - 2 * METRICS_PAD;
			const max_offset = Math.max(0, count - Math.floor(chart_w / METRICS_GROUP_W));
			const delta = Math.round((e.clientX - drag.start_x) * count / chart_w);
			metrics_view.offsets[drag.id] = Math.max(0, Math.min(max_offset, drag.start_offset + delta));
			metrics_render();
		})
		.on("mouseup.metrics_dashboard", () => {
			metrics_view.drag = null;
		})
		.on("keydown.metrics_dashboard", e => {
			if (e.key === "Escape" && $("#metrics_dashboard").is(":visible")) close_metrics_dashboard();
		});
}

function close_metrics_dashboard() {
	parent.$("#metrics_dashboard, #metrics_backdrop").hide();
	clearInterval(metrics_view.timer);
	metrics_view.timer = null;
}

function toggle_metrics_dashboard() {
	const $ = parent.$;
	if ($("#metrics_dashboard").is(":visible")) return close_metrics_dashboard();
	if (!$("#metrics_dashboard").length) create_metrics_dashboard();

	$("#metrics_dashboard, #metrics_backdrop").show();
	metrics_render();
	if (!metrics_view.timer) metrics_view.timer = setInterval(metrics_render, 1000);
}

parent.$("#metrics_dashboard, #metrics_backdrop, #metrics_dashboard_styles").remove();
parent.$(parent.document).off(".metrics_dashboard");
add_toprightcorner_button("metrics_button", "📊", toggle_metrics_dashboard);

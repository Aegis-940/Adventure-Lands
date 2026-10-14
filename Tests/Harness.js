"use strict";

// --------------------------------------------------------------------------------------------------------------------------------- //
// HARNESS — boots the bot offline in a vm context shaped like the code iframe, over the game's own runner_functions.js, and runs
// the deciders against fixtures recorded in the live game
//
//   node Tests/Harness.js load                   boot all four roles; any throw at load is reported by file
//   node Tests/Harness.js decide <fixture>       print every decision for one fixture
//   node Tests/Harness.js golden [fixture...]    record Tests/goldens/<fixture>.json
//   node Tests/Harness.js check                  every fixture twice: identical to itself and to its golden
//   node Tests/Harness.js promote <n|id> <label> copy a snapshot from snapshots.jsonl into Tests/fixtures, anonymised
// --------------------------------------------------------------------------------------------------------------------------------- //

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const crypto = require("crypto");
const { REPO, source, acorn, read_repo_file } = require("./Game Sources.js");
const { bootstrap_lists } = require("./Analyze.js");

const FIXTURES = path.join(REPO, "Tests", "fixtures");
const GOLDENS = path.join(REPO, "Tests", "goldens");
const SNAPSHOTS = path.join(REPO, "snapshots.jsonl");

const PARTY = ["Ulric", "Myras", "Riva", "Riff"];
const CTYPE = { Ulric: "warrior", Myras: "priest", Riva: "ranger", Riff: "merchant" };
const ENTRY_POINTS = new Set(["Warrior.js", "Healer.js", "Ranger.js", "Merchant.js"]);

const PARENT_CALLS = ["activate", "api_call", "auto_craft", "buy", "buy_with_gold", "buy_with_shells", "character_code_eval",
	"close_merchant", "compound", "craft", "d_text", "dismantle", "exchange", "exchange_buy", "game_stringify",
	"get_active_characters", "get_code_file", "get_settings", "giveaway", "is_hidden", "join", "join_giveaway", "json_to_html",
	"lock_item", "map_keys_and_skills", "move", "open_chest", "open_merchant", "party_say", "pause", "performance_trick", "poof",
	"private_say", "remove_chat", "render_item", "render_skills", "say", "seal_item", "sell", "send_code_message",
	"send_target_logic", "set_setting", "set_status", "shift", "show_json", "show_modal", "skill_timeout", "split",
	"stop_character_runner", "storage_get", "storage_set", "trade", "trade_buy", "trade_sell", "unlock_item", "upgrade",
	"use_skill", "wishlist"];

// --------------------------------------------------------------------------------------------------------------------------------- //
// THE IFRAME — a black hole for the DOM, a recording socket, captured timers, a frozen clock and seeded storage
// --------------------------------------------------------------------------------------------------------------------------------- //

function black_hole() {
	const target = function () { };
	const hole = new Proxy(target, {
		get(t, key) {
			if (key === "then") return undefined;
			if (key === "length") return 0;
			if (key === Symbol.iterator) return function* () { };
			if (key === Symbol.toPrimitive) return () => "";
			if (key === "toString" || key === "valueOf") return () => "";
			return hole;
		},
		apply: () => hole,
		construct: () => hole,
		set: () => true,
		has: () => false,
	});
	return hole;
}

function seeded_random(seed) {
	let a = seed >>> 0;
	return function () {
		a = (a + 0x6D2B79F5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function frozen_date(now) {
	return class FrozenDate extends Date {
		constructor(...args) {
			if (args.length) super(...args);
			else super(now);
		}
		static now() {
			return now;
		}
	};
}

class Storage {
	constructor(seed) {
		this._map = new Map(Object.entries(seed || {}));
	}
	get length() {
		return this._map.size;
	}
	key(i) {
		return [...this._map.keys()][i] ?? null;
	}
	getItem(k) {
		return this._map.has(k) ? this._map.get(k) : null;
	}
	setItem(k, v) {
		this._map.set(k, String(v));
	}
	removeItem(k) {
		this._map.delete(k);
	}
	clear() {
		this._map.clear();
	}
}

function recording_socket(log) {
	const listeners = {};
	return {
		on(event, fn) {
			(listeners[event] = listeners[event] || []).push(fn);
			log.socket_on.push(event);
		},
		once(event, fn) {
			this.on(event, fn);
		},
		off(event, fn) {
			if (listeners[event]) listeners[event] = listeners[event].filter(f => f !== fn);
		},
		emit(event, payload) {
			log.emits.push({ event, payload });
		},
		listeners,
	};
}

function error_text(x) {
	if (x && x.stack) return x.stack.split("\n").slice(0, 4).join(" | ");
	return String(x);
}

function next_skill_dates(map, FrozenDate) {
	const out = {};
	for (const k in map || {}) out[k] = new FrozenDate(map[k]);
	return out;
}

function build_context(fixture, G, log) {
	const now = fixture.t;
	const FrozenDate = frozen_date(now);
	const perf_offset = (fixture.perf || 0) - now;

	const parent = {
		character: JSON.parse(JSON.stringify(fixture.character)),
		entities: JSON.parse(JSON.stringify(fixture.entities || {})),
		chests: JSON.parse(JSON.stringify(fixture.chests || {})),
		G,
		S: JSON.parse(JSON.stringify(fixture.S || {})),
		socket: recording_socket(log),
		next_skill: next_skill_dates(fixture.next_skill, FrozenDate),
		pings: (fixture.pings || [200]).slice(),
		party: JSON.parse(JSON.stringify(fixture.party_info || {})),
		party_list: (fixture.party_list || PARTY).slice(),
		server_region: fixture.server_region || "US",
		server_identifier: fixture.server_identifier || "I",
		gameplay: "normal",
		is_pvp: false,
		code_buttons: {},
		drawings: [],
		game_logs: [],
		add_log() { },
		push_deferred: () => new Promise(() => { }),
		resolve_deferred() { },
		reject_deferred() { },
		render_party() { },
		start_character_runner: () => Promise.resolve(),
		$: black_hole(),
		jQuery: black_hole(),
		PIXI: black_hole(),
		window: null,
		document: black_hole(),
		location: { reload() { log.reloads++; }, href: "https://adventure.land/" },
		addEventListener() { },
		removeEventListener() { },
		ctarget: null,
		mode: {},
	};
	parent.window = parent;
	parent.parent = parent;
	for (const fn of PARENT_CALLS) {
		if (parent[fn] === undefined) parent[fn] = (...args) => {
			log.parent_calls.push(fn);
			return new Promise(() => { });
		};
	}
	for (const id in parent.entities) {
		const e = parent.entities[id];
		if (e.x === undefined && e.real_x !== undefined) e.x = e.real_x;
		if (e.y === undefined && e.real_y !== undefined) e.y = e.real_y;
		if (e.real_x === undefined) e.real_x = e.x;
		if (e.real_y === undefined) e.real_y = e.y;
	}

	const timers = log.timers;
	let timer_id = 1;
	const capture = kind => (fn, ms) => {
		timers.push({ kind, ms, name: (fn && fn.name) || "anonymous" });
		return timer_id++;
	};

	const math = Object.create(Math);
	math.random = seeded_random(fixture.seed || 1);

	const ctx = {
		parent,
		console: { log() { }, info() { }, warn() { }, debug() { }, error(...a) { log.console_errors.push(a.map(error_text).join(" ").slice(0, 600)); } },
		setTimeout: capture("timeout"),
		setInterval: capture("interval"),
		clearTimeout() { },
		clearInterval() { },
		requestAnimationFrame: capture("raf"),
		is_server: false,
		queueMicrotask,
		Date: FrozenDate,
		Math: math,
		performance: { now: () => now + perf_offset },
		localStorage: new Storage(fixture.storage),
		sessionStorage: new Storage({}),
		fetch: () => new Promise(() => { }),
		navigator: { sendBeacon: () => true, userAgent: "harness" },
		document: black_hole(),
		$: black_hole(),
		jQuery: black_hole(),
		XMLHttpRequest: function () { return black_hole(); },
		Image: function () { return black_hole(); },
		location: { reload() { log.reloads++; }, href: "https://adventure.land/runner" },
		addEventListener() { },
		removeEventListener() { },
		__AL_BASE__: "https://cdn.jsdelivr.net/gh/Aegis-940/Adventure-Lands@" + (fixture.build_sha || "0".repeat(40)) + "/",
	};
	ctx.window = ctx;
	ctx.self = ctx;
	ctx.top = black_hole();
	vm.createContext(ctx);
	return ctx;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// BOOT — the game's scripts, then the bot in Bootstrapper order
// --------------------------------------------------------------------------------------------------------------------------------- //

let _game = null;

async function game_sources() {
	if (_game) return _game;
	const data = await source("data.js");
	const holder = vm.createContext({});
	vm.runInContext(data, holder);
	_game = {
		G: holder.G,
		common: await source("common_functions.js"),
		runner: await source("runner_functions.js"),
		lists: bootstrap_lists(await acorn()),
	};
	return _game;
}

function run_file(ctx, name, text, how, log) {
	try {
		if (how === "eval") vm.runInContext("(0, eval)(" + JSON.stringify(text) + ")", ctx, { filename: name });
		else vm.runInContext(text, ctx, { filename: name });
	} catch (e) {
		const where = (e.stack || "").split("\n").find(l => l.includes(".js:")) || "";
		log.errors.push({ file: name, message: String(e && e.message || e).slice(0, 300), where: where.trim().slice(0, 200) });
	}
}

async function boot(fixture, options) {
	const game = await game_sources();
	const log = { errors: [], emits: [], socket_on: [], timers: [], console_errors: [], parent_calls: [], reloads: 0 };
	const ctx = build_context(fixture, game.G, log);

	run_file(ctx, "common_functions.js", game.common, "script", log);
	ctx.parent.distance = ctx.distance;
	ctx.parent.is_disabled = ctx.is_disabled;
	run_file(ctx, "runner_functions.js", game.runner, "script", log);
	const game_errors = log.errors.length;

	const name = fixture.character.name;
	const role_files = game.lists.roles[name] || [];
	for (const file of [...game.lists.first, ...game.lists.parallel]) {
		run_file(ctx, file, read_repo_file(file), "script", log);
	}
	for (const file of role_files) {
		if (!options.entry && ENTRY_POINTS.has(path.basename(file))) continue;
		run_file(ctx, file, read_repo_file(file), "eval", log);
	}

	if (ctx.kernel_boot) {
		const base = f => path.basename(f, ".js");
		const order = [...game.lists.first, ...game.lists.parallel, ...role_files];
		const failed = new Set(log.errors.slice(game_errors).map(e => e.file));
		const loaded = order.filter(f => !failed.has(f) && (options.entry || !ENTRY_POINTS.has(path.basename(f))));
		const plan = { order: order.map(base), loaded: loaded.map(base), optional: game.lists.optional.map(base),
			entry: role_files.length ? base(role_files[role_files.length - 1]) : null };
		try {
			ctx.kernel_boot(plan);
		} catch (e) {
			log.errors.push({ file: "kernel_boot", message: String(e && e.message || e), where: "" });
		}
		const report = ctx.al_boot();
		for (const f of report.failed) log.errors.push({ file: "boot " + f.file, message: f.reason, where: "" });
	}

	await new Promise(r => setImmediate(r));
	return { ctx, log, game_errors };
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// FIXTURES
// --------------------------------------------------------------------------------------------------------------------------------- //

function minimal_fixture(name) {
	const ctype = CTYPE[name];
	const slots = {};
	for (const s of ["mainhand", "offhand", "helmet", "chest", "pants", "shoes", "gloves", "belt", "amulet",
		"ring1", "ring2", "earring1", "earring2", "orb", "cape", "elixir"]) slots[s] = null;
	return {
		id: "minimal-" + name,
		label: "synthetic minimal character for the load check",
		t: Date.UTC(2026, 9, 14, 12, 0, 0),
		perf: 1000000,
		character: {
			name, id: name, ctype, type: "character", level: 90, hp: 5000, max_hp: 5000, mp: 3000, max_mp: 3000,
			x: 256, y: -1417, real_x: 256, real_y: -1417, map: "spookytown", in: "spookytown", rip: false,
			s: {}, c: {}, q: {}, slots, items: new Array(42).fill(null), isize: 42, esize: 42, gold: 1000000,
			range: ctype === "ranger" ? 200 : 40, speed: 60, attack: 1000, frequency: 1, armor: 300, resistance: 300,
			cc: 0, party: "Ulric", stand: false, moving: false, going_x: 256, going_y: -1417, from_x: 256, from_y: -1417,
			mp_cost: 10, heal: ctype === "priest" ? 2000 : 0, owner: "harness",
		},
		entities: {},
		next_skill: {},
		pings: [200],
		storage: { ["AL_target_" + name]: "mummy" },
		home: "mummy",
	};
}

function fixture_files() {
	if (!fs.existsSync(FIXTURES)) return [];
	const out = [];
	for (const dir of [FIXTURES, path.join(FIXTURES, "synthetic")]) {
		if (!fs.existsSync(dir)) continue;
		for (const f of fs.readdirSync(dir)) if (f.endsWith(".json")) out.push(path.join(dir, f));
	}
	return out.sort();
}

function load_fixture(file) {
	return JSON.parse(fs.readFileSync(file, "utf8"));
}

function fixture_key(file) {
	return path.relative(FIXTURES, file).replace(/\\/g, "/").replace(/\.json$/, "");
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// DECISIONS — every decider the goldens pin, called after the fixture's runtime state is restored
// --------------------------------------------------------------------------------------------------------------------------------- //

const RESTORE = `(function (f) {
	if (f.panicking !== undefined) panicking = f.panicking;
	if (f.panic_external !== undefined) panic_external = f.panic_external;
	if (f.panic_since !== undefined) panic_since = f.panic_since;
})`;

const DECIDE = `(function () {
	const out = {};
	const attempt = (key, fn) => {
		try {
			const v = fn();
			out[key] = v === undefined ? null : v;
		} catch (e) {
			out[key] = "THREW: " + (e && e.message || e);
		}
	};
	const id_of = e => e ? (e.id || e.name || null) : null;

	if (typeof update_cache === "function") attempt("update_cache", () => { update_cache(); return "ok"; });

	if (EQUIPMENT_RULES) {
		for (const group in EQUIPMENT_RULES) attempt("gear." + group, () => EQUIPMENT_RULES[group].resolve());
	}
	if (cache && "target" in cache) attempt("target", () => id_of(cache.target));
	if (cache && cache.targets && cache.targets.in_range) {
		attempt("targets.in_range", () => cache.targets.in_range.map(id_of));
		if (typeof choose_attack_option === "function") attempt("shot", () => {
			const o = choose_attack_option(cache.targets.in_range);
			return o ? (o.name || o.skill || JSON.stringify(o).slice(0, 80)) : null;
		});
	}
	if (cache && "heal_target" in cache) attempt("heal_target", () => id_of(cache.heal_target));
	if (cache && "tank_entity" in cache) attempt("tank", () => id_of(cache.tank_entity));

	if (typeof movement_goal === "function" && character.ctype !== "merchant") attempt("goal", () => {
		const g = movement_goal();
		return g ? { label: g.label || null, local: g.local || null, hold: !!g.hold, passive: !!g.passive } : null;
	});
	attempt("pause_combat", () => should_pause_combat_loop());

	if (character.ctype === "warrior") {
		attempt("skill.cleave_ready", () => cleave_ready());
		attempt("skill.sugar_rush_wanted", () => sugar_rush_wanted());
		attempt("skill.stomp_weapon_ready", () => stomp_weapon_ready());
		attempt("skill.bscorpion_worth_buffing", () => bscorpion_worth_buffing());
	}
	if (character.ctype === "priest") {
		attempt("skill.zap_pull_home", () => zap_pull_home());
		attempt("skill.aggro_cap", () => effective_aggro_cap());
		attempt("skill.fight_gear_owned", () => fight_gear_owned());
	}
	if (character.ctype === "ranger") {
		attempt("skill.shot_width", () => shot_width());
		attempt("skill.mana_free", () => mana_free());
	}
	if (character.ctype === "merchant") {
		attempt("merchant.state", () => get_character_state());
	}
	attempt("panic.state", () => ({ panicking, panic_external }));
	return JSON.parse(JSON.stringify(out));
})`;

async function decide(fixture) {
	const { ctx, log } = await boot(fixture, { entry: false });
	vm.runInContext(RESTORE, ctx)(fixture);
	const decisions = vm.runInContext(DECIDE, ctx)();
	await new Promise(r => setImmediate(r));
	return {
		decisions,
		emits: log.emits.map(e => e.event),
		load_errors: log.errors,
	};
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// PROMOTION — a live snapshot becomes a committed fixture, with every stranger's name replaced by a stable hash
// --------------------------------------------------------------------------------------------------------------------------------- //

function anonymise(snapshot) {
	const party = new Set(PARTY);
	const hash = n => "p_" + crypto.createHash("sha256").update(String(n)).digest("hex").slice(0, 10);
	const rename = n => (typeof n === "string" && !party.has(n) && known.has(n) ? hash(n) : n);
	const known = new Set();
	for (const id in snapshot.entities || {}) {
		const e = snapshot.entities[id];
		if (e.type === "character" && !party.has(e.name || id)) known.add(e.name || id);
	}
	const walk = v => {
		if (Array.isArray(v)) return v.map(walk);
		if (v && typeof v === "object") {
			const out = {};
			for (const k in v) {
				if (k === "chat" || k === "trade" || k === "messages") continue;
				out[rename(k)] = walk(v[k]);
			}
			return out;
		}
		return rename(v);
	};
	return walk(snapshot);
}

function promote(which, label) {
	if (!fs.existsSync(SNAPSHOTS)) throw new Error("no snapshots.jsonl yet");
	const lines = fs.readFileSync(SNAPSHOTS, "utf8").split("\n").filter(Boolean);
	const snapshot = /^\d+$/.test(which) ? JSON.parse(lines[Number(which)]) : lines.map(l => JSON.parse(l)).find(s => s.id === which);
	if (!snapshot) throw new Error("no snapshot " + which);
	const fixture = anonymise(snapshot);
	fixture.label = label || fixture.label || "";
	delete fixture.at;
	fs.mkdirSync(FIXTURES, { recursive: true });
	const file = path.join(FIXTURES, String(fixture.id).replace(/[^\w.-]/g, "_") + ".json");
	fs.writeFileSync(file, JSON.stringify(fixture, null, 1) + "\n");
	return file;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// COMMANDS
// --------------------------------------------------------------------------------------------------------------------------------- //

function stable(value) {
	return JSON.stringify(value, Object.keys(value).sort(), 1);
}

async function command_load() {
	let failed = 0;
	for (const name of PARTY) {
		const { log, game_errors } = await boot(minimal_fixture(name), { entry: true });
		const bot_errors = log.errors.slice(game_errors);
		const intervals = log.timers.filter(t => t.kind === "interval").length;
		const timeouts = log.timers.filter(t => t.kind === "timeout").length;
		console.log(`${name.padEnd(6)} ${bot_errors.length || log.console_errors.length ? "FAIL" : "ok  "}  ${log.socket_on.length} socket handlers, `
			+ `${intervals} intervals, ${timeouts} timeouts, ${log.emits.length} emits at boot`
			+ (game_errors ? `  (${game_errors} errors in the game's own scripts)` : ""));
		for (const e of log.errors) console.log(`   ${e.file}: ${e.message}${e.where ? "  @ " + e.where : ""}`);
		for (const e of log.console_errors) console.log(`   console.error: ${e}`);
		if (bot_errors.length || log.console_errors.length) failed++;
	}
	return failed ? 1 : 0;
}

async function command_decide(file) {
	const result = await decide(load_fixture(file));
	console.log(JSON.stringify(result, null, 1));
	return 0;
}

async function command_golden(files) {
	fs.mkdirSync(GOLDENS, { recursive: true });
	const list = files.length ? files : fixture_files();
	for (const file of list) {
		const key = fixture_key(file);
		const result = await decide(load_fixture(file));
		const out = path.join(GOLDENS, key + ".json");
		fs.mkdirSync(path.dirname(out), { recursive: true });
		fs.writeFileSync(out, JSON.stringify({ decisions: result.decisions, emits: result.emits }, null, 1) + "\n");
		console.log("golden " + key);
	}
	return 0;
}

async function command_check() {
	let failed = 0;
	const list = fixture_files();
	for (const file of list) {
		const key = fixture_key(file);
		const fixture = load_fixture(file);
		const a = await decide(fixture);
		const b = await decide(fixture);
		const now = { decisions: a.decisions, emits: a.emits };
		if (JSON.stringify(now) !== JSON.stringify({ decisions: b.decisions, emits: b.emits })) {
			console.log(`NONDETERMINISTIC ${key}`);
			failed++;
			continue;
		}
		if (a.load_errors.length) {
			console.log(`LOAD ERRORS ${key}: ${a.load_errors.map(e => e.file + ": " + e.message).join("; ")}`);
		}
		const golden_file = path.join(GOLDENS, key + ".json");
		if (!fs.existsSync(golden_file)) {
			console.log(`NO GOLDEN ${key}`);
			failed++;
			continue;
		}
		const golden = JSON.parse(fs.readFileSync(golden_file, "utf8"));
		const diffs = [];
		const keys = new Set([...Object.keys(golden.decisions), ...Object.keys(now.decisions)]);
		for (const k of [...keys].sort()) {
			const g = JSON.stringify(golden.decisions[k]);
			const n = JSON.stringify(now.decisions[k]);
			if (g !== n) diffs.push(`   ${k}: ${g} -> ${n}`);
		}
		if (JSON.stringify(golden.emits) !== JSON.stringify(now.emits)) diffs.push(`   emits: ${JSON.stringify(golden.emits)} -> ${JSON.stringify(now.emits)}`);
		if (diffs.length) {
			console.log(`DIFFERS ${key}`);
			diffs.forEach(d => console.log(d));
			failed++;
		} else {
			console.log(`ok ${key}`);
		}
	}
	console.log(`${list.length} fixtures, ${failed} failing`);
	return failed ? 1 : 0;
}

async function main() {
	const [cmd, ...args] = process.argv.slice(2);
	if (cmd === "load") return command_load();
	if (cmd === "decide") return command_decide(args[0]);
	if (cmd === "golden") return command_golden(args);
	if (cmd === "check") return command_check();
	if (cmd === "promote") {
		console.log("promoted " + promote(args[0], args.slice(1).join(" ")));
		return 0;
	}
	console.log("usage: node Tests/Harness.js load | decide <fixture> | golden [fixture...] | check | promote <n|id> <label>");
	return 2;
}

module.exports = { boot, decide, minimal_fixture, anonymise };

if (require.main === module) {
	main().then(code => process.exit(code), e => {
		console.error(e.stack || e.message);
		process.exit(1);
	});
}

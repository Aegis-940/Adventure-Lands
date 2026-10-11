#!/usr/bin/env node
"use strict";

// --------------------------------------------------------------------------------------------------------------------------------- //
// PARTY MODEL — the server's stat pipeline for Ulric and Riva, run offline over the game's own data.js and item maths
// --------------------------------------------------------------------------------------------------------------------------------- //

(async function party_model() {
	const fs = require("fs");
	const path = require("path");
	const vm = require("vm");

	const REPO = path.dirname(__dirname);
	const CACHE = path.join(__dirname, ".cache");
	const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
	const SOURCES = {
		"data.js": "https://adventure.land/data.js",
		"common_functions.js": "https://raw.githubusercontent.com/kaansoral/adventureland/master/js/common_functions.js",
	};
	const FIGHTERS = { Ulric: "warrior", Riva: "ranger" };
	const LEVEL = 91;
	const SCORE_PER_KILL = 1.6;
	const SUNDER_ARMOR = 200;
	const SUNDER_MS = 5000;
	const SURVEY_OWNER = "Myras";
	const SLOTS = ["mainhand", "offhand", "helmet", "chest", "pants", "shoes", "gloves", "belt", "amulet",
		"ring1", "ring2", "earring1", "earring2", "orb", "cape"];
	const SLOT_TYPES = {
		ring1: ["ring"], ring2: ["ring"], earring1: ["earring"], earring2: ["earring"], belt: ["belt"], amulet: ["amulet"],
		orb: ["orb"], cape: ["cape"], helmet: ["helmet"], chest: ["chest"], pants: ["pants"], shoes: ["shoes"], gloves: ["gloves"],
	};
	const OFFHAND_TYPES = ["weapon", "shield", "source", "quiver", "misc_offhand"];
	const STAT_TO_ATTR = {
		str: "str", int: "int", dex: "dex", vit: "vit", for: "for", armor: "armor", resistance: "resistance",
		crit: "crit", critdamage: "critdamage", hp: "max_hp", mp: "max_mp", speed: "speed", lifesteal: "lifesteal",
		manasteal: "manasteal", apiercing: "apiercing", rpiercing: "rpiercing", output: "output", attack: "a_attack",
		explosion: "explosion", blast: "blast", evasion: "evasion", miss: "miss", reflection: "reflection",
		dreturn: "dreturn", luck: "xluck", gold: "xgold", xp: "xxp", courage: "courage",
	};
	const DAMAGE_STATS = ["str", "dex", "int", "attack", "apiercing", "crit", "critdamage", "frequency", "output"];

	// ----------------------------------------------------------------------------------------------------------------------------- //
	// GAME SOURCES — cached a day in Tools/.cache, re-fetched when older
	// ----------------------------------------------------------------------------------------------------------------------------- //

	async function source(name) {
		const file = path.join(CACHE, name);
		const fresh = fs.existsSync(file) && Date.now() - fs.statSync(file).mtimeMs < CACHE_MAX_AGE_MS;
		if (!fresh) {
			try {
				const res = await fetch(SOURCES[name]);
				if (!res.ok) throw new Error(res.status + " " + res.statusText);
				fs.mkdirSync(CACHE, { recursive: true });
				fs.writeFileSync(file, await res.text());
			} catch (e) {
				if (!fs.existsSync(file)) throw new Error("cannot fetch " + name + ": " + e.message);
			}
		}
		return fs.readFileSync(file, "utf8");
	}

	const game = vm.createContext({ console, min: Math.min, max: Math.max, floor: Math.floor, ceil: Math.ceil, abs: Math.abs });
	vm.runInContext(await source("data.js"), game);
	vm.runInContext(await source("common_functions.js"), game);
	const G = game.G;

	// ----------------------------------------------------------------------------------------------------------------------------- //
	// RECORDS
	// ----------------------------------------------------------------------------------------------------------------------------- //

	function read_jsonl(name) {
		const file = path.join(REPO, name);
		if (!fs.existsSync(file)) return [];
		return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map(line => {
			try { return JSON.parse(line); } catch (e) { return null; }
		}).filter(Boolean);
	}

	const profiles = read_jsonl("boss_profiles.jsonl");
	const trackers = read_jsonl("tracker.jsonl");
	const ledger = read_jsonl("ledger.jsonl");

	function latest_profile(name) {
		for (let i = profiles.length - 1; i >= 0; i--) {
			const p = profiles[i].players && profiles[i].players[name];
			if (p && p.gear) return { at: profiles[i].at, t: profiles[i].t, boss: profiles[i].boss, ...p };
		}
		return null;
	}

	function latest_tracker(name) {
		for (let i = trackers.length - 1; i >= 0; i--) {
			if (trackers[i].character === name) return trackers[i];
		}
		return null;
	}

	function milestone_score(mtype) {
		let best = 0;
		for (const name of Object.keys(FIGHTERS).concat([SURVEY_OWNER])) {
			const t = latest_tracker(name);
			if (!t) continue;
			const account = ((t.max || {}).monsters || {})[mtype];
			if (account) best = Math.max(best, account[0]);
			if (t.monsters_diff) best = Math.max(best, (t.monsters[mtype] || 0) + (t.monsters_diff[mtype] || 0));
		}
		return best;
	}

	// ----------------------------------------------------------------------------------------------------------------------------- //
	// STATS — calculate_player_stats() in node/server.js, the parts that move damage
	// ----------------------------------------------------------------------------------------------------------------------------- //

	function apply_stats(p, prop, scale) {
		const k = scale === undefined ? 1 : scale;
		for (const stat in prop) {
			const v = prop[stat];
			if (typeof v !== "number") continue;
			if (stat === "frequency") p.frequency += k * v / 100;
			else if (STAT_TO_ATTR[stat]) p[STAT_TO_ATTR[stat]] = (p[STAT_TO_ATTR[stat]] || 0) + k * v;
		}
	}

	function base_stats(cls) {
		const c = G.classes[cls];
		const p = { cls, level: LEVEL, a: {}, item_attack: 0, sets: {} };
		for (const prop of ["attack", "frequency", "armor", "resistance", "apiercing", "rpiercing", "crit", "critdamage", "output", "speed"]) {
			p[prop] = c[prop] || 0;
		}
		for (const prop of ["a_attack", "lifesteal", "manasteal", "explosion", "max_hp", "max_mp", "xluck", "xgold", "xxp"]) p[prop] = 0;
		for (const stat in c.stats) {
			let v = c.stats[stat] + LEVEL * c.lstats[stat];
			if (LEVEL > 40) v += (LEVEL - 40) * c.lstats[stat];
			if (LEVEL > 55) v += (LEVEL - 55) * c.lstats[stat];
			if (LEVEL > 65) v += (LEVEL - 65) * c.lstats[stat];
			if (LEVEL > 80) v -= (LEVEL - 80) * c.lstats[stat];
			p[stat] = Math.floor(v);
		}
		return p;
	}

	function achievement_stats(extra) {
		const out = {};
		for (const mtype in G.monsters) {
			const list = G.monsters[mtype].achievements;
			if (!list) continue;
			const score = milestone_score(mtype) + ((extra && extra[mtype]) || 0);
			for (const a of list) {
				if (score >= a[0] && a[1] === "stat") out[a[2]] = (out[a[2]] || 0) + a[3];
			}
		}
		return out;
	}

	function stats(cls, gear, opts) {
		const o = opts || {};
		const c = G.classes[cls];
		const p = base_stats(cls);
		for (const slot of SLOTS.concat(["elixir"])) {
			const it = gear[slot];
			if (!it || !G.items[it.name]) continue;
			const def = G.items[it.name];
			const prop = game.calculate_item_properties({ name: it.name, level: it.level || 0, stat_type: it.stat_type, p: it.p }, { class: cls });
			if (prop.class && !prop.class.includes(cls)) continue;
			apply_stats(p, prop);
			if (prop.attack) p.item_attack += slot === "offhand" ? prop.attack * 0.7 : prop.attack;
			if (def.ability) p.a[def.ability] = (p.a[def.ability] || 0) + (prop.attr0 || 0);
			if (slot === "mainhand") apply_stats(p, c.doublehand[def.wtype] || c.mainhand[def.wtype] || {});
			if (slot === "offhand") apply_stats(p, c.offhand[def.wtype] || c.offhand[def.type] || {});
			if (prop.set) p.sets[def.set] = (p.sets[def.set] || 0) + 1;
		}
		for (const set in p.sets) {
			const bonus = G.sets[set] && G.sets[set][p.sets[set]];
			if (bonus) apply_stats(p, bonus);
		}
		for (const name in o.buffs || {}) {
			if (G.conditions[name]) apply_stats(p, G.conditions[name], o.buffs[name]);
		}
		apply_stats(p, achievement_stats(o.extra_score));
		apply_stats(p, o.extra || {});

		p.item_attack = Math.max(p.item_attack, 5);
		p.attack += p.item_attack * (p[c.main_stat] / 20) + p.a_attack;
		p.frequency += Math.min(LEVEL, 80) / 164 + Math.min(160, p.dex) / 640 + Math.max(p.dex - 160, 0) / 925 + p.int / 1575;
		p.output = Math.max(5, p.output);
		p.attack = p.attack * p.output / 100;
		return p;
	}

	// ----------------------------------------------------------------------------------------------------------------------------- //
	// PARTY DAMAGE — attack × crit × attack speed × the armour curve, with the shared sunder uptime
	// ----------------------------------------------------------------------------------------------------------------------------- //

	function sunder_uptime(party) {
		let miss = 1;
		for (const p of party) {
			const chance = (p.a.sunder || 0) / 100;
			if (chance) miss *= Math.pow(1 - chance, p.frequency * SUNDER_MS / 1000);
		}
		return 1 - miss;
	}

	function party_dps(party, monster) {
		const armor = G.monsters[monster].armor || 0;
		const q = sunder_uptime(party);
		let total = 0;
		for (const p of party) {
			const crit = 1 + Math.min(100, p.crit) / 100 * (1 + (p.critdamage || 0) / 100);
			const curve = (1 - q) * game.damage_multiplier(armor - p.apiercing) + q * game.damage_multiplier(armor - SUNDER_ARMOR - p.apiercing);
			total += p.attack * crit * p.frequency * curve;
		}
		return total;
	}

	const players = {};
	for (const name in FIGHTERS) {
		const prof = latest_profile(name);
		if (!prof) throw new Error("no boss profile with gear for " + name);
		const gear = {};
		for (const slot in prof.gear) {
			const it = prof.gear[slot];
			if (!it || (it.expires && Date.parse(it.expires) < prof.t)) continue;
			gear[slot] = { name: it.name, level: it.level || 0, stat_type: it.stat_type, p: it.p };
		}
		players[name] = { name, cls: FIGHTERS[name], gear, prof, buffs: prof.buffs || {} };
	}

	function party_with(changes, extra_score) {
		return Object.values(players).map(pl => stats(pl.cls, Object.assign({}, pl.gear, (changes || {})[pl.name] || {}),
			{ buffs: pl.buffs, extra_score }));
	}

	function gain_pct(monster, changes, extra_score) {
		const before = party_dps(party_with(null), monster);
		const after = party_dps(party_with(changes, extra_score), monster);
		return (after / before - 1) * 100;
	}

	// ----------------------------------------------------------------------------------------------------------------------------- //
	// REPORTS
	// ----------------------------------------------------------------------------------------------------------------------------- //

	function calibrate() {
		return Object.values(players).map(pl => {
			const m = stats(pl.cls, pl.gear, { buffs: pl.buffs });
			return {
				character: pl.name, profile_at: pl.prof.at, boss: pl.prof.boss,
				attack: { model: Math.round(m.attack), measured: pl.prof.attack },
				frequency: { model: +m.frequency.toFixed(3), measured: pl.prof.frequency },
				crit: { model: +m.crit.toFixed(1), measured: pl.prof.crit_rate === undefined ? null : +(pl.prof.crit_rate * 100).toFixed(1) },
				apiercing: Math.round(m.apiercing),
			};
		});
	}

	function eligible(cls, slot, def) {
		const c = G.classes[cls];
		if (def.ignore || !def.name) return false;
		if (def.class && !def.class.includes(cls)) return false;
		if (slot === "mainhand") return def.type === "weapon" && !!(c.mainhand[def.wtype] || c.doublehand[def.wtype]);
		if (slot === "offhand") return OFFHAND_TYPES.includes(def.type) && !!(c.offhand[def.wtype] || c.offhand[def.type])
			&& !game.doublehand_types.includes(def.wtype);
		return (SLOT_TYPES[slot] || []).includes(def.type);
	}

	function max_level(def) {
		if (def.upgrade) return 12;
		if (def.compound) return 10;
		return 0;
	}

	function best_per_slot(monster, top) {
		const out = {};
		for (const pl of Object.values(players)) {
			out[pl.name] = {};
			const main = G.classes[pl.cls].main_stat;
			for (const slot of SLOTS) {
				const worn = pl.gear[slot];
				const level = worn ? worn.level || 0 : 0;
				const rows = [];
				for (const name in G.items) {
					const def = G.items[name];
					if (!eligible(pl.cls, slot, def)) continue;
					const lv = Math.min(level, max_level(def));
					const same = worn && worn.name === name;
					const change = { [slot]: same ? { ...worn, level: lv } : { name, level: lv, stat_type: def.stat ? main : undefined } };
					if (slot === "mainhand" && game.doublehand_types.includes(def.wtype)) change.offhand = null;
					rows.push({ item: name, level: lv, gain_pct: +gain_pct(monster, { [pl.name]: change }).toFixed(2) });
				}
				rows.sort((a, b) => b.gain_pct - a.gain_pct);
				out[pl.name][slot] = { worn: worn ? worn.name + "+" + (worn.level || 0) : null, best: rows.slice(0, top) };
			}
		}
		return out;
	}

	function item_grade(def, level) {
		return game.calculate_item_grade(def, { level });
	}

	function step_odds(def, level) {
		const grade = Math.min(item_grade(def, level), 2);
		const table = def.upgrade ? G.upgrades : G.compounds;
		return { p: table[grade][level + 1], scroll: (def.upgrade ? "scroll" : "cscroll") + item_grade(def, level) };
	}

	function build_value(def, level) {
		let v = def.g || 0;
		for (let l = 0; l < level; l++) {
			const s = step_odds(def, l);
			if (!s.p || !G.items[s.scroll]) return null;
			v = ((def.upgrade ? v : 3 * v) + G.items[s.scroll].g) / s.p;
		}
		return v;
	}

	function upgrades(monster) {
		const rows = [];
		for (const pl of Object.values(players)) {
			for (const slot of SLOTS) {
				const worn = pl.gear[slot];
				if (!worn) continue;
				const def = G.items[worn.name];
				const level = worn.level || 0;
				if (!def || level >= max_level(def)) continue;
				const s = step_odds(def, level);
				const now = build_value(def, level);
				const next = build_value(def, level + 1);
				if (!s.p || now === null || next === null) continue;
				const gain = gain_pct(monster, { [pl.name]: { [slot]: { ...worn, level: level + 1 } } });
				const cost = next - now;
				rows.push({
					character: pl.name, slot, item: worn.name, from: level, to: level + 1,
					gain_pct: +gain.toFixed(2), chance: s.p, scroll: s.scroll, expected_gold: Math.round(cost),
					pct_per_10m_gold: cost > 0 ? +(gain / cost * 1e7).toFixed(3) : null,
				});
			}
		}
		return rows.sort((a, b) => (b.pct_per_10m_gold || 0) - (a.pct_per_10m_gold || 0));
	}

	function score_rates() {
		const rate = {};
		const seen = {};
		for (const r of ledger) {
			if (r.character !== SURVEY_OWNER || !r.at_spot_s) continue;
			for (const mtype in (r.spot || {}).kills || {}) {
				seen[mtype] = seen[mtype] || { kills: 0, secs: 0 };
				seen[mtype].kills += r.spot.kills[mtype];
			}
			if (r.home) {
				seen[r.home] = seen[r.home] || { kills: 0, secs: 0 };
				seen[r.home].secs += r.at_spot_s;
			}
		}
		for (const mtype in seen) {
			if (seen[mtype].secs > 0 && seen[mtype].kills > 0) rate[mtype] = seen[mtype].kills / seen[mtype].secs * 3600 * SCORE_PER_KILL;
		}
		return rate;
	}

	function achievements(monster) {
		const rates = score_rates();
		const rows = [];
		for (const mtype in G.monsters) {
			const list = G.monsters[mtype].achievements;
			if (!list) continue;
			const score = milestone_score(mtype);
			const next = list.find(a => a[0] > score);
			if (!next) continue;
			const reward = next[1] === "stat" ? { [next[2]]: next[3] } : null;
			const needed = next[0] - score;
			const gain = reward && DAMAGE_STATS.includes(next[2])
				? gain_pct(monster, null, { [mtype]: needed }) : null;
			const per_hour = rates[mtype] || null;
			const hours = per_hour ? needed / per_hour : null;
			rows.push({
				monster: mtype, boss: !!(G.monsters[mtype].cooperative || G.monsters[mtype].global),
				score: Math.round(score), next_at: next[0], needed: Math.round(needed),
				reward: next[1] === "stat" ? `+${next[3]} ${next[2]}` : next[1],
				gain_pct: gain === null ? null : +gain.toFixed(3),
				score_per_hour: per_hour ? Math.round(per_hour) : null,
				hours: hours === null ? null : +hours.toFixed(1),
				pct_per_hour: gain !== null && hours ? +(gain / hours).toFixed(4) : null,
			});
		}
		const tier = a => a.pct_per_hour !== null ? 0 : a.gain_pct ? 1 : a.hours !== null ? 2 : 3;
		return rows.sort((a, b) => tier(a) - tier(b) || (b.pct_per_hour || 0) - (a.pct_per_hour || 0)
			|| (b.gain_pct || 0) - (a.gain_pct || 0) || (a.hours || 1e9) - (b.hours || 1e9) || a.needed - b.needed);
	}

	const ASSUMPTIONS = [
		"Damage = attack × crit × attack speed × the armour curve, per hit; burn, splash, cleave and multishot are left out, so AOE gear is undervalued.",
		"Buffs are applied at the uptimes measured in each fighter's latest boss profile.",
		"Sunder (Can Opener) is assumed to proc like burn: attr0 % per hit on the target, 200 armour for 5s.",
		"Upgrade cost is the expected gold to rebuild the item one level higher at base odds with the item's own grade of scroll; primlings, grace and the lucky slot are left out.",
		"Milestones are reached at the account's best monster score; score per kill is 1.6 (three fighters partied, Riff away).",
		"Kill rates come from Myras's ledger at that farm target, so only farmed or surveyed monsters have one.",
	];

	// ----------------------------------------------------------------------------------------------------------------------------- //
	// OUTPUT
	// ----------------------------------------------------------------------------------------------------------------------------- //

	function pad(v, n) { return String(v).padEnd(n); }
	function lpad(v, n) { return String(v).padStart(n); }
	function gold(v) { return v === null ? "-" : v >= 1e6 ? (v / 1e6).toFixed(1) + "M" : v >= 1e3 ? Math.round(v / 1e3) + "k" : String(v); }

	const command = process.argv[2] || "calibrate";
	const monster = process.argv[3] || "bscorpion";
	if (!G.monsters[monster]) throw new Error("unknown monster " + monster);

	if (command === "calibrate") {
		for (const c of calibrate()) {
			console.log(`${pad(c.character, 6)} profile ${c.profile_at} (${c.boss})  attack ${c.attack.model} vs ${c.attack.measured}  `
				+ `speed ${c.frequency.model} vs ${c.frequency.measured}  crit ${c.crit.model}% vs ${c.crit.measured}%  pierce ${c.apiercing}`);
		}
	} else if (command === "slots") {
		const out = best_per_slot(monster, 5);
		for (const name in out) {
			console.log(`\n${name} vs ${monster}`);
			for (const slot in out[name]) {
				const s = out[name][slot];
				console.log(`  ${pad(slot, 9)} worn ${pad(s.worn || "-", 22)} ` + s.best.map(b => `${b.item}+${b.level} ${b.gain_pct >= 0 ? "+" : ""}${b.gain_pct}%`).join("  "));
			}
		}
	} else if (command === "upgrades") {
		console.log(`${pad("who", 6)} ${pad("slot", 9)} ${pad("item", 15)} step   ${lpad("gain", 7)} ${lpad("odds", 6)} ${lpad("gold", 8)} ${lpad("%/10M", 7)}`);
		for (const u of upgrades(monster).slice(0, 25)) {
			console.log(`${pad(u.character, 6)} ${pad(u.slot, 9)} ${pad(u.item, 15)} ${lpad(u.from, 2)}→${pad(u.to, 2)} ${lpad(u.gain_pct.toFixed(2) + "%", 7)} `
				+ `${lpad(Math.round(u.chance * 100) + "%", 6)} ${lpad(gold(u.expected_gold), 8)} ${lpad(u.pct_per_10m_gold === null ? "-" : u.pct_per_10m_gold.toFixed(2), 7)}`);
		}
	} else if (command === "achievements") {
		console.log(`${pad("monster", 13)} ${lpad("score", 10)} ${lpad("next", 10)} ${pad("reward", 18)} ${lpad("gain", 7)} ${lpad("score/h", 8)} ${lpad("hours", 8)}`);
		for (const a of achievements(monster)) {
			console.log(`${pad(a.monster + (a.boss ? "*" : ""), 13)} ${lpad(a.score, 10)} ${lpad(a.next_at, 10)} ${pad(a.reward, 18)} ${lpad(a.gain_pct === null ? "-" : a.gain_pct.toFixed(2) + "%", 7)} `
				+ `${lpad(a.score_per_hour || "-", 8)} ${lpad(a.hours === null ? "-" : a.hours, 8)}`);
		}
	} else if (command === "json") {
		const out = {
			generated: new Date().toISOString(), monster, game_version: G.version,
			calibration: calibrate(), upgrades: upgrades(monster), slots: best_per_slot(monster, 5),
			achievements: achievements(monster), assumptions: ASSUMPTIONS,
		};
		fs.writeFileSync(path.join(REPO, "party_model.json"), JSON.stringify(out));
		console.log("party_model.json written");
	} else {
		console.log([
			'node "Tools/Party Model.js" calibrate                modelled vs measured attack, attack speed and crit',
			'node "Tools/Party Model.js" slots [monster]          best item per slot, by party damage against the monster',
			'node "Tools/Party Model.js" upgrades [monster]       +1 on each worn item, by party damage per gold',
			'node "Tools/Party Model.js" achievements [monster]   kill-score milestones, by party damage per hour of farming',
			'node "Tools/Party Model.js" json [monster]           all of the above to party_model.json, for the status page',
			"",
			"The monster defaults to bscorpion. Gear and measured stats come from each fighter's latest boss_profiles.jsonl",
			"entry, milestone progress from tracker.jsonl, kill rates from ledger.jsonl.",
		].join("\n"));
		process.exitCode = 2;
	}
	if (command === "achievements") console.log("\n* = boss or event monster");
	if (["calibrate", "slots", "upgrades", "achievements"].includes(command)) console.log("\n" + ASSUMPTIONS.map(a => "* " + a).join("\n"));
})().catch(e => {
	console.error(e.message || e);
	process.exitCode = 1;
});

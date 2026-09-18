// --------------------------------------------------------------------------------------------------------------------------------- //
// COMBAT SAMPLING — what burn, splash and healing are actually worth, measured from live hit events
// --------------------------------------------------------------------------------------------------------------------------------- //


const DAMAGE_WINDOW_MS = 15000;
const DAMAGE_PREDICTION_STEP_MS = 250;
const BUFFS_WORTH_LOGGING = ["warcry", "darkblessing", "mluck", "mcourage", "power", "xpower", "holidayspirit", "newcomersblessing", "energized", "anniversary_kiss", "patronsgrace"];

const _damage_windows = {};

function weapon_label() {
	const mainhand = character.slots?.mainhand?.name || "none";
	const offhand = character.slots?.offhand?.name || "none";
	return `${mainhand}/${offhand}`;
}

function firing_stats() {
	return {
		explosion: character.explosion || 0,
		crit: character.crit || 0,
		critdamage: character.critdamage || 0,
		apiercing: character.apiercing || 0,
		attack: Math.round(character.attack || 0)
	};
}

function damage_window_for(weapon, stats) {
	let w = _damage_windows[weapon];
	if (!w) {
		const s = stats || firing_stats();
		w = _damage_windows[weapon] = {
			at: Date.now(),
			weapon,
			explosion: s.explosion,
			crit: s.crit,
			critdamage: s.critdamage,
			apiercing: s.apiercing,
			attack: s.attack,
			buffs: Object.keys(character.s || {}).filter(s => BUFFS_WORTH_LOGGING.includes(s)).join("+"),
			direct: 0, splash: 0, burn: 0,
			hits: 0, splashes: 0, ticks: 0,
			splash_armor: 0, direct_armor: 0,
			tagged: 0, untagged: 0,
			pred_splash: 0, pred_burn: 0, pred_ticks: 0,
			off_home: 0, boss_seen: 0, context_ticks: 0
		};
	}
	return w;
}

function sample_hits_enabled() {
	return typeof CONFIG !== "undefined" && CONFIG.combat && CONFIG.combat.sample_hits;
}

function flush_damage_windows() {
	if (!sample_hits_enabled()) return;
	for (const weapon in _damage_windows) {
		const w = _damage_windows[weapon];
		if (Date.now() - w.at < DAMAGE_WINDOW_MS) continue;
		delete _damage_windows[weapon];
		emit_damage_window(w);
	}
}

function tick_damage_windows() {
	if (!sample_hits_enabled()) return;

	const worn = weapon_label();
	const at_home = typeof destination !== "undefined" && destination && character.map === destination.map;
	const boss = typeof find_active_boss === "function" && !!find_active_boss();
	const prediction = typeof model_prediction === "function" ? model_prediction() : null;

	for (const weapon in _damage_windows) {
		const w = _damage_windows[weapon];

		w.context_ticks++;
		if (!at_home) w.off_home++;
		if (boss) w.boss_seen++;

		if (!prediction || weapon !== worn) continue;
		w.pred_splash += prediction.splash;
		w.pred_burn += prediction.burn;
		w.pred_ticks++;
	}
}

function emit_damage_window(w) {
	if (w.direct > 0 && typeof errlog_sample === "function") {
		errlog_sample("damage", {
			weapon: w.weapon,
			explosion: w.explosion, crit: w.crit, critdamage: w.critdamage,
			apiercing: w.apiercing, attack: w.attack, buffs: w.buffs,
			secs: +((Date.now() - w.at) / 1000).toFixed(1),
			direct: Math.round(w.direct),
			splash: Math.round(w.splash),
			burn: Math.round(w.burn),
			burn_mult: +(1 + w.burn / w.direct).toFixed(3),
			splash_mult: +(1 + w.splash / w.direct).toFixed(3),
			hits: w.hits, splashes: w.splashes, ticks: w.ticks,
			tagged: w.tagged, untagged: w.untagged,
			splash_armor: w.splashes ? Math.round(w.splash_armor / w.splashes) : 0,
			direct_armor: w.hits ? Math.round(w.direct_armor / w.hits) : 0,
			per_splash: w.splashes ? +(w.splash / w.splashes / (w.direct / w.hits)).toFixed(3) : 0,

			pred_ticks: w.pred_ticks,
			predicted_splash_mult: w.pred_ticks ? +(1 + w.pred_splash / w.pred_ticks).toFixed(3) : null,
			predicted_burn_mult: w.pred_ticks ? +(w.pred_burn / w.pred_ticks).toFixed(3) : null,
			splash_accuracy: w.pred_ticks && w.pred_splash > 0
				? +((1 + w.splash / w.direct) / (1 + w.pred_splash / w.pred_ticks)).toFixed(3) : null,
			burn_accuracy: w.pred_ticks && w.pred_burn / w.pred_ticks > 1.001
				? +((1 + w.burn / w.direct) / (w.pred_burn / w.pred_ticks)).toFixed(3) : null,

			off_home_pct: w.context_ticks ? +(w.off_home / w.context_ticks).toFixed(2) : 0,
			boss_pct: w.context_ticks ? +(w.boss_seen / w.context_ticks).toFixed(2) : 0,
			map: character.map
		});
	}
}

function _is_my_hit(data) {
	return data && (data.hid === character.id || data.hid === character.name);
}

const _pid_weapon = {};

if (parent.socket._action_sampler) {
	parent.socket.off("action", parent.socket._action_sampler);
}

parent.socket._action_sampler = data => {
	try {
		if (!sample_hits_enabled() || !data || !data.pid) return;
		if (data.attacker !== character.id && data.attacker !== character.name) return;
		if (data.heal) {
			record_pid_heal(data);
			return;
		}
		_pid_weapon[data.pid] = Object.assign({ weapon: weapon_label(), at: Date.now() }, firing_stats());
	} catch (e) { }
};

parent.socket.on("action", parent.socket._action_sampler);

const _pid_heal = {};

function heal_target_entity(id) {
	if (id === character.id || id === character.name) return character;
	return parent.entities[id] || null;
}

function record_pid_heal(data) {
	const target = heal_target_entity(data.target);
	const source = data.source === "partyheal" || data.source === "selfheal" ? "party" : "single";
	const base = source === "party" ? partyheal_base() : (character.heal || 0);
	_pid_heal[data.pid] = {
		at: Date.now(),
		source,
		deficit: target ? Math.max(0, (target.max_hp || 0) - (target.hp || 0)) : 0,
		predicted: target ? heal_delivered(target, base) : 0
	};
}

function prune_pid_weapons() {
	const cutoff = Date.now() - 10000;
	for (const pid in _pid_weapon) {
		if (_pid_weapon[pid].at < cutoff) delete _pid_weapon[pid];
	}
	for (const pid in _pid_heal) {
		if (_pid_heal[pid].at < cutoff) delete _pid_heal[pid];
	}
}

setInterval(prune_pid_weapons, 10000);

let _heal_window = null;

function heal_window() {
	if (!_heal_window) {
		_heal_window = {
			at: Date.now(),
			single_casts: 0, single_delivered: 0, single_predicted: 0, single_overheal: 0,
			party_hits: 0, party_delivered: 0, party_predicted: 0, party_overheal: 0,
			untagged: 0, poisoned_ticks: 0, ticks: 0, mp_low_ticks: 0
		};
	}
	return _heal_window;
}

function tick_heal_window() {
	if (!sample_hits_enabled() || !character.heal) return;
	const w = heal_window();
	w.ticks++;
	if (character.s && character.s.poisoned) w.poisoned_ticks++;
	if (character.max_mp && character.mp / character.max_mp < 0.25) w.mp_low_ticks++;
}

function flush_heal_window() {
	if (!_heal_window) return;
	const w = _heal_window;
	if (Date.now() - w.at < DAMAGE_WINDOW_MS) return;
	_heal_window = null;

	if (!w.single_casts && !w.party_hits) return;
	if (typeof errlog_sample !== "function") return;

	errlog_sample("heal", {
		secs: +((Date.now() - w.at) / 1000).toFixed(1),
		heal: Math.round(character.heal || 0),
		mp_cost: Math.round(character.mp_cost || 0),
		rpiercing: character.rpiercing || 0,
		single_casts: w.single_casts,
		single_delivered: Math.round(w.single_delivered),
		single_predicted: Math.round(w.single_predicted),
		single_overheal: Math.round(w.single_overheal),
		single_accuracy: w.single_predicted ? +(w.single_delivered / w.single_predicted).toFixed(3) : 0,
		party_hits: w.party_hits,
		party_delivered: Math.round(w.party_delivered),
		party_predicted: Math.round(w.party_predicted),
		party_overheal: Math.round(w.party_overheal),
		party_accuracy: w.party_predicted ? +(w.party_delivered / w.party_predicted).toFixed(3) : 0,
		poisoned_pct: w.ticks ? +(w.poisoned_ticks / w.ticks).toFixed(2) : 0,
		mp_low_pct: w.ticks ? +(w.mp_low_ticks / w.ticks).toFixed(2) : 0,
		untagged: w.untagged
	});
}

if (parent.socket._damage_sampler) {
	parent.socket.off("hit", parent.socket._damage_sampler);
}

parent.socket._damage_sampler = data => {
	try {
		if (!sample_hits_enabled() || !_is_my_hit(data)) return;

		if (data.heal) {
			const w = heal_window();
			const cast = data.pid && _pid_heal[data.pid];
			const kind = cast ? cast.source : "single";
			if (!cast) w.untagged++;
			if (kind === "party") w.party_hits++; else w.single_casts++;
			w[kind + "_delivered"] += data.heal;
			w[kind + "_predicted"] += cast ? cast.predicted : 0;
			w[kind + "_overheal"] += cast ? Math.max(0, data.heal - cast.deficit) : 0;
			return;
		}

		if (!data.damage) return;

		const fired = data.pid && _pid_weapon[data.pid];
		const w = damage_window_for(fired ? fired.weapon : weapon_label(), fired);
		const hit = parent.entities[data.id];
		const armor = hit ? (hit.armor || 0) : 0;
		if (fired) w.tagged++; else w.untagged++;

		if (data.source === "burn") { w.burn += data.damage; w.ticks++; }
		else if (data.splash) { w.splash += data.damage; w.splashes++; w.splash_armor += armor; }
		else { w.direct += data.damage; w.hits++; w.direct_armor += armor; }
	} catch (e) { }
};

parent.socket.on("hit", parent.socket._damage_sampler);

setInterval(() => { try { tick_damage_windows(); } catch (e) { } }, DAMAGE_PREDICTION_STEP_MS);
setInterval(flush_damage_windows, 1000);
setInterval(() => { try { tick_heal_window(); flush_heal_window(); } catch (e) { } }, 1000);

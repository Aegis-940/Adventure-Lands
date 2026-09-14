// --------------------------------------------------------------------------------------------------------------------------------- //
// HEALER SKILLS — curse, absorb, party heal, dark blessing; started by Healer.js
// --------------------------------------------------------------------------------------------------------------------------------- //

async function skill_loop() {
	loop_tick("skill_loop");
	// if (panicking) return setTimeout(skill_loop, 100);
	if (dungeon_bailing()) return setTimeout(skill_loop, loop_next("skill_loop", 100));
	let next_delay = TICK_RATE.skill;

	try {
		if (is_disabled(character)) {
			return setTimeout(skill_loop, loop_next("skill_loop", 250));
		}

		update_cache();

		const penalty = character.s?.penalty_cd?.ms || 0;

		try {
			await handle_party_heal();
		} catch (e) {
			catcher(e, "handle_party_heal");
		}

		const mp_pct = character.max_mp ? character.mp / character.max_mp : 1;
		const mana_for_luxuries = mp_pct >= (CONFIG.healing.skill_min_mp_pct ?? 0.40);

		const travelling = is_travelling();

		if (!travelling && CONFIG.combat.enabled
			&& character.mp >= (G.skills.curse?.mp || 0) + panic_mp_reserve()) {
			try {
				await handle_curse();
			} catch (e) {
				catcher(e, "handle_curse");
			}
		}

		if (!panicking && !travelling && CONFIG.healing.absorb_enabled && penalty < 500) {
			try {
				await handle_absorb();
			} catch (e) {
				catcher(e, "handle_absorb");
			}
		}

		if (!panicking && !travelling && mana_for_luxuries && CONFIG.healing.dark_blessing_enabled && !is_on_cooldown("darkblessing")
			&& character.mp >= (G.skills.darkblessing?.mp || 0)) {
			if (home !== "bscorpion" || bscorpion_worth_buffing()) {
				try {
					await use_skill("darkblessing");
				} catch (e) {
					catcher(e, "darkblessing");
				}
			}
		}

		// if (CONFIG.combat.zapper_enabled) {
		// 	await handle_zapper();
		// }

	} catch (e) {
		catcher(e, "skill_loop");
		next_delay = TICK_RATE.retry;
	}

	setTimeout(skill_loop, loop_next("skill_loop", next_delay));
}

async function handle_curse() {
	if (is_on_cooldown("curse") || is_travelling()) return;

	const has_target = e =>
		e?.type === "monster" && !e.dead && e.visible && e.target && !e.immune &&
		e.hp >= e.max_hp * (CONFIG.combat.curse_min_hp_pct ?? 0.25);

	let target = null;

	const bosses_with_target = Object.values(parent.entities)
		.filter(e => has_target(e) && CONFIG.combat.all_bosses.includes(e.mtype))
		.sort((a, b) => distance(character, a) - distance(character, b));
	if (bosses_with_target.length) target = bosses_with_target[0];

	if (!target && dungeon_flag("absorb_nearby")) {
		const nearby = Object.values(parent.entities)
			.filter(e => has_target(e) && Math.hypot(character.x - e.x, character.y - e.y) <= 50)
			.sort((a, b) => b.hp - a.hp);
		if (nearby.length) target = nearby[0];
	}

	if (!target && !dungeon_flag("absorb_nearby")) {
		const home_mobs = Object.values(parent.entities)
			.filter(e => has_target(e) && e.mtype === home && is_in_range(e, "curse"))
			.sort((a, b) => b.hp - a.hp);
		if (home_mobs.length) target = home_mobs[0];
	}

	if (target && is_in_range(target, "curse")) {
		await use_skill("curse", target);
	}
}

async function handle_absorb() {
	if (is_on_cooldown("absorb")) return;

	const maps_to_exclude = ["level2w"];
	if (maps_to_exclude.includes(character.map)) return;

	if (!character.party) return;

	const party_names = Object.keys(get_party());
	const allies = party_names.filter(n => n !== character.name);
	if (!allies.length) return;

	for (let id in parent.entities) {
		const entity = parent.entities[id];
		if (!entity || entity.type !== "monster" || entity.dead) continue;

		if (entity.target && allies.includes(entity.target) && entity.target !== character.name) {
			const ally = get_player(entity.target);
			if (!ally || ally.rip || !is_in_range(ally, "absorb")) continue;

			await use_skill("absorb", entity.target);
			return;
		}
	}
}


var PARTY_HEAL_COOLDOWN = 250;
var last_party_heal_time = 0;

function heal_candidates() {
	const members = [];
	for (const name of cache.party_members || []) {
		const ally = name === character.name ? character : get_player(name);
		if (ally && !ally.rip) members.push(ally);
	}
	return members;
}

function party_heal_useful_total() {
	const base = partyheal_base();
	let total = 0;
	for (const ally of heal_candidates()) total += heal_useful(ally, base);
	return total;
}

function party_heal_critical_count() {
	const pct = CONFIG.healing.party_heal_critical_pct;
	let critical = 0;
	for (const ally of heal_candidates()) {
		if (ally.max_hp && ally.hp / ally.max_hp <= pct) critical++;
	}
	return critical;
}

var _last_heal_choice = 0;

function sample_heal_choice(fired, party_value, single_value, critical) {
	if (!CONFIG.combat.sample_hits || typeof errlog_sample !== "function") return;
	if (Date.now() - _last_heal_choice < 1000) return;
	_last_heal_choice = Date.now();
	errlog_sample("heal_choice", {
		fired,
		critical,
		party_value: Math.round(party_value),
		single_value: Math.round(single_value),
		party_cost: (G.skills.partyheal && G.skills.partyheal.mp) || 400,
		single_cost: Math.round(character.mp_cost || 0),
		mp_pct: +(character.mp / character.max_mp).toFixed(2),
		target: cache.heal_target ? cache.heal_target.name : null
	});
}

function party_heal_emergency() {
	if (character.max_hp && character.hp < character.max_hp * CONFIG.healing.party_heal_self_pct) return "self";
	if (party_heal_critical_count() >= CONFIG.healing.party_heal_critical_count) return "party";
	return null;
}

function party_heal_outvalues_single(lowest) {
	const party_value = party_heal_useful_total();
	const single_value = lowest ? heal_useful(lowest, character.heal) : 0;
	const critical = party_heal_critical_count();

	if (party_value <= 0) {
		sample_heal_choice(false, party_value, single_value, critical);
		return false;
	}

	const party_cost = (G.skills.partyheal && G.skills.partyheal.mp) || 400;
	const single_cost = Math.max(character.mp_cost || 1, 1);
	const wins = party_value / party_cost > (single_value / single_cost) * CONFIG.healing.party_heal_margin;

	sample_heal_choice(wins, party_value, single_value, critical);
	return wins;
}

async function handle_party_heal() {
	const now = performance.now();
	if (now - last_party_heal_time < PARTY_HEAL_COOLDOWN) return;
	if (character.mp <= CONFIG.healing.party_heal_min_mp) return;
	if (is_on_cooldown("partyheal")) return;

	const emergency = party_heal_emergency();

	if (!emergency) {
		let threshold = CONFIG.healing.party_heal_threshold;
		if (character.map !== destination.map) {
			threshold = 0.75;
		}

		const lowest = cache.heal_target;
		if (!lowest || !lowest.max_hp || lowest.hp >= lowest.max_hp * threshold) return;
		if (!party_heal_outvalues_single(lowest)) return;
	} else {
		const lowest = cache.heal_target;
		sample_heal_choice(
			emergency,
			party_heal_useful_total(),
			lowest ? heal_useful(lowest, character.heal) : 0,
			party_heal_critical_count()
		);
	}

	await use_skill("partyheal");
	last_party_heal_time = now;
}


async function handle_zapper() {
	const targets = find_zap_targets();
	const now = performance.now();
	const has_zapper = character.slots.ring2?.name === "zapper";
	const can_swap = now - state.last_equip_time > COOLDOWNS.zapper_swap;
	const has_enough_mp = character.mp > (G?.skills?.zapperzap?.mp || 0) + 1250;

	if (is_travelling() || character.cc > COOLDOWNS.cc) return;

	if (targets.length > 0 && !has_zapper && can_swap && has_enough_mp && character.map === destination.map) {
		try {
			await equip_once("zap-on", EQUIP_PRIORITY.skill, "zap_on");
			state.last_equip_time = now;
		} catch (e) {
			catcher(e, "equip zapper");
		}
		return;
	}

	if (targets.length > 0 && has_zapper && has_enough_mp && !is_on_cooldown("zapperzap")) {
		for (const entity of targets) {
			if (is_on_cooldown("zapperzap")) break;

			try {
				await use_skill("zapperzap", entity);
			} catch (e) {
				catcher(e, "handle_zapper");
			}
		}
	}

	if (targets.length === 0 && has_zapper && can_swap && character.map === destination.map) {
		try {
			await equip_once("zap-off", EQUIP_PRIORITY.skill, "zap_off");
			state.last_equip_time = now;
		} catch (e) {
			catcher(e, "unequip zapper");
		}
	}
}

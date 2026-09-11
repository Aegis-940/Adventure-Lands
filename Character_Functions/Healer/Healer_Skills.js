// --------------------------------------------------------------------------------------------------------------------------------- //
// HEALER SKILLS — curse, absorb, party heal, dark blessing; started by Healer.js
// --------------------------------------------------------------------------------------------------------------------------------- //

async function skill_loop() {
	if (typeof errlog_beat === "function") errlog_beat("skill_loop");
	// if (panicking) return setTimeout(skill_loop, 100);
	const delay = 40;

	try {
		if (is_disabled(character)) {
			return setTimeout(skill_loop, 250);
		}

		update_cache();

		const PENALTY = character.s?.penalty_cd?.ms || 0;

		try {
			await handle_party_heal();
		} catch (e) {
			console.error("handle_party_heal error:", e);
		}

		const MP_PCT = character.max_mp ? character.mp / character.max_mp : 1;
		const MANA_FOR_LUXURIES = MP_PCT >= (CONFIG.healing.skill_min_mp_pct ?? 0.40);

		const TRAVELLING = is_travelling();

		if (!panicking && !TRAVELLING && MANA_FOR_LUXURIES && CONFIG.combat.enabled) {
			try {
				await handle_curse();
			} catch (e) {
				console.error("handle_curse error:", e);
			}
		}

		if (!panicking && !TRAVELLING && CONFIG.healing.absorb_enabled && PENALTY < 500) {
			try {
				await handle_absorb();
			} catch (e) {
				console.error("handle_absorb error:", e);
			}
		}

		if (!panicking && !TRAVELLING && MANA_FOR_LUXURIES && CONFIG.healing.dark_blessing_enabled && !is_on_cooldown("darkblessing")
			&& character.mp >= (G.skills.darkblessing?.mp || 0)) {
			if (HEALER_TARGET !== "bscorpion" || bscorpion_worth_buffing()) {
				try {
					await use_skill("darkblessing");
				} catch (e) {
					console.error("darkblessing error:", e);
				}
			}
		}

		// if (CONFIG.combat.zapper_enabled) {
		// 	await handle_zapper();
		// }

	} catch (e) {
		console.error("skill_loop error:", e);
	}

	setTimeout(skill_loop, delay);
}

async function handle_curse() {
	if (is_on_cooldown("curse") || is_travelling()) return;

	const X = locations[home][0].x;
	const Y = locations[home][0].y;

	const has_target = e =>
		e?.type === "monster" && !e.dead && e.visible && e.target && !e.immune &&
		e.hp >= e.max_hp * (CONFIG.combat.curse_min_hp_pct ?? 0.25);

	let target = null;

	const bosses_with_target = Object.values(parent.entities)
		.filter(e => has_target(e) && CONFIG.combat.all_bosses.includes(e.mtype))
		.sort((a, b) => distance(character, a) - distance(character, b));
	if (bosses_with_target.length) target = bosses_with_target[0];

	if (!target && HEALER_TARGET === "giantspider") {
		const nearby = Object.values(parent.entities)
			.filter(e => has_target(e) && Math.hypot(character.x - e.x, character.y - e.y) <= 50)
			.sort((a, b) => b.hp - a.hp);
		if (nearby.length) target = nearby[0];
	}

	if (!target && HEALER_TARGET !== "giantspider") {
		const home_mobs = Object.values(parent.entities)
			.filter(e =>
				has_target(e) &&
				e.mtype === home &&
				Math.hypot(X - e.x, Y - e.y) <= 175
			)
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

	// const boss = get_nearest_monster_v2({ type: CONFIG.combat.all_bosses });
	// if (boss?.target && boss.target !== character.name) {
	// 	const TARGET_PLAYER = get_player(boss.target);
	// 	if (TARGET_PLAYER) {
	// 		await use_skill("absorb", boss.target);
	// 		log(`Boss Absorb → ${boss.mtype} from ${boss.target}`, "#FF3333");
	// 		return;
	// 	}
	// }

	if (!character.party) return;

	const PARTY_NAMES = Object.keys(get_party());
	const ALLIES = PARTY_NAMES.filter(n => n !== character.name);
	if (!ALLIES.length) return;

	for (let id in parent.entities) {
		const entity = parent.entities[id];
		if (!entity || entity.type !== "monster" || entity.dead) continue;

		if (entity.target && ALLIES.includes(entity.target) && entity.target !== character.name) {
			const ally = get_player(entity.target);
			if (!ally || ally.rip || !is_in_range(ally, "absorb")) continue;

			await use_skill("absorb", entity.target);
			return;
		}
	}
}


const PARTY_HEAL_COOLDOWN = 250;
let last_party_heal_time = 0;

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

function party_heal_outvalues_single(lowest) {
	const party_value = party_heal_useful_total();
	const single_value = lowest ? heal_useful(lowest, character.heal) : 0;
	const critical = party_heal_critical_count();

	if (party_value <= 0) {
		sample_heal_choice(false, party_value, single_value, critical);
		return false;
	}

	if (critical >= CONFIG.healing.party_heal_critical_count) {
		sample_heal_choice(true, party_value, single_value, critical);
		return true;
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

	let threshold = CONFIG.healing.party_heal_threshold;
	if (character.map !== destination.map) {
		threshold = 0.75;
	}

	const lowest = cache.heal_target;
	if (!lowest || !lowest.max_hp || lowest.hp >= lowest.max_hp * threshold) return;

	if (!party_heal_outvalues_single(lowest)) return;

	await use_skill("partyheal");
	last_party_heal_time = now;
}


async function handle_zapper() {
	const TARGETS = find_zap_targets();
	const NOW = performance.now();
	const HAS_ZAPPER = character.slots.ring2?.name === "zapper";
	const CAN_SWAP = NOW - state.last_equip_time > COOLDOWNS.zapper_swap;
	const HAS_ENOUGH_MP = character.mp > (G?.skills?.zapperzap?.mp || 0) + 1250;

	if (is_travelling() || character.cc > COOLDOWNS.cc) return;

	if (TARGETS.length > 0 && !HAS_ZAPPER && CAN_SWAP && HAS_ENOUGH_MP && character.map === destination.map) {
		try {
			await equip_once("zap-on", EQUIP_PRIORITY.skill, "zap_on");
			state.last_equip_time = NOW;
		} catch (e) {
			console.error("Failed to equip zapper:", e);
		}
		return;
	}

	if (TARGETS.length > 0 && HAS_ZAPPER && HAS_ENOUGH_MP && !is_on_cooldown("zapperzap")) {
		for (const entity of TARGETS) {
			if (is_on_cooldown("zapperzap")) break;

			try {
				await use_skill("zapperzap", entity);
			} catch (e) {
				console.error("handle_zapper error:", e);
			}
		}
	}

	if (TARGETS.length === 0 && HAS_ZAPPER && CAN_SWAP && character.map === destination.map) {
		try {
			await equip_once("zap-off", EQUIP_PRIORITY.skill, "zap_off");
			state.last_equip_time = NOW;
		} catch (e) {
			console.error("Failed to unequip zapper:", e);
		}
	}
}

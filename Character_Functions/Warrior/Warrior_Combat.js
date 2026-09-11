// --------------------------------------------------------------------------------------------------------------------------------- //
// WARRIOR COMBAT — target selection, the cache refresh, and the attack loop
// --------------------------------------------------------------------------------------------------------------------------------- //

function update_cache() {
	cache.tank_entity = get_entity(PARTY_TANK)
	cache.monsters_in_cleave_range = find_monsters_in_cleave_range();
	cache.cleave_rules = monster_overrides(CONFIG.combat.monster_rules, G.skills.cleave.range);
	cache.agitate_rules = monster_overrides(CONFIG.combat.monster_rules, G.skills.agitate.range);

	if (!cache.is_valid()) {
		cache.cluster_target = find_cluster_target();
		cache.target = find_best_target();
		cache.party_members = get_party_members();
		cache.last_update = performance.now();
	}
}

function find_cluster_target() {
	const in_range = Object.values(parent.entities).filter(e =>
		e?.type === "monster" &&
		!e.dead &&
		e.visible &&
		distance(character, e) <= character.range
	);
	if (!in_range.length) return null;

	if (CONFIG.combat.prefer_isolated_targets) {
		return score_by_isolation(in_range)[0]?.mob || null;
	}

	const scored = score_by_explosion_spread(in_range);
	return scored[0]?.count >= CONFIG.combat.cluster_min_mobs ? scored[0].mob : null;
}

function find_best_target() {
	const max_dist = WARRIOR_TARGET === "giantspider" ? 50 : character.range;

	for (const boss_type of CONFIG.combat.all_bosses) {
		const boss = get_nearest_monster_v2({ type: boss_type, max_distance: max_dist });
		if (boss) return boss;
	}

	const cursed = get_nearest_monster_v2({ status_effects: ["cursed"], max_distance: max_dist, check_max_hp: true });
	if (cursed) return cursed;

	if (WARRIOR_TARGET === "giantspider") {
		return get_nearest_monster_v2({ max_distance: max_dist }) || null;
	}
	if (cache.cluster_target && !cache.cluster_target.dead) return cache.cluster_target;

	return get_nearest_monster_v2({ max_distance: max_dist, check_max_hp: true }) || null;
}

function find_monsters_in_cleave_range() {
	return Object.values(parent.entities).filter(e =>
		e?.type === "monster" &&
		!e.dead &&
		e.visible &&
		distance(character, e) <= G.skills.cleave.range
	);
}

function mob_count() {
	const tank_name = cache.tank_entity?.name;
	if (!tank_name) return 0;

	return Object.values(parent.entities).filter(e =>
		e?.type === "monster" &&
		e.target === tank_name &&
		!e.dead
	).length;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// STATUS SWAP TRICK
// --------------------------------------------------------------------------------------------------------------------------------- //

var STATUS_SWAP_TRICKS = {
	bscorpion: {
		status: "sugarrush",
		base_set: "single",
		swap_slots: [{ num: 39, slot: "mainhand" }, { num: 40, slot: "offhand" }],
		swap_delay_ms: 75,
		settle_delay_ms: 225,
		label: "Sugar Rush",
		color: "#ff69b4",
	},
};

var swap_trick_attempts = 0;
var swap_trick_history = {};

async function status_swap_trick_check(target) {

	if (can_kill_in_one_shot(target)) claim_monsters([target]);

	note_attack_sent();
	Promise.resolve(attack(target)).catch(e => catcher(e, "action_loop"));

	const trick = STATUS_SWAP_TRICKS[target?.mtype];
	if (!trick || character.s[trick.status] !== undefined) return;

	if (!is_set_equipped(trick.base_set)) return;

	const token = equip_claim("swap-trick", EQUIP_PRIORITY.trick);
	if (!token) return;
	try {
		swap_trick_attempts++;
		if (!await equip_apply_slots(token, trick.swap_slots)) return;
		await delay(trick.swap_delay_ms);
		if (!await equip_apply_slots(token, trick.swap_slots)) return;
		await delay(trick.settle_delay_ms);

		if (character.s[trick.status] !== undefined) {
			if (!swap_trick_history[target.mtype]) swap_trick_history[target.mtype] = [];
			const history = swap_trick_history[target.mtype];
			history.push(swap_trick_attempts);
			if (history.length > 30) history.shift();
			const avg = history.reduce((a, b) => a + b, 0) / history.length;
			log(`${trick.label} activated! Avg attempts: ${avg.toFixed(1)}`, trick.color, "Alerts");
			swap_trick_attempts = 0;
		}
	} finally {
		equip_release(token);
	}
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// ACTION LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

async function action_loop() {
	if (should_pause_combat_loop()) return setTimeout(action_loop, 100);
	let delay = 10;

	try {
		if (is_disabled(character)) return setTimeout(action_loop, 50);

		update_cache();

		const target = cache.target;
		const ms = ms_to_next_skill("attack");

		if (ms === 0 && !is_travelling() && target) {
			await status_swap_trick_check(target);
		} else {
			delay = next_action_delay(ms);
		}

	} catch (e) {
		catcher(e, "action_loop");
		delay = 1;
	}

	setTimeout(action_loop, delay);
}

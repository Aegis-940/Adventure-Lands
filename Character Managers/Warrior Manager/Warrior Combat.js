// --------------------------------------------------------------------------------------------------------------------------------- //
// WARRIOR COMBAT — target selection, the cache refresh, and the attack loop
// --------------------------------------------------------------------------------------------------------------------------------- //

function update_cache() {
	if (cache.is_valid()) return;
	cache.tank_entity = get_entity("Myras");
	sample_set_profiles(CONFIG.equipment.weapon_sets.concat("bataxe"));
	cache.monsters_in_cleave_range = find_monsters_in_cleave_range();
	cache.target = find_best_target();
	cache.party_members = get_party_members();
	cache.last_update = performance.now();
}

function cooperative_luck_logger() {
	game.on("death", data => {
		const mob = parent.entities[data.id];
		if (!mob || !mob.cooperative) return;

		const party_members = Object.keys(get_party() || {});
		if (mob.target !== character.name && !party_members.includes(mob.target)) return;

		log(`${mob.mtype} died with ${character.luckm} luck`, "#96a4ff", "Alerts");
	});
}

function find_best_target() {
	const forced = dungeon_focus_target();
	if (forced) return forced;

	const max_dist = dungeon_engage_radius();

	const context = {
		explosion: character.explosion || 0,
		party_factor: CONFIG.combat.party_dps_factor,
		protect: CONFIG.combat.target_priority
	};

	const boss = best_target({ type: CONFIG.combat.all_bosses, max_distance: max_dist }, { close: 1 }, context);
	if (boss) return boss;

	return best_target({ max_distance: max_dist }, dungeon_target_weights(CONFIG.combat.target_weights), context);
}

function find_monsters_in_cleave_range() {
	return monsters_matching({ max_distance: G.skills.cleave.range, point_for_distance_check: [character.x, character.y] });
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// STATUS SWAP TRICK
// --------------------------------------------------------------------------------------------------------------------------------- //

var STATUS_SWAP_TRICKS = {
	bscorpion: {
		status: "sugarrush",
		base_set: "single",
		swap_items: [
			{ item_name: "candycanesword", slot: "mainhand" },
			{ item_name: "candycanesword", slot: "offhand" },
		],
		swap_delay_ms: 75,
		settle_delay_ms: 225,
		label: "Sugar Rush",
		color: "#ff69b4",
	},
};

var swap_trick_attempts = 0;
var swap_trick_history = {};

async function status_swap_trick_check(target) {
	if (basic_action_busy()) return;
	run_basic_action(attack(target), "attack");

	const trick = STATUS_SWAP_TRICKS[target?.mtype];
	if (!trick || character.s[trick.status] !== undefined) return;

	if (!is_set_equipped(trick.base_set)) return;

	const slots = resolve_swap_slots(trick.swap_items);
	if (!slots) return;

	const token = equip_claim("swap-trick", EQUIP_PRIORITY.trick);
	if (!token) return;
	try {
		swap_trick_attempts++;
		if (!await equip_apply_slots(token, slots)) return;
		await delay(trick.swap_delay_ms);
		if (!await equip_apply_slots(token, slots)) return;
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
	loop_tick("action_loop");
	if (should_pause_combat_loop()) return setTimeout(action_loop, loop_next("action_loop", 100));
	let next_delay = 10;

	try {
		if (is_disabled(character)) return setTimeout(action_loop, loop_next("action_loop", 50));

		update_cache();

		const target = cache.target;
		const ms = ms_to_next_skill("attack");

		if (ms === 0 && !travel_blocks_combat() && target && is_in_range(target)) {
			await status_swap_trick_check(target);
		} else {
			next_delay = next_action_delay(ms);
		}

	} catch (e) {
		catcher(e, "action_loop");
		next_delay = TICK_RATE.retry;
	}

	setTimeout(action_loop, loop_next("action_loop", next_delay));
}

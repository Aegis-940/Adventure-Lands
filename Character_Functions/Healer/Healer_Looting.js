// --------------------------------------------------------------------------------------------------------------------------------- //
// HEALER LOOTING — chest opening, and the gold-gear swap around it
// --------------------------------------------------------------------------------------------------------------------------------- //

function should_loot() {
	if (!CONFIG.looting.enabled /*|| !state.skinReady*/ || character.cc > COOLDOWNS.cc) return false;

	const now = performance.now();
	const stored_chest_count = Object.keys(get_chests()).length;
	const penalty = character.s?.penalty_cd?.ms || 0;
	const cooldown_pass = now - state.last_loot_time > CONFIG.looting.loot_cooldown;

	return (
		stored_chest_count >= CONFIG.looting.chest_threshold &&
		character.targets < CONFIG.looting.target_count &&
		cooldown_pass &&
		penalty === 0 &&
		state.current !== "looting"
	);
}

async function handle_looting() {
	state.last_loot_time = performance.now();
	state.current = "looting";
	const token = equip_claim("looting", EQUIP_PRIORITY.loot);

	try {
		if (token && CONFIG.looting.equip_gold_gear && !is_set_equipped("gold") && performance.now() - state.last_gold_swap > 1000) {
			await equip_apply(token, "gold");
			state.last_gold_swap = performance.now();
			await swap_booster("luckbooster", "goldbooster");
			await delay(200);
		}

		let looted = 0;
		const max_loots = CONFIG.looting.chest_threshold * 5;

		const stored_chests = get_chests();
		for (const chest_id in stored_chests) {
			if (looted >= max_loots) break;
			parent.open_chest(chest_id);
			looted++;
		}

		await delay(150);

		if (CONFIG.looting.equip_gold_gear) {
			await swap_booster("goldbooster", "luckbooster");
			await delay(200);
		}
	} catch (e) {
		catcher(e, "handle_looting");
	} finally {
		state.current = "idle";
		equip_release(token);
	}
}

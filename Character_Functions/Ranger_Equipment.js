// --------------------------------------------------------------------------------------------------------------------------------- //
// RANGER EQUIPMENT — split out of Ranger_Functions.js for compartmentalization.
// Separate eval closure (own role-file entry in Bootstrapper.js) loaded right after
// Ranger_Functions.js — reads/writes that file's state/cache/CONFIG/destination
// globals (all var there for exactly this reason) and defines equipment_loop() as a
// real function declaration so Ranger_Functions.js's "START ALL LOOPS" can still call it.
// --------------------------------------------------------------------------------------------------------------------------------- //

async function equipment_loop() {
	const delay = TICK_RATE.equipment;

	try {
		if (character.cc > COOLDOWNS.cc) {
			return setTimeout(equipment_loop, delay);
		}

		const now = performance.now();
		const swap_cooldown = CONFIG.equipment.swap_cooldown;

		// Weapon Set Swap
		if (now - state.last_weapon_swap > swap_cooldown) {
			const { in_range, out_of_range } = cache.targets;
			const min5 = CONFIG.combat.min_targets_for_5shot;
			const min3 = CONFIG.combat.min_targets_for_3shot;
			const can_5shot = character.mp >= (G.skills["5shot"]?.mp + 400);
			const can_3shot = character.mp >= (G.skills["3shot"]?.mp + 200);

			let desired;
			if (cache.heal_target) {
				desired = "heal";
			} else if (RANGER_TARGET === "giantspider") {
				desired = "single";
			} else if (can_5shot && (in_range.length >= min5 || out_of_range.length >= min5)) {
				desired = "boom";
			} else if (can_3shot && in_range.length >= min3) {
				desired = "boom";
			} else if (cache.targets.cluster_target) {
				desired = "boom";
			} else {
				desired = "single";
			}

			if (!is_set_equipped(desired)) {
				equip_set(desired);
				state.last_weapon_swap = now;
			}
		}

		const mainhand = character.slots?.mainhand?.name;
		if (mainhand === "cupid") return setTimeout(equipment_loop, delay);

		const active_boss = EVENT_LOCATIONS
			.map(e => ({ name: e.name, data: parent.S[e.name] }))
			.find(e => e.data?.live);

		// // Booster Swap
		// if (now - state.last_booster_swap > swap_cooldown) {
		// 	let desired_booster = active_boss && active_boss.data.hp < CONFIG.equipment.boss_hp_thresholds[active_boss.name]
		// 		? "luckbooster"
		// 		: "xpbooster";

		// 	const current_booster_slot = locate_item(desired_booster);
		// 	if (current_booster_slot === -1) {
		// 		const other_booster_slot = find_booster_slot();
		// 		if (other_booster_slot !== null) {
		// 			shift(other_booster_slot, desired_booster);
		// 			state.last_booster_swap = now;
		// 		}
		// 	}
		// }

		// // Cape Swap
		// if (CONFIG.equipment.cape_swap_enabled && now - state.last_cape_swap > swap_cooldown) {
		// 	const chest_count = get_num_chests();
		// 	const num_targets = get_num_targets("Myras");
		// 	const target_cape_set = chest_count >= CONFIG.equipment.chestThreshold && num_targets < 6
		// 		? "stealth"
		// 		: "cape";

		// 	if (target_cape_set && !is_set_equipped(target_cape_set)) {
		// 		equip_set(target_cape_set);
		// 		state.last_cape_swap = now;
		// 	}
		// }

		// // Coat Swap
		// if (CONFIG.equipment.coat_swap_enabled && now - state.last_coat_swap > swap_cooldown) {
		// 	const target_coat_set = character.mp > CONFIG.equipment.mp_thresholds.upper
		// 		? "stat"
		// 		: character.mp < CONFIG.equipment.mp_thresholds.lower && "mana";

		// 	if (target_coat_set && !is_set_equipped(target_coat_set)) {
		// 		equip_set(target_coat_set);
		// 		state.last_coat_swap = now;
		// 	}
		// }

		// // XP Set Swap
		// if (CONFIG.equipment.xp_set_swap_enabled && now - state.last_xp_swap > swap_cooldown && character.map === mob_map) {
		// 	const has_low_hp_xp_mob = Object.values(parent.entities).some(e =>
		// 		e?.type === "monster" && !e.dead &&
		// 		CONFIG.equipment.xp_monsters.includes(e.mtype) &&
		// 		e.hp < CONFIG.equipment.xp_mob_hp_threshold
		// 	);
		// 	const target_xp_set = has_low_hp_xp_mob ? "xp" : "orb";

		// 	if (target_xp_set && !is_set_equipped(target_xp_set)) {
		// 		equip_set(target_xp_set);
		// 		state.last_xp_swap = now;
		// 	}
		// }

		// Boss Set Swap
		if (CONFIG.equipment.boss_set_swap_enabled && now - state.last_boss_set_swap > swap_cooldown) {
			const target_set = active_boss
				? active_boss.data.hp > CONFIG.equipment.boss_hp_thresholds[active_boss.name] ? "dps" : "luck"
				: (character.map === destination.map && "dps");

			if (target_set && !is_set_equipped(target_set)) {
				equip_set(target_set);
				state.last_boss_set_swap = now;
			}
		}

	} catch (e) {
		console.error("equipment_loop error:", e);
	}

	setTimeout(equipment_loop, delay);
}

// find_booster_slot, get_num_chests, get_num_targets → Common_Functions.js

// Started here, not in Ranger_Functions.js's "START ALL LOOPS" — that file's eval
// finishes before this one even loads, so calling equipment_loop() from there would
// throw ReferenceError. This is the first point at which the function exists.
equipment_loop();


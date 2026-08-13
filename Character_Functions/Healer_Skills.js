// --------------------------------------------------------------------------------------------------------------------------------- //
// HEALER SKILLS — split out of Healer_Functions.js for compartmentalization.
// Separate eval closure (own role-file entry in Bootstrapper.js) loaded right after
// Healer_Functions.js — reads/writes that file's state/cache/CONFIG/home/destination
// globals (all var there for exactly this reason) and defines skill_loop()/try_heal() as
// real function declarations so Healer_Functions.js's action_loop()/"START ALL LOOPS"
// can still call them.
// --------------------------------------------------------------------------------------------------------------------------------- //

async function skill_loop() {
	// if (panicking) return setTimeout(skill_loop, 100);
	const delay = 40;

	try {
		if (is_disabled(character)) {
			return setTimeout(skill_loop, 250);
		}

		update_cache();

		const PENALTY = character.s?.penalty_cd?.ms || 0;

		// Curse
		if (CONFIG.combat.enabled) {
			await handle_curse();
		}

		// Absorb 
		if (CONFIG.healing.absorb_enabled && PENALTY < 500) {
			await handle_absorb();
		}

		// Party Heal
		if (true) {
			await handle_party_heal();
		}

		// Dark Blessing
		if (CONFIG.healing.dark_blessing_enabled && !is_on_cooldown("darkblessing")
			&& character.mp >= (G.skills.darkblessing?.mp || 0)) {
			if (HEALER_TARGET !== "bscorpion" || bscorpion_worth_buffing()) {
				await use_skill("darkblessing");
			}
		}

		// Zapper
		// if (CONFIG.combat.zapper_enabled) {
		// 	await handle_zapper();
		// }

	} catch (e) {
		console.error("skill_loop error:", e);
	}

	setTimeout(skill_loop, delay);
}

async function try_heal() {
	const HEAL_TARGET = cache.heal_target;
	if (!HEAL_TARGET) return false;

	const HEAL_THRESHOLD = HEAL_TARGET.max_hp - character.heal / 1.33;

	if (HEAL_TARGET.hp < HEAL_THRESHOLD && is_in_range(HEAL_TARGET, "heal")) {
		// log(`Healing → ${HEAL_TARGET.name} (${Math.round((HEAL_TARGET.hp / HEAL_TARGET.max_hp) * 100)}%)`, "#33AAFF");
		await heal(HEAL_TARGET);
		return true;
	}

	return false;
}

async function handle_curse() {
	if (is_on_cooldown("curse") || smart.moving) return;

	const X = locations[home][0].x;
	const Y = locations[home][0].y;

	// Only consider monsters that are already engaged (have a target)
	const has_target = e =>
		e?.type === "monster" && !e.dead && e.visible && e.target && !e.immune &&
		e.hp >= e.max_hp * 0.01;

	let target = null;

	// Boss priority: nearest engaged boss
	const bosses_with_target = Object.values(parent.entities)
		.filter(e => has_target(e) && CONFIG.combat.all_bosses.includes(e.mtype))
		.sort((a, b) => distance(character, a) - distance(character, b));
	if (bosses_with_target.length) target = bosses_with_target[0];

	// Giantspider follow mode: highest-HP monster within 50 units of the healer
	if (!target && HEALER_TARGET === "giantspider") {
		const nearby = Object.values(parent.entities)
			.filter(e => has_target(e) && Math.hypot(character.x - e.x, character.y - e.y) <= 50)
			.sort((a, b) => b.hp - a.hp);
		if (nearby.length) target = nearby[0];
	}

	// Home-mob fallback: highest-HP engaged home mob near the spot
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

	const maps_to_exclude = ["level2n", "level2w"];
	if (maps_to_exclude.includes(character.map)) return;

	// Boss check - ALWAYS absorb boss targets (highest priority)
	// const boss = get_nearest_monster_v2({ type: CONFIG.combat.all_bosses });
	// if (boss?.target && boss.target !== character.name) {
	// 	const TARGET_PLAYER = get_player(boss.target);
	// 	if (TARGET_PLAYER) {
	// 		await use_skill("absorb", boss.target);
	// 		log(`Boss Absorb → ${boss.mtype} from ${boss.target}`, "#FF3333");
	// 		return;
	// 	}
	// }

	// Party absorb - check in real-time, not from cache
	if (!character.party) return;

	const PARTY_NAMES = Object.keys(get_party());
	const ALLIES = PARTY_NAMES.filter(n => n !== character.name);
	if (!ALLIES.length) return;

	for (let id in parent.entities) {
		const entity = parent.entities[id];
		if (!entity || entity.type !== "monster" || entity.dead) continue;

		// If this monster is targeting an ally and not us
		if (entity.target && ALLIES.includes(entity.target) && entity.target !== character.name) {
			await use_skill("absorb", entity.target);
			return;
		}
	}
}


const PARTY_HEAL_COOLDOWN = 250;
let last_party_heal_time = 0;

async function handle_party_heal() {
	const now = performance.now();
	if (now - last_party_heal_time < PARTY_HEAL_COOLDOWN) return;

	let threshold = CONFIG.healing.party_heal_threshold;
	if (character.map !== destination.map) {
		threshold = 0.75;
	}

	if (character.mp <= CONFIG.healing.party_heal_min_mp) return;

	for (const name of cache.party_members) {
		const ally = get_player(name);
		if (!ally || ally.rip || ally.hp >= ally.max_hp * threshold) continue;
		// log(`Party Heal → ${name} (${Math.round((ally.hp / ally.max_hp) * 100)}%)`, "#33FF77");
		await use_skill("partyheal");
		last_party_heal_time = now;
		break;
	}
}


async function handle_zapper() {
	const TARGETS = find_zap_targets();
	const NOW = performance.now();
	const HAS_ZAPPER = character.slots.ring2?.name === "zapper";
	const CAN_SWAP = NOW - state.last_equip_time > COOLDOWNS.zapper_swap;
	const HAS_ENOUGH_MP = character.mp > (G?.skills?.zapperzap?.mp || 0) + 1250;

	if (smart.moving || character.cc > COOLDOWNS.cc) return;

	// Step 1: Equip zapper if untargeted mobs exist and we don't have it equipped
	if (TARGETS.length > 0 && !HAS_ZAPPER && CAN_SWAP && HAS_ENOUGH_MP && character.map === destination.map) {
		try {
			await equip_set("zap_on");
			state.last_equip_time = NOW;
		} catch (e) {
			console.error("Failed to equip zapper:", e);
		}
		return;
	}

	// Step 2: Zap all untargeted mobs if we have zapper equipped
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

	// Step 3: Only unequip zapper when NO untargeted mobs remain
	// Don't unequip just because we zapped them all - they might respawn
	if (TARGETS.length === 0 && HAS_ZAPPER && CAN_SWAP && character.map === destination.map) {
		try {
			await equip_set("zap_off");
			state.last_equip_time = NOW;
		} catch (e) {
			console.error("Failed to unequip zapper:", e);
		}
	}
}

// Started here, not in Healer_Functions.js's "START ALL LOOPS" — that file's eval
// finishes before this one even loads, so calling skill_loop() from there would
// throw ReferenceError. This is the first point at which the function exists.
skill_loop();

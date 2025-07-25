
// --------------------------------------------------------------------------------------------------------------------------------- //
// ATTACK LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

let lastSwitchTime = 0, state = "attacking";
const switchCooldown = 750;
const rangeThreshold = 45;
const X = locations[home][0].x, Y = locations[home][0].y;
let lastEquippedSet = null;

async function attack_loop() {
    const now = performance.now();
    const entities = Object.values(parent.entities);
    const healer = get_entity("Myras");
    const healThreshold = (!healer || healer.rip) ? 0.9 : 0.4;

    const sortedByHP = [];
    for (const e of entities) {
        if (e.type === "monster" && (e.target === MONSTER_TYPES[0] || e.target === MONSTER_TYPES[1])) {
            sortedByHP.push(e);
        }
    }
    sortedByHP.sort((a, b) => b.hp - a.hp);

    const inRange = [], outOfRange = [];
    for (const mob of sortedByHP) {
        (Math.hypot(mob.x - X, mob.y - Y) <= rangeThreshold ? inRange : outOfRange).push(mob);
    }

    const healTarget = null; //lowest_health_partymember(); // Still using external func here
    if (healTarget && healTarget.hp < healTarget.max_hp * healThreshold) {
        state = "healing";
    } else {
        state = "attacking";
    }

    let delay;

    try {
        switch (state) {
            case "healing":
                smartEquip("heal");
                await attack(healTarget);
                delay = ms_to_next_skill("attack");
                break;

            case "attacking":
                if (sortedByHP.length) {
                    const cursed = get_nearest_monster_v2({ statusEffects: ["cursed"] });
                    if (cursed) {
                        change_target(cursed);
                        if (!is_on_cooldown("huntersmark")) await use_skill("huntersmark", cursed);
                        if (!is_on_cooldown("supershot")) await use_skill("supershot", cursed);
                    }

                    //if (inRange.length >= 4) {
                        //smartEquip("boom");
                        //await use_skill("5shot", inRange.slice(0, 5).map(e => e.id));
                    //} else if (outOfRange.length >= 4) {
                        //smartEquip("dead");
                    //    await use_skill("5shot", outOfRange.slice(0, 5).map(e => e.id));
                    if (sortedByHP.length >= 2) {
                        //smartEquip("dead");
                        await use_skill("3shot", sortedByHP.slice(0, 3).map(e => e.id));
                    } else if (sortedByHP.length === 1 && is_in_range(sortedByHP[0])) {
                        //smartEquip("single");
                        await attack(sortedByHP[0]);
                    }
                    delay = ms_to_next_skill("attack");
                }
                break;

            default:
                console.error("Unknown state:", state);
                break;
        }
    } catch (err) {
        console.error(err);
    }

    setTimeout(attackLoop, delay);
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// MOVE LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

async function move_loop() {
	let delay = 100;

	try {

		if (character.moving || smart.moving) {
			// Skip movement logic, but continue the loop
			return setTimeout(move_loop, delay);
		}

		let monster = null;

		for (let i = 0; i < MONSTER_TYPES.length; i++) {
			monster = get_nearest_monster_v2({
				type: MONSTER_TYPES[i],
				check_min_hp: true,
				path_check: true,
			});

			if (monster && !is_in_range(monster)) break;
			monster = null;
		}

		if (monster) {
			await move(
				character.real_x + (monster.real_x - character.real_x) / 2,
				character.real_y + (monster.real_y - character.real_y) / 2
			);
		}
	} catch (e) {
		console.error(e);
	}

	setTimeout(move_loop, delay);
}


const locations = {
    bat: [{ x: 1200, y: -782 }],
    bbpompom: [{ x: -82, y: -949 }],
    bigbird: [{ x: 1300, y: -69 }],
    bluefairy: [{ x: -357, y: -675 }],
    boar: [{ x: 19, y: -1109 }],
    bscorpion: [{ x: -616, y: -1279 }],
    cgoo: [{ x: -221, y: -274 }],
    crab: [{ x: -11840, y: -37 }],
    dryad: [{ x: 403, y: -347 }],
    ent: [{ x: -420, y: -1960 }],
    fireroamer: [{ x: 222, y: -827 }],
    ghost: [{ x: -405, y: -1642 }],
    gscorpion: [{ x: 390, y: -1422 }],
    iceroamer: [{ x: 823, y: -45 }],
    mechagnome: [{ x: 0, y: 0 }],
    mole: [{ x: 14, y: -1072 }],
    mummy: [{ x: 256, y: -1417 }],
    odino: [{ x: -52, y: 756 }],
    oneeye: [{ x: -270, y: 160 }],
    pinkgoblin: [{ x: 366, y: 377 }],
    poisio: [{ x: -121, y: 1360 }],
    prat: [{ x: -296, y: 558 }], //[{ x: 6, y: 430 }]
    pppompom: [{ x: 292, y: -189 }],
    plantoid: [{ x: -780, y: -387 }], // [{ x: -840, y: -340 }]
    rat: [{ x: -223, y: -313 }],
    scorpion: [{ x: -495, y: 685 }],
    stoneworm: [{ x: 830, y: 7 }],
    spider: [{ x: 1247, y: -91 }],
    squig: [{ x: -1175, y: 422 }],
    targetron: [{ x: -544, y: -275 }],
    wolf: [{ x: 433, y: -2745 }],
    wolfie: [{ x: 113, y: -2014 }],
    xscorpion: [{ x: -495, y: 685 }]
};

const home = 'targetron';

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

    let delay;

    try {
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
	    
    } catch (err) {
        console.error(err);
    }

    setTimeout(attack_loop, delay);
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

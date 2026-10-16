// --------------------------------------------------------------------------------------------------------------------------------- //
// PORCUPINE — porcupines reflect, so Ulric never touches one and keeps his single set near them, and Riva kills them first
// --------------------------------------------------------------------------------------------------------------------------------- //

const PORCUPINE_SPLASH_MARGIN = 40;

function porcupines_in_splash() {
	return monsters_matching({
		type: "porcupine",
		max_distance: character.range + PORCUPINE_SPLASH_MARGIN,
		point_for_distance_check: [character.x, character.y]
	}).length > 0;
}

encounter("porcupine", {
	tier: "hazard",
	mtypes: ["porcupine"],
	active: ctx => ctx.mobs.of("porcupine").length > 0,
	gear: {
		warrior: { weapon: () => porcupines_in_splash() ? "single" : null },
	},
	allows: {
		warrior: { attack: false, cleave: false, agitate: false },
	},
	rank: {
		ranger: 1,
	},
});

// --------------------------------------------------------------------------------------------------------------------------------- //
// HALLOWEEN BOSSES — mrpumpkin, mrgreen, the Headless Horseman and the Gargoyle: Myras tanks, Ulric taunts them off other players
// onto himself for her to absorb and cleaves even with one in reach, and the damage dealers wear their single-target sets
// --------------------------------------------------------------------------------------------------------------------------------- //

const HALLOWEEN_BOSSES = ["mrpumpkin", "mrgreen", "horseman", "gargoyle"];

encounter("halloween bosses", {
	tier: "situation",
	mtypes: HALLOWEEN_BOSSES,
	active: () => HALLOWEEN_BOSSES.some(type => !!get_nearest_monster({ type })),
	gear: {
		warrior: { weapon: "single", orb: "orb_dps" },
		ranger: { weapon: "single", chest: "dps_chest" },
	},
	traits: {
		priest: { tank: true },
		warrior: { taunt: true, cleave_alone: true },
	},
});

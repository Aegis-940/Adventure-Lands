// --------------------------------------------------------------------------------------------------------------------------------- //
// HALLOWEEN BOSSES — Myras tanks every one, and Ulric taunts them off other players onto himself for her to absorb and cleaves even
// with one in reach. mrpumpkin and mrgreen come alone, so the damage dealers wear their single-target sets; the Headless Horseman
// and the Gargoyle come with a crowd (Jack-o Walkers, the graveyard's mummies), so the weapon chooser picks as it does anywhere
// and Riva's shot chooser may multishot the crowd with the boss
// --------------------------------------------------------------------------------------------------------------------------------- //

const HALLOWEEN_BOSSES = ["mrpumpkin", "mrgreen"];
const HALLOWEEN_CROWD_BOSSES = ["horseman", "gargoyle"];

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

encounter("halloween crowd bosses", {
	tier: "situation",
	mtypes: HALLOWEEN_CROWD_BOSSES,
	active: () => HALLOWEEN_CROWD_BOSSES.some(type => !!get_nearest_monster({ type })),
	gear: {
		warrior: { orb: "orb_dps" },
	},
	traits: {
		priest: { tank: true },
		warrior: { taunt: true, cleave_alone: true },
		ranger: { multishot_with_boss: true },
	},
});

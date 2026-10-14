// --------------------------------------------------------------------------------------------------------------------------------- //
// HALLOWEEN BOSSES — mrpumpkin and mrgreen: Myras tanks, Ulric taunts them off other players onto himself for her to absorb
// and cleaves even with one in reach, and the damage dealers wear their single-target sets
// --------------------------------------------------------------------------------------------------------------------------------- //

encounter("halloween bosses", {
	tier: "situation",
	mtypes: ["mrpumpkin", "mrgreen"],
	active: () => !!(get_nearest_monster({ type: "mrpumpkin" }) || get_nearest_monster({ type: "mrgreen" })),
	gear: {
		warrior: { weapon: "single", orb: "orb_dps" },
		ranger: { weapon: "single", chest: "dps_chest" },
	},
	traits: {
		priest: { tank: true },
		warrior: { taunt: true, cleave_alone: true },
	},
});

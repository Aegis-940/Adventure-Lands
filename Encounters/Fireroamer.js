// --------------------------------------------------------------------------------------------------------------------------------- //
// FIREROAMER — the desertland spawn: Myras wears fire resistance and skips her panic check, Ulric agitates only while the party
// is healthy, and Riva spends no skills on a fireroamer
// --------------------------------------------------------------------------------------------------------------------------------- //

encounter("fireroamer", {
	tier: "spawn",
	homes: ["fireroamer"],
	mtypes: ["fireroamer"],
	gear: {
		priest: { loadout: "fireres", orb: "orb_fire" },
	},
	settings: {
		priest: { skip_panic: true },
		warrior: {
			agitate_conditions: {
				healer_hp_pct: 0.60,
				healer_mp_pct: 0.80,
				ranger_hp_pct: 0.95,
				warrior_hp_pct: 0.95,
				max_mobs_in_range: 6,
			},
		},
	},
	allows: {
		ranger: { skills: false },
	},
});

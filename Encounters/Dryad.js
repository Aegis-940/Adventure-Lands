// --------------------------------------------------------------------------------------------------------------------------------- //
// DRYAD — the mforest spawn: Myras wears her magic-defence loadout, and Riva spends no skills on a dryad
// --------------------------------------------------------------------------------------------------------------------------------- //

encounter("dryad", {
	tier: "spawn",
	homes: ["dryad"],
	mtypes: ["dryad"],
	gear: {
		priest: { loadout: "mdef" },
	},
	allows: {
		ranger: { skills: false },
	},
});

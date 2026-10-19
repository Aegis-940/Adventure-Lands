// --------------------------------------------------------------------------------------------------------------------------------- //
// TARGETRON-SPARKBOT — the uhills clump of targetrons and sparkbots: Myras wears her luck set and no curse, the party stacks its debuffs on one farm focus,
// and Ulric agitates sparkbots wherever he meets them
// --------------------------------------------------------------------------------------------------------------------------------- //

encounter("targetron-sparkbot", {
	tier: "spawn",
	homes: ["sparkbot", "targetron"],
	mtypes: ["sparkbot"],
	gear: {
		priest: { loadout: "luck_lantern", orb: "uhills_orb", gloves: "uhills_gloves", chest: "uhills_chest", amulet: "uhills_amulet" },
	},
	settings: {
		priest: { curse: false },
		all: { farm_focus: true },
	},
	traits: {
		warrior: { pull: true },
	},
});

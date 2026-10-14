// --------------------------------------------------------------------------------------------------------------------------------- //
// MUMMY — the spookytown spawn: Myras zap-pulls with her luck orb and leaves curses for bosses; nobody spends skills on a mummy
// --------------------------------------------------------------------------------------------------------------------------------- //

encounter("mummy", {
	tier: "spawn",
	homes: ["mummy"],
	mtypes: ["mummy"],
	gear: {
		priest: { orb: "orb_luck" },
	},
	settings: {
		priest: { curse: false, zap_pull: true },
	},
	allows: {
		warrior: { pull: false },
		ranger: { skills: false },
	},
});

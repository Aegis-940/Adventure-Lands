// --------------------------------------------------------------------------------------------------------------------------------- //
// MONSTER RULES — single monster types with a rule or two and no spawn of their own; each rule holds wherever the monster is met
// --------------------------------------------------------------------------------------------------------------------------------- //

encounter("pppompom", {
	mtypes: ["pppompom"],
	allows: {
		warrior: { cleave: false, pull: false },
	},
});

encounter("redfairy", {
	mtypes: ["redfairy"],
	allows: {
		warrior: { agitate: false },
	},
});

encounter("nerfedmummy", {
	mtypes: ["nerfedmummy"],
	allows: {
		ranger: { attack: false },
	},
});

encounter("franky", {
	mtypes: ["franky"],
	traits: {
		warrior: { hold_cleave: true },
	},
});

encounter("icegolem", {
	mtypes: ["icegolem"],
	traits: {
		warrior: { hold_cleave: true },
	},
});

encounter("plantoid", {
	mtypes: ["plantoid"],
	allows: {
		ranger: { skills: false },
	},
});

encounter("mole", {
	mtypes: ["mole"],
	allows: {
		ranger: { skills: false },
	},
});

encounter("jr", {
	mtypes: ["jr", "greenjr"],
	traits: {
		warrior: { pull: true },
	},
});

encounter("bigbird", {
	mtypes: ["bigbird"],
	traits: {
		warrior: { pull: true },
	},
});

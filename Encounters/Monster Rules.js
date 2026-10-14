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

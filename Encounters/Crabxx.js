// --------------------------------------------------------------------------------------------------------------------------------- //
// CRABXX — the kited boss and the crabx it spawns: Myras tanks, the damage dealers wear their AOE sets, Riva shoots only the
// adds already on someone, and Ulric agitates a fresh pack of five
// --------------------------------------------------------------------------------------------------------------------------------- //

encounter("crabxx", {
	tier: "situation",
	mtypes: ["crabxx"],
	active: () => !!get_nearest_monster({ type: "crabxx" }),
	gear: {
		warrior: { weapon: "double_aoe" },
		ranger: { weapon: "boom" },
	},
	traits: {
		priest: { tank: true },
	},
});

encounter("crabx", {
	mtypes: ["crabx"],
	traits: {
		ranger: { attack_if_targeted: true },
		warrior: { agitate_pack: 5 },
	},
});

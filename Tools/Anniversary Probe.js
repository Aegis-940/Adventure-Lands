(() => {
	const RX = /kiss|featur|cake|anniv|emote|mira|smooch|birthday|candle|celebrat|decade/i;
	const out = { version: parent.G.version, when: new Date().toTimeString().slice(0, 8), found: {} };

	const scan = (obj, label, deep) => {
		if (!obj) return;
		for (const k in obj) {
			const v = obj[k];
			const hay = deep && v && typeof v === "object"
				? k + " " + JSON.stringify(v)
				: k + " " + ((v && v.name) || "");
			if (RX.test(hay)) {
				out.found[label] = out.found[label] || {};
				out.found[label][k] = v;
			}
		}
	};

	scan(parent.G.skills, "G.skills", true);
	scan(parent.G.conditions, "G.conditions", true);
	scan(parent.G.events, "G.events", true);
	scan(parent.G.npcs, "G.npcs", true);
	scan(parent.G.items, "G.items", false);
	scan(parent.G.monsters, "G.monsters", false);
	scan(parent.S, "S", true);

	const KNOWN = ["boop","charm","drop_egg","fart","headwiggle","hearts_single","highfive","joy",
		"jump","mirrordance","pocketstorm","power","scare","shelter","snowball","spotlight",
		"superjump","tangle","temporalsurge","warp","wiggle","xpower","zapperzap"];
	out.all_class_skills_not_in_our_reference = Object.keys(parent.G.skills || {})
		.filter(k => {
			const s = parent.G.skills[k];
			return s && Array.isArray(s.class) && s.class.includes("all") && !KNOWN.includes(k);
		})
		.map(k => ({ skill: k, def: parent.G.skills[k] }));

	out.S_keys = Object.keys(parent.S || {});
	out.S_live = Object.keys(parent.S || {}).filter(k => parent.S[k] && parent.S[k].live);

	out.my_conditions = Object.keys(character.s || {});

	console.log(JSON.stringify(out, null, 1));
	return out;
})();

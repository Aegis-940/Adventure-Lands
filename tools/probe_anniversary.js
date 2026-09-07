// Paste into any character's code slot / browser console and run once.
//
// The 10th-anniversary mechanic is newer than GAME_API_REFERENCE.md (dumped 2026-09-06 at
// G.version 6732, which lists only the 55 skills relevant to this party — a new emote can exist in
// the live client and simply not be in there). The official notes for [05/09/26] say only
// "find featured players ... and two new emotes", with no names, so there is nothing to code
// against yet. This reads the answer out of the running client instead of guessing at it.
//
// Run it TWICE: once now, and once while a featured player is actually active. The second run is
// what reveals how the server announces the target.

(() => {
	const RX = /kiss|featur|cake|anniv|emote|mira|smooch|birthday|candle|celebrat|decade/i;
	const out = { version: parent.G.version, when: new Date().toTimeString().slice(0, 8), found: {} };

	// Big collections (items/monsters) are matched on key + name only; stringifying every value
	// would be slow and would drown the output.
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

	// Every skill the client knows that our reference never listed — the new emotes will be here.
	const KNOWN = ["boop","charm","drop_egg","fart","headwiggle","hearts_single","highfive","joy",
		"jump","mirrordance","pocketstorm","power","scare","shelter","snowball","spotlight",
		"superjump","tangle","temporalsurge","warp","wiggle","xpower","zapperzap"];
	out.all_class_skills_not_in_our_reference = Object.keys(parent.G.skills || {})
		.filter(k => {
			const s = parent.G.skills[k];
			return s && Array.isArray(s.class) && s.class.includes("all") && !KNOWN.includes(k);
		})
		.map(k => ({ skill: k, def: parent.G.skills[k] }));

	// How the server announces live events. The featured player almost certainly appears here.
	out.S_keys = Object.keys(parent.S || {});
	out.S_live = Object.keys(parent.S || {}).filter(k => parent.S[k] && parent.S[k].live);

	// Conditions currently on us — run this right after receiving the buff to name it.
	out.my_conditions = Object.keys(character.s || {});

	console.log(JSON.stringify(out, null, 1));
	return out;
})();

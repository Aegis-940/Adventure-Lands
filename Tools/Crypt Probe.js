(() => {
	const MAP = "crypt";
	const SINK = "http://127.0.0.1:8787/errors";
	const out = { version: parent.G.version, when: new Date().toTimeString().slice(0, 8) };

	const m = parent.G.maps[MAP] || {};
	out.map = {
		instance: m.instance,
		safe: m.safe,
		on_death: m.on_death,
		spawns: m.spawns,
		doors: m.doors,
		npcs: m.npcs,
		irregular: m.irregular,
		no_bounds: m.no_bounds
	};

	out.monsters = (m.monsters || []).map(s => ({
		type: s.type,
		count: s.count,
		boundary: s.boundary,
		boundaries: s.boundaries,
		position: s.position,
		grow: s.grow,
		stype: s.stype,
		def: (({ name, hp, attack, speed, range, armor, resistance, frequency, damage_type, aggro, rage, respawn, immune, reflection, evasion, xp }) =>
			({ name, hp, attack, speed, range, armor, resistance, frequency, damage_type, aggro, rage, respawn, immune, reflection, evasion, xp }))(parent.G.monsters[s.type] || {})
	}));

	const geo = parent.G.geometry[MAP] || {};
	out.geometry = {
		min_x: geo.min_x, max_x: geo.max_x,
		min_y: geo.min_y, max_y: geo.max_y,
		x_lines: (geo.x_lines || []).length,
		y_lines: (geo.y_lines || []).length
	};

	out.entry = {
		doors_into_crypt: Object.keys(parent.G.maps).flatMap(k =>
			(parent.G.maps[k].doors || [])
				.map((d, i) => ({ from: k, index: i, door: d }))
				.filter(e => e.door[4] === MAP)),
		key_items: Object.keys(parent.G.items).filter(k => /crypt|key/i.test(k))
			.map(k => ({ id: k, name: parent.G.items[k].name, type: parent.G.items[k].type })),
		my_keys: character.items
			.map((it, slot) => it && /crypt|key/i.test(it.name) ? { slot, name: it.name, q: it.q } : null)
			.filter(Boolean)
	};

	out.here = { map: character.map, in: character.in, x: Math.round(character.x), y: Math.round(character.y) };

	const names = out.monsters.map(s => `${s.type}${s.count > 1 ? "x" + s.count : ""}`).join(" ");
	game_log(`🔎 Crypt probe: ${out.monsters.length} spawn groups — ${names}`, "#AA88FF");
	game_log(`🔎 keys held: ${out.entry.my_keys.length}, doors in: ${out.entry.doors_into_crypt.length}`, "#AA88FF");

	parent.window.__CRYPT_PROBE__ = out;
	console.log(JSON.stringify(out, null, 1));

	fetch(SINK, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			character: "probe",
			session: "crypt-probe",
			samples: [{ t: Date.now(), kind: "crypt_probe", data: out }]
		})
	}).then(
		() => game_log("✅ Crypt probe pushed to the local sink", "#00FF00"),
		() => game_log("⚠️ Crypt probe: sink not running — start Tools/Error Sink.py", "#FFAA44")
	);

	return out;
})();

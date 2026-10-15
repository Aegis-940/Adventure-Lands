// --------------------------------------------------------------------------------------------------------------------------------- //
// SKILL RUNNER — one pass over a role's skill table: each entry gated, asked and cast in order, and caught on its own
// --------------------------------------------------------------------------------------------------------------------------------- //

async function run_skills(table, context) {
	let paused = null;
	for (const skill of table) {
		if (skill.gate === "combat") {
			if (paused === null) paused = should_pause_combat_loop();
			if (paused) continue;
		}
		try {
			if (skill.wanted && !skill.wanted(context)) continue;
			const value = skill.value && skill.value(context);
			const before = parent.next_skill[skill.name];
			await skill.cast(context);
			if (skill.value && parent.next_skill[skill.name] !== before) record_cast_value(skill.name, value);
		} catch (e) {
			catcher(e, skill.name);
		}
	}
}

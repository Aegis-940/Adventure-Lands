// --------------------------------------------------------------------------------------------------------------------------------- //
// DUNGEON ESCAPE — scare the pursuit off, walk away, and town back to the instance entrance
// --------------------------------------------------------------------------------------------------------------------------------- //

const DUNGEON_TOWN_CHANNEL_MS = 3000;
const DUNGEON_BAIL_TIMEOUT_MS = 30000;
const DUNGEON_BAIL_STEP = 60;
const DUNGEON_BAIL_POLL_MS = 250;
const DUNGEON_SPAWN_ARRIVED = 120;

let _dungeon_bailing = false;

function dungeon_bailing() {
	return _dungeon_bailing;
}

function dungeon_threats() {
	const d = active_dungeon();
	const out = [];
	for (const id in parent.entities) {
		const e = parent.entities[id];
		if (e.type !== "monster" || e.dead) continue;
		const on_us = e.target && DUNGEON_PARTY.includes(e.target);
		const avoided = d && d.avoid && d.avoid.includes(e.mtype);
		if (on_us || avoided) out.push(e);
	}
	return out;
}

function dungeon_step_away() {
	const threats = dungeon_threats();
	if (!threats.length) return;

	let sx = 0;
	let sy = 0;
	for (const t of threats) {
		const dx = character.x - t.x;
		const dy = character.y - t.y;
		const m = Math.hypot(dx, dy) || 1;
		sx += dx / m;
		sy += dy / m;
	}

	const m = Math.hypot(sx, sy) || 1;
	const x = character.x + (sx / m) * DUNGEON_BAIL_STEP;
	const y = character.y + (sy / m) * DUNGEON_BAIL_STEP;
	if (can_move_to(x, y)) move(x, y);
}

async function dungeon_scare_off() {
	try {
		if (!is_set_equipped("panic")) {
			await equip_apply(panic_equip_hold(), "panic");
			await wait_until_equipped("panic");
		}
	} catch (e) {
		log(`[BAIL] could not equip jacko: ${fmt_err(e)}`, "#ff4444", "Errors");
	}

	try {
		if (!is_on_cooldown("scare") && can_use("scare")) {
			log("[BAIL] Scare", "#ffcc00", "Alerts");
			await use_skill("scare");
			await delay(200);
			return true;
		}
	} catch (e) {
		log(`[BAIL] scare failed: ${fmt_err(e)}`, "#ff4444", "Errors");
	}
	return false;
}

function dungeon_at_spawn(dungeon) {
	const spawn = dungeon.spawn || { x: 0, y: 0 };
	return Math.hypot(character.x - spawn.x, character.y - spawn.y) <= DUNGEON_SPAWN_ARRIVED;
}

async function dungeon_bail_out(reason, broadcast = true, emergency = true) {
	if (_dungeon_bailing) return;
	const d = active_dungeon();
	if (!d) return;

	_dungeon_bailing = true;
	try {
		log(emergency ? `🚨 ${d.name}: bailing out — ${reason}` : `${d.name}: towning back — ${reason}`,
			emergency ? "#FF3333" : DUNGEON_LOG_COLOR, "Alerts");
		dungeon_telemetry_event("bail_start", { reason, emergency, threats: dungeon_threats().map(e => e.mtype).join(",") });
		if (broadcast) {
			send_cm(DUNGEON_PARTY.filter(n => n !== character.name), { type: "dungeon_bail", reason });
		}

		stop_movement("dungeon bail-out");
		await dungeon_scare_off();

		const until = Date.now() + DUNGEON_BAIL_TIMEOUT_MS;
		while (Date.now() < until) {
			if (character.map !== d.map) break;
			if (dungeon_at_spawn(d)) break;
			if (character.rip) break;

			if (!character.c?.town) {
				if (dungeon_threats().length) await dungeon_scare_off();
				try { use_skill("use_town"); } catch (e) { }
			}

			dungeon_step_away();
			await delay(DUNGEON_BAIL_POLL_MS);
		}

		const landed = dungeon_at_spawn(d) || character.map !== d.map;
		log(landed
			? `${d.name}: back at the entrance`
			: `${d.name}: bail-out did not land — still out there`,
			landed ? "#00FF00" : "#FF3333", "Alerts");
		dungeon_telemetry_event("bail_end", { landed });
		return landed;

	} catch (e) {
		catcher(e, "dungeon_bail_out");
		return false;
	} finally {
		_dungeon_bailing = false;
		if (typeof panicking === "undefined" || !panicking) panic_equip_free();
	}
}

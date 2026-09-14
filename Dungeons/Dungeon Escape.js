// --------------------------------------------------------------------------------------------------------------------------------- //
// DUNGEON ESCAPE — scare the pursuit off, walk away, and town back to the instance entrance
// --------------------------------------------------------------------------------------------------------------------------------- //

const DUNGEON_TOWN_CHANNEL_MS = 3000;
const DUNGEON_BAIL_POLL_MS = 250;
const DUNGEON_SPAWN_ARRIVED = 120;
const DUNGEON_THREAT_RADIUS = 400;
const DUNGEON_BAIL_TIMEOUT_MS = 90000;

let _dungeon_bailing = false;
let _dungeon_bail_count = 0;

function dungeon_bailing() {
	return _dungeon_bailing;
}

function dungeon_bail_count() {
	return _dungeon_bail_count;
}

function reset_dungeon_bails() {
	_dungeon_bail_count = 0;
}

function dungeon_threats(radius = DUNGEON_THREAT_RADIUS) {
	const d = active_dungeon();
	const out = [];
	for (const id in parent.entities) {
		const e = parent.entities[id];
		if (e.type !== "monster" || e.dead) continue;
		if (Math.hypot(character.x - e.x, character.y - e.y) > radius) continue;
		const on_us = e.target && DUNGEON_PARTY.includes(e.target);
		const avoided = d && d.avoid && d.avoid.includes(e.mtype);
		if (on_us || avoided) out.push(e);
	}
	return out;
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

function dungeon_aggressed() {
	for (const id in parent.entities) {
		const e = parent.entities[id];
		if (e.type !== "monster" || e.dead) continue;
		if (e.target !== character.name) continue;
		if (Math.hypot(character.x - e.x, character.y - e.y) > DUNGEON_THREAT_RADIUS) continue;
		return true;
	}
	return false;
}

function dungeon_channelling() {
	return !!(character.c && character.c.town);
}

async function dungeon_bail_out(reason, broadcast = true, emergency = true) {
	if (_dungeon_bailing) return;
	const d = active_dungeon();
	if (!d) return;

	_dungeon_bailing = true;
	if (emergency) _dungeon_bail_count++;
	try {
		log(emergency ? `🚨 ${d.name}: bailing out — ${reason}` : `${d.name}: towning back — ${reason}`,
			emergency ? "#FF3333" : DUNGEON_LOG_COLOR, "Alerts");
		dungeon_telemetry_event("bail_start", {
			reason,
			emergency,
			bails: _dungeon_bail_count,
			threats: dungeon_threats().map(e => e.mtype).join(","),
		});
		if (broadcast) {
			send_cm(DUNGEON_PARTY.filter(n => n !== character.name), { type: "dungeon_bail", reason });
		}

		stop_movement("dungeon bail-out");
		await dungeon_scare_off();

		const door = { map: d.map, x: (d.spawn || {}).x || 0, y: (d.spawn || {}).y || 0 };
		const until = Date.now() + DUNGEON_BAIL_TIMEOUT_MS;
		let walking = null;

		while (Date.now() < until) {
			if (character.map !== d.map) break;
			if (dungeon_at_spawn(d)) break;
			if (character.rip) break;

			if (dungeon_aggressed()) await dungeon_scare_off();

			if (!walking) {
				walking = dungeon_travel(door).then(() => { walking = null; }, () => { walking = null; });
			}

			if (!dungeon_channelling()) {
				try { await use_skill("use_town"); } catch (e) { }
			}

			await delay(DUNGEON_BAIL_POLL_MS);
		}

		if (walking) stop_movement("dungeon bail-out: done");

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

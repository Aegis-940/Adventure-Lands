// --------------------------------------------------------------------------------------------------------------------------------- //
// MERCHANT PARTY — mluck, party membership, and the delivery run out to the fighters
// --------------------------------------------------------------------------------------------------------------------------------- //

var MLUCK_REFRESH_THRESHOLD_MS = 10 * 60 * 1000;
var MLUCK_TOPUP_THRESHOLD_MS = 50 * 60 * 1000;
var MLUCK_TAKEOVER_COOLDOWN_MS = 60 * 1000;

var _mluck_takeover_at = {};

function is_mluck_due(status) {
	return status.mluck_until - Date.now() < MLUCK_REFRESH_THRESHOLD_MS;
}

function mluck_wanted(player) {
	const mluck = player.s.mluck;
	if (!mluck) return true;
	if (mluck.f === character.name) return mluck.ms < MLUCK_TOPUP_THRESHOLD_MS;
	if (mluck.strong) return false;
	return Date.now() - (_mluck_takeover_at[player.name] || 0) >= MLUCK_TAKEOVER_COOLDOWN_MS;
}

function players_wanting_mluck() {
	return Object.values(parent.entities).filter(e =>
		e.type === "character" && !e.npc && !e.rip &&
		is_in_range(e, "mluck") &&
		mluck_wanted(e)
	);
}

function any_party_within_range(range = CONFIG.party.nearby_trigger_range) {
	for (const name of PARTY) {
		const player = get_player(name);
		if (
			player &&
			!player.rip &&
			Math.hypot(character.x - player.x, character.y - player.y) <= range
		) {
			return true;
		}
	}
	return false;
}

async function buff_nearby_players() {
	const buffed = [];
	for (const player of players_wanting_mluck()) {
		if (character.mp < G.skills.mluck.mp) break;
		try {
			if (player.s.mluck && player.s.mluck.f !== character.name) _mluck_takeover_at[player.name] = Date.now();
			use_skill("mluck", player);
			buffed.push(player.name);
		} catch (e) {
			catcher(e, "buff_nearby_players: " + player.name);
		}
		await sleep(200);
	}
	if (buffed.length) log_msg("info", `Cast MLuck on ${buffed.join(", ")}.`);
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// DELIVERY — go to whoever needs mluck, a pack emptied, or gold taken off them
// --------------------------------------------------------------------------------------------------------------------------------- //

var DELIVERY_WAIT_MAX_ATTEMPTS = 40;
var HANDOFF_WAIT_MS = 15000;

var _delivery_requested = false;

function request_delivery(reason) {
	if (_delivery_requested) return;
	_delivery_requested = true;
	log_msg("event", `📦 Pickup requested — ${reason}`);
}

function clear_delivery_request() {
	_delivery_requested = false;
}

function delivery_wanted(status) {
	return is_mluck_due(status)
		|| (status.free_slots <= CONFIG.delivery.free_slots_threshold && status.loose_slots > 0)
		|| status.gold - LOOT_GOLD_RESERVE >= CONFIG.delivery.gold_threshold;
}

function delivery_alive(name) {
	const status = party_state(name);
	return !!status && !status.rip;
}

function should_run_delivery() {
	if (merchant_task !== "Idle") return false;
	if (_delivery_requested) return true;
	return PARTY.some(name => delivery_alive(name) && delivery_wanted(party_state(name)));
}

function delivery_target() {
	const alive = PARTY.filter(delivery_alive);
	return alive.find(name => delivery_wanted(party_state(name))) || alive[0] || null;
}

function member_within_range(name, range = CONFIG.party.nearby_trigger_range) {
	const player = get_player(name);
	return !!player && !player.rip && Math.hypot(character.x - player.x, character.y - player.y) <= range;
}

function handoff_pending() {
	return PARTY.some(name => member_within_range(name) && party_state(name).ship_slots > 0);
}

async function wait_for_handoff() {
	if (await wait_until(() => !character.esize || !handoff_pending(), HANDOFF_WAIT_MS, 250)) return;
	log_msg("warn", `Hand-off still going after ${HANDOFF_WAIT_MS / 1000}s — leaving anyway.`);
}

function handle_delivering_state() {
	return run_task("Delivering", async () => {
		try {
			const name = delivery_target();
			log_msg("info", `Beginning delivery run${name ? " to " + name : ""}...`);

			const RETARGET_THRESHOLD = 160;
			let last_target = null;

			let attempts = 0;
			while (name && delivery_alive(name) && !member_within_range(name) && attempts < DELIVERY_WAIT_MAX_ATTEMPTS) {
				const status = party_state(name);
				const moved_enough = !last_target
					|| last_target.map !== status.map
					|| Math.hypot(status.x - last_target.x, status.y - last_target.y) > RETARGET_THRESHOLD;

				if (moved_enough) {
					log_msg("debug", `🎯 Delivery: heading to ${name} @ ${status.map} (${Math.round(status.x)}, ${Math.round(status.y)})`);

					smarter_move({ map: status.map, x: status.x, y: status.y })
						.catch(e => {
							if (e?.reason !== "interrupted") catcher(e, "handle_delivering_state: smarter_move to " + name);
						});
					last_target = { map: status.map, x: status.x, y: status.y };
				}

				await sleep(3000);
				attempts++;
			}
			if (attempts >= DELIVERY_WAIT_MAX_ATTEMPTS) {
				log_msg("warn", "No party member came within range — heading home anyway.");
			}

			await buff_nearby_players();
			await wait_for_handoff();
			await sell_items();
			await bank_items();
		} finally {
			clear_delivery_request();
		}
	});
}

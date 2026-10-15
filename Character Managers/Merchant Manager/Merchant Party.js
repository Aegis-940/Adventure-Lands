// --------------------------------------------------------------------------------------------------------------------------------- //
// MERCHANT PARTY — mluck, party membership, and the delivery run out to the fighters
// --------------------------------------------------------------------------------------------------------------------------------- //

var MLUCK_REFRESH_THRESHOLD_MS = 10 * 60 * 1000;
var MLUCK_TOPUP_THRESHOLD_MS = 50 * 60 * 1000;
var MLUCK_TAKEOVER_COOLDOWN_MS = 60 * 1000;

var _mluck_takeover_at = {};

function is_mluck_due(status) {
	const remaining = status.conditions?.mluck?.ms;
	return remaining == null || remaining < MLUCK_REFRESH_THRESHOLD_MS;
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
		Math.hypot(character.x - e.x, character.y - e.y) <= G.skills.mluck.range &&
		mluck_wanted(e)
	);
}

function any_party_within_range(range = CONFIG.party.nearby_trigger_range) {
	for (const name of PARTY) {
		const player = get_player(name);
		if (
			player &&
			!player.rip &&
			player.map === character.map &&
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
		await delay(200);
	}
	if (buffed.length) log_msg("info", `Cast MLuck on ${buffed.join(", ")}.`);
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// DELIVERY — go to whoever needs mluck, a pack emptied, or gold taken off them
// --------------------------------------------------------------------------------------------------------------------------------- //

var DELIVERY_WAIT_MAX_ATTEMPTS = 40;

var _delivery_requested = false;

function request_delivery(reason) {
	if (_delivery_requested) return;
	_delivery_requested = true;
	log_msg("event", `📦 Pickup requested — ${reason}`);
}

function clear_delivery_request() {
	_delivery_requested = false;
}

function should_run_delivery() {
	if (merchant_task !== "Idle") return false;
	if (_delivery_requested) return true;
	for (const name of PARTY) {
		const status = read_state_cache(name);
		if (!status || status.rip) continue;
		if (is_mluck_due(status)) return true;
		if (status.free_slots <= CONFIG.delivery.free_slots_threshold && status.loose_slots > 0) return true;
		if (status.gold - LOOT_GOLD_RESERVE >= CONFIG.delivery.gold_threshold) return true;
	}
	return false;
}

async function handle_delivering_state() {
	if (merchant_task !== "Idle") return;
	const generation = begin_task("Delivering");
	try {
		log_msg("info", "Beginning delivery run...");

		const RETARGET_THRESHOLD = 160;
		let last_target = null;

		let attempts = 0;
		while (!any_party_within_range() && attempts < DELIVERY_WAIT_MAX_ATTEMPTS) {
			for (const name of PARTY) {
				const status = read_state_cache(name);
				if (status && !status.rip) {
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
					break;
				}
			}

			await delay(3000);
			attempts++;
		}
		if (attempts >= DELIVERY_WAIT_MAX_ATTEMPTS) {
			log_msg("warn", "No party member came within range — heading home anyway.");
		}

		await buff_nearby_players();
		await sell_items();
		await bank_items();
	} catch (e) {
		catcher(e, "handle_delivering_state");
	} finally {
		clear_delivery_request();
		end_task(generation);
	}
}

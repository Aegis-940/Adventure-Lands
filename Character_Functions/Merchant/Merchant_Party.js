// --------------------------------------------------------------------------------------------------------------------------------- //
// MERCHANT PARTY — mluck, party membership, and the delivery run out to the fighters
// --------------------------------------------------------------------------------------------------------------------------------- //

const MLUCK_REFRESH_THRESHOLD_MS = 10 * 60 * 1000;
const MLUCK_TOPUP_THRESHOLD_MS = 50 * 60 * 1000;

function is_mluck_due(status) {
	const remaining = status.conditions?.mluck?.ms;
	return remaining == null || remaining < MLUCK_REFRESH_THRESHOLD_MS;
}

function mluck_worth_topping_up(status) {
	const remaining = status.conditions?.mluck?.ms;
	return remaining == null || remaining < MLUCK_TOPUP_THRESHOLD_MS;
}

function on_party_request(name) {
	if (PARTY.includes(name)) accept_party_request(name);
}

function on_party_invite(name) {
	if (PARTY.includes(name)) accept_party_invite(name);
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

async function mluck_party_member(player) {
	change_target(player);
	await delay(100);
	use_skill("mluck", player);
	await delay(200);
}

async function buff_nearby_party() {
	let buffed_any = false;
	for (const name of PARTY) {
		const status = read_state_cache(name);
		if (!status || !mluck_worth_topping_up(status)) continue;
		try {
			const mluck_range = (G.skills.mluck && G.skills.mluck.range) || 320;
			const player = get_player(name);
			if (
				!player || player.rip || character.map !== player.map ||
				Math.hypot(character.x - player.x, character.y - player.y) > mluck_range
			) {
				continue;
			}
			await mluck_party_member(player);
			buffed_any = true;
		} catch (e) {
			catcher(e, "buff_nearby_party: " + name);
		}
	}
	if (buffed_any) log("Cast MLuck.", "limegreen");
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// DELIVERY — go to whoever needs mluck, a pack emptied, or gold taken off them
// --------------------------------------------------------------------------------------------------------------------------------- //

const DELIVERY_WAIT_MAX_ATTEMPTS = 40;

function should_run_delivery() {
	if (merchant_task !== "Idle") return false;
	for (const name of PARTY) {
		const status = read_state_cache(name);
		if (!status) continue;
		if (is_mluck_due(status)) return true;
		if (status.free_slots <= CONFIG.delivery.free_slots_threshold) return true;
		if (status.gold >= CONFIG.delivery.gold_threshold) return true;
	}
	return false;
}

async function handle_delivering_state() {
	if (merchant_task !== "Idle") return;
	merchant_task = "Delivering";
	try {
		log("Beginning delivery run...");

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
						log(`🎯 Delivery: heading to ${name} @ ${status.map} (${Math.round(status.x)}, ${Math.round(status.y)})`, "#888");

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
			log("⚠️ No party member came within range — heading home anyway.", "#FFA500");
		}

		await buff_nearby_party();
		await sell_items();
		await bank_items();
	} catch (e) {
		catcher(e, "handle_delivering_state");
	} finally {
		merchant_task = "Idle";
	}
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// MERCHANT GATHERING — fishing and mining share one run; only the tool, skill and spot differ
// --------------------------------------------------------------------------------------------------------------------------------- //

const FISHING_POSITION_TOLERANCE = 5;
const MINING_POSITION_TOLERANCE = 10;
const GATHERING_MAX_COOLDOWN_RETRIES = 15;

async function handle_gathering_state(tool_name, skill_name, spot, tolerance, task_label) {
	if (merchant_task !== "Idle") return;
	merchant_task = task_label;
	const my_generation = merchant_task_generation;
	let cooldown_retries = 0;
	try {
		const tool_available = await ensure_tool_available(tool_name);
		if (!tool_available) {
			log(`❌ No ${tool_name} available (not in inventory, bank, or craftable).`);
			return;
		}

		if (character.map !== spot.map || Math.hypot(character.x - spot.x, character.y - spot.y) > tolerance) {
			await smarter_move(spot, null, { radius: tolerance });
		}

		const tool_equipped = await equip_tool(tool_name);
		if (!tool_equipped) {
			log(`❌ Could not equip ${tool_name} at the ${skill_name} spot.`);
			return;
		}

		while (true) {
			if (my_generation !== merchant_task_generation) {
				log(`⚠️ ${task_label} was force-reset by the watchdog — abandoning this run.`, "#FFA500");
				return;
			}
			if (character.rip) {
				log(`❌ Died while ${skill_name}, stopping.`);
				break;
			}
			if (!character.slots.mainhand || character.slots.mainhand.name !== tool_name) {
				log(`❌ ${tool_name} not equipped, stopping ${skill_name}.`);
				break;
			}
			if (character.map !== spot.map || Math.hypot(character.x - spot.x, character.y - spot.y) > tolerance) {
				log(`❌ Not at ${skill_name} spot, stopping.`);
				break;
			}
			if (character.items.filter(Boolean).length >= character.items.length) {
				log(`📦 Inventory full, stopping ${skill_name}.`);
				break;
			}
			if (is_on_cooldown(skill_name)) {
				log(`✅ ${skill_name} succeeded — on cooldown now, moving on.`, "limegreen");
				break;
			}

			try {
				await use_skill(skill_name);
				cooldown_retries = 0;
			} catch (e) {
				if (e?.reason === "cooldown") {
					if (++cooldown_retries > GATHERING_MAX_COOLDOWN_RETRIES) {
						log(`⚠️ ${skill_name}: use_skill kept reporting cooldown while is_on_cooldown() read false — giving up this run.`, "#FFA500");
						break;
					}
					await delay(2000);
					continue;
				}
				catcher(e, `handle_gathering_state(${skill_name}): use_skill`);
				break;
			}

			await delay(200);
			let channel_wait_ms = 0;
			while (!character.rip && character.c && character.c[skill_name]) {
				await delay(200);
				channel_wait_ms += 200;
				if (channel_wait_ms >= 15000) {
					log(`⚠️ ${skill_name}: still channeling after ${channel_wait_ms / 1000}s per character.c — giving up waiting.`, "#FFA500");
					break;
				}
			}
		}

		try {
			await equip_default_gear();
		} catch (e) {
			catcher(e, `handle_gathering_state(${skill_name}): equip_default_gear`);
		}

		log(`🏁 ${skill_name} loop ended, selling/banking...`, "#888");
		await sell_items();
		await bank_items();
		log(`✅ Selling/banking finished for ${skill_name}.`, "#888");
	} catch (e) {
		catcher(e, `handle_gathering_state(${skill_name})`);
	} finally {
		if (my_generation === merchant_task_generation) {
			try {
				await equip_default_gear();
			} catch (e) {
				catcher(e, `handle_gathering_state(${skill_name}): equip_default_gear`);
			}
			merchant_task = "Idle";
			log(`🔁 ${task_label} cycle finished, back to Idle.`, "#888");
		}
	}
}

function should_run_fishing() {
	return CONFIG.enabled.fishing
		&& merchant_task === "Idle"
		&& has_enough_bank_space()
		&& !is_on_cooldown("fishing");
}

function should_run_mining() {
	return CONFIG.enabled.mining
		&& merchant_task === "Idle"
		&& has_enough_bank_space()
		&& !is_on_cooldown("mining");
}

async function handle_fishing_state() {
	await handle_gathering_state("rod", "fishing", CONFIG.locations.FISHING_SPOT, FISHING_POSITION_TOLERANCE, "Fishing");
}

async function handle_mining_state() {
	await handle_gathering_state("pickaxe", "mining", CONFIG.locations.MINING_SPOT, MINING_POSITION_TOLERANCE, "Mining");
}

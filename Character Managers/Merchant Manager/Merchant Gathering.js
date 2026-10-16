// --------------------------------------------------------------------------------------------------------------------------------- //
// MERCHANT GATHERING — fishing and mining share one run; only the tool, skill and spot differ
// --------------------------------------------------------------------------------------------------------------------------------- //

var FISHING_POSITION_TOLERANCE = 5;
var MINING_POSITION_TOLERANCE = 10;
var GATHERING_MAX_COOLDOWN_RETRIES = 15;

async function handle_gathering_state(tool_name, skill_name, spot, tolerance, task_label) {
	if (merchant_task !== "Idle") return;
	const my_generation = begin_task(task_label);
	let cooldown_retries = 0;
	try {
		const tool_available = await ensure_tool_available(tool_name);
		if (!tool_available) {
			log_msg("error", `No ${tool_name} available (not in inventory, bank, or craftable).`);
			return;
		}

		if (character.map !== spot.map || Math.hypot(character.x - spot.x, character.y - spot.y) > tolerance) {
			await smarter_move(spot, null, { radius: tolerance });
		}

		const tool_equipped = await equip_tool(tool_name);
		if (!tool_equipped) {
			log_msg("error", `Could not equip ${tool_name} at the ${skill_name} spot.`);
			return;
		}

		while (true) {
			if (my_generation !== merchant_task_generation) {
				log_msg("warn", `${task_label} was force-reset by the watchdog — abandoning this run.`);
				return;
			}
			if (character.rip) {
				log_msg("error", `Died while ${skill_name}, stopping.`);
				break;
			}
			if (!character.slots.mainhand || character.slots.mainhand.name !== tool_name) {
				log_msg("error", `${tool_name} not equipped, stopping ${skill_name}.`);
				break;
			}
			if (character.map !== spot.map || Math.hypot(character.x - spot.x, character.y - spot.y) > tolerance) {
				log_msg("error", `Not at ${skill_name} spot, stopping.`);
				break;
			}
			if (character.esize <= 0) {
				log_msg("info", `📦 Inventory full, stopping ${skill_name}.`);
				break;
			}
			if (is_on_cooldown(skill_name)) {
				log_msg("info", `✅ ${skill_name} succeeded — on cooldown now, moving on.`);
				break;
			}

			try {
				await use_skill(skill_name);
				cooldown_retries = 0;
			} catch (e) {
				if (e?.reason === "cooldown") {
					if (++cooldown_retries > GATHERING_MAX_COOLDOWN_RETRIES) {
						log_msg("warn", `${skill_name}: use_skill kept reporting cooldown while is_on_cooldown() read false — giving up this run.`);
						break;
					}
					await sleep(2000);
					continue;
				}
				catcher(e, `handle_gathering_state(${skill_name}): use_skill`);
				break;
			}

			await sleep(200);
			if (!await wait_until(() => character.rip || !character.c[skill_name], 15000, 200)) {
				log_msg("warn", `${skill_name}: still channeling after 15s per character.c — giving up waiting.`);
			}
		}

		try {
			await equip_default_gear();
		} catch (e) {
			catcher(e, `handle_gathering_state(${skill_name}): equip_default_gear`);
		}

		log_msg("debug", `🏁 ${skill_name} loop ended, selling/banking...`);
		await sell_items();
		await bank_items();
		log_msg("debug", `✅ Selling/banking finished for ${skill_name}.`);
	} catch (e) {
		catcher(e, `handle_gathering_state(${skill_name})`);
	} finally {
		if (my_generation === merchant_task_generation) {
			try {
				await equip_default_gear();
			} catch (e) {
				catcher(e, `handle_gathering_state(${skill_name}): equip_default_gear`);
			}
			set_task("Idle");
			log_msg("debug", `🔁 ${task_label} cycle finished, back to Idle.`);
		}
	}
}

function should_run_fishing() {
	return setting("merchant_fishing")
		&& merchant_task === "Idle"
		&& has_enough_bank_space()
		&& !is_on_cooldown("fishing");
}

function should_run_mining() {
	return setting("merchant_mining")
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

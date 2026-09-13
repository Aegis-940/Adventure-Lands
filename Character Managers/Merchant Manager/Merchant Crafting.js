// --------------------------------------------------------------------------------------------------------------------------------- //
// MERCHANT CRAFTING — recipe accounting, ingredient gathering and batch crafting
// --------------------------------------------------------------------------------------------------------------------------------- //

function can_afford_any_craft() {
	for (const target of CONFIG.crafting.targets) {
		if (max_craftable_now(target) >= (target.min ?? 1)) return true;
	}
	return false;
}

var CRAFT_LOCATION = { map: "main", x: 0, y: 492 };
var CRAFT_POSITION_TOLERANCE = 5;

var CRAFT_INTERVAL = 300;

function bank_quantity_for(item_name, level) {
	const bank_data = character.bank || load_bank_from_local_storage();
	if (!bank_data) return 0;

	let qty = 0;
	for (const pack in bank_data) {
		if (!Array.isArray(bank_data[pack])) continue;
		for (const it of bank_data[pack]) {
			if (it && it.name === item_name && (level == null || (it.level || 0) === level)) {
				qty += it.q || 1;
			}
		}
	}
	return qty;
}

function craft_recipe_items(craft_def) {
	return craft_def.items.map(([item_quantity, item_name]) => {
		const item = parent.G.items[item_name];
		return { name: item_name, quantity: item_quantity, level: item.scroll === true ? 0 : null };
	});
}

function find_recipe_slots(req) {
	const picks = [];
	let remaining = req.quantity;
	for (let i = 0; i < character.items.length && remaining > 0; i++) {
		const item = character.items[i];
		if (!item || item.name !== req.name || (req.level != null && item.level !== req.level)) continue;
		const take = Math.min(item.q || 1, remaining);
		for (let k = 0; k < take; k++) picks.push(i);
		remaining -= take;
	}
	return remaining > 0 ? null : picks;
}

function max_craftable_by_space(item_name) {
	const free_slots = character.items.filter(it => !it).length;
	const usable_free_slots = Math.max(0, free_slots - CONFIG.min_free_inventory_slots);

	const stack_size = parent.G.items[item_name]?.s;
	if (!stack_size || stack_size <= 1) {
		return usable_free_slots;
	}

	let room_in_existing_stacks = 0;
	for (const it of character.items) {
		if (it && it.name === item_name) {
			room_in_existing_stacks += Math.max(0, stack_size - (it.q || 1));
		}
	}

	return room_in_existing_stacks + usable_free_slots * stack_size;
}

function total_held(name, level) {
	let have = bank_quantity_for(name, level);
	for (const item of character.items) {
		if (item && item.name === name && (level == null || item.level === level)) {
			have += item.q || 1;
		}
	}
	return have;
}

function max_craftable_by_ingredients(craft_def) {
	const basics = parent.G.npcs["basics"];
	let max_count = Infinity;
	for (const req of craft_recipe_items(craft_def)) {
		if (basics.items.includes(req.name)) continue;
		max_count = Math.min(max_count, Math.floor(total_held(req.name, req.level) / req.quantity));
	}
	return max_count;
}

function craft_cost_for_count(craft_def, count) {
	const basics = parent.G.npcs["basics"];
	let cost = craft_def.cost;
	for (const req of craft_recipe_items(craft_def)) {
		if (!basics.items.includes(req.name)) continue;
		const item_def = parent.G.items[req.name];
		const to_buy = Math.max(0, req.quantity * count - total_held(req.name, req.level));
		cost += (item_def.g || 0) * to_buy;
	}
	return cost;
}

function max_affordable_count(craft_def, upper_bound) {
	if (upper_bound <= 0) return 0;
	if (craft_cost_for_count(craft_def, upper_bound) <= character.gold) return upper_bound;
	let lo = 0;
	let hi = upper_bound;
	while (lo < hi) {
		const mid = Math.ceil((lo + hi) / 2);
		if (craft_cost_for_count(craft_def, mid) <= character.gold) lo = mid;
		else hi = mid - 1;
	}
	return lo;
}

function max_craftable_now(target) {
	const craft_def = parent.G.craft[target.name];
	if (!craft_def) return 0;

	const count = Math.min(
		target.max ?? Infinity,
		max_craftable_by_space(target.name),
		max_craftable_by_ingredients(craft_def)
	);
	if (count <= 0) return 0;

	return max_affordable_count(craft_def, count);
}

function compute_missing_ingredients(craft_def, count) {
	const missing = [];
	for (const req of craft_recipe_items(craft_def)) {
		const needed = req.quantity * count;
		let have = 0;
		for (const item of character.items) {
			if (item && item.name === req.name && (req.level == null || item.level === req.level)) {
				have += item.q || 1;
			}
		}
		if (have < needed) {
			missing.push({ name: req.name, level: req.level, amount: needed - have });
		}
	}
	return missing;
}

var GATHER_MAX_ROUNDS = 10;

async function gather_ingredients_for_batch(craft_def, count) {
	for (let round = 0; round < GATHER_MAX_ROUNDS; round++) {
		const missing = compute_missing_ingredients(craft_def, count);
		if (missing.length === 0) return true;

		let made_progress = false;

		for (const need of missing) {
			if (bank_quantity_for(need.name, need.level) > 0) {
				try {
					await withdraw_item(need.name, need.level, need.amount);
				} catch (e) {
					catcher(e, "gather_ingredients_for_batch: withdraw " + need.name);
				}
				made_progress = true;
				continue;
			}

			const basics = parent.G.npcs["basics"];
			if (!basics.items.includes(need.name)) {
				game_log(`❌ Missing ${need.amount}x ${need.name} for crafting — not in bank, not buyable.`);
				return false;
			}

			const item_def = parent.G.items[need.name];
			const cost = (item_def.g || 0) * need.amount;
			if (character.gold < cost) {
				game_log(`❌ Not enough gold to buy ${need.amount}x ${need.name} for crafting.`);
				return false;
			}

			try {
				await smart_move("basics");
			} catch (e) {
				catcher(e, "gather_ingredients_for_batch: travel to basics NPC");
				return false;
			}
			buy(need.name, need.amount);
			await delay(300);
			made_progress = true;
		}

		if (!made_progress) return false;
	}

	return compute_missing_ingredients(craft_def, count).length === 0;
}

function recipe_slot_array(recipe) {
	let craft_slots = [];
	for (const req of recipe) {
		const slots = find_recipe_slots(req);
		if (!slots) return null;
		craft_slots = craft_slots.concat(slots);
	}
	const craft_array = craft_slots.slice(0, 9);
	while (craft_array.length < 9) craft_array.push(null);
	return craft_array;
}

async function craft_batch(craft_name, count) {
	const craft_def = parent.G.craft[craft_name];
	if (craft_def == null) return 0;

	const gathered = await gather_ingredients_for_batch(craft_def, count);
	if (!gathered) return 0;

	if (
		character.map !== CRAFT_LOCATION.map ||
		Math.hypot(character.x - CRAFT_LOCATION.x, character.y - CRAFT_LOCATION.y) > CRAFT_POSITION_TOLERANCE
	) {
		try {
			await smarter_move(CRAFT_LOCATION, null, { radius: CRAFT_POSITION_TOLERANCE });
		} catch (e) {
			catcher(e, "craft_batch: travel to craft location");
			return 0;
		}
	}

	const recipe = craft_recipe_items(craft_def);
	let crafted = 0;

	while (crafted < count) {
		const craft_array = recipe_slot_array(recipe);
		if (!craft_array) break;

		try {
			await craft(...craft_array);
		} catch (e) {
			catcher(e, "craft_batch: craft " + craft_name);
			break;
		}
		crafted++;
		await delay(CRAFT_INTERVAL);
	}

	return crafted;
}

async function craft_item(craft_name) {
	const craft_def = parent.G.craft[craft_name];
	if (craft_def == null) return "no_recipe";

	let cost = craft_def.cost;

	if (cost > character.gold) return "missing";

	let missing = 0;
	let craft_slots = [];
	let buyable_missing = [];

	for (const req of craft_recipe_items(craft_def)) {
		const recipe_slots = find_recipe_slots(req);

		if (recipe_slots) {
			craft_slots = craft_slots.concat(recipe_slots);
			continue;
		}

		if (bank_quantity_for(req.name, req.level) > 0) {
			try {
				await withdraw_item(req.name, req.level, req.quantity);
			} catch (e) {
				catcher(e, "craft_item: withdraw " + req.name);
			}
			return "withdrawing";
		}

		missing++;

		const basics = parent.G.npcs["basics"];

		if (basics.items.includes(req.name)) {
			cost += parent.G.items[req.name].g;

			if (cost <= character.gold) {
				buyable_missing.push(req.name);
			} else {
				buyable_missing = [];
				break;
			}
		}
	}

	if (missing === 0) {
		if (
			character.map !== CRAFT_LOCATION.map ||
			Math.hypot(character.x - CRAFT_LOCATION.x, character.y - CRAFT_LOCATION.y) > CRAFT_POSITION_TOLERANCE
		) {
			try {
				await smarter_move(CRAFT_LOCATION, null, { radius: CRAFT_POSITION_TOLERANCE });
			} catch (e) {
				catcher(e, "craft_item: travel to craft location");
				return "missing";
			}
		}

		const craft_array = craft_slots.slice(0, 9);
		while (craft_array.length < 9) craft_array.push(null);

		try {
			await craft(...craft_array);
		} catch (e) {
			catcher(e, "craft_item: craft " + craft_name);
			return "missing";
		}
		return "crafted";
	}

	if (buyable_missing.length === missing && buyable_missing.length) {
		try {
			await smart_move("basics");
		} catch (e) {
			catcher(e, "craft_item: travel to basics NPC");
			return "missing";
		}
		buy(buyable_missing[0]);
		return "buying";
	}

	return "missing";
}

var CRAFT_MAX_BATCHES = 50;
var CRAFT_RETRY_MS = 10 * 60 * 1000;
var _craft_retry_at = 0;

function craft_run_blocked() {
	return Date.now() < _craft_retry_at;
}

async function try_craft() {
	let any_crafted = false;
	for (const target of CONFIG.crafting.targets) {
		const craft_def = parent.G.craft[target.name];
		if (craft_def == null) continue;

		const desired_count = max_craftable_now(target);
		if (desired_count < (target.min ?? 1)) continue;

		const target_max = target.max ?? Infinity;
		let total_crafted = 0;

		for (let batch = 0; batch < CRAFT_MAX_BATCHES && total_crafted < target_max; batch++) {
			const remaining = target_max - total_crafted;
			const batch_size = Math.min(max_craftable_now(target), remaining);
			if (batch_size <= 0) break;

			const crafted = await craft_batch(target.name, batch_size);
			total_crafted += crafted;
			if (crafted <= 0) break;
			any_crafted = true;

			game_log(`✅ Crafted ${crafted}x ${target.name} (${total_crafted}${target_max === Infinity ? "" : "/" + target_max} this run).`);

			if (total_crafted >= target_max) break;

			await sell_items();
			await bank_items();
		}

		await sell_items();
		await bank_items();
		break;
	}

	if (!any_crafted) {
		_craft_retry_at = Date.now() + CRAFT_RETRY_MS;
		game_log(`⚠️ Craft run made no progress — not retrying for ${CRAFT_RETRY_MS / 60000} min.`, "#FFA500");
	}
}

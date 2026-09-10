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
	var bank_data = character.bank || load_bank_from_local_storage();
	if (!bank_data) return 0;

	var qty = 0;
	for (var pack in bank_data) {
		if (!Array.isArray(bank_data[pack])) continue;
		for (var slot = 0; slot < bank_data[pack].length; slot++) {
			var it = bank_data[pack][slot];
			if (it && it.name === item_name && (level == null || (it.level || 0) === level)) {
				qty += it.q || 1;
			}
		}
	}
	return qty;
}

function craft_recipe_items(craft_def) {
	return craft_def.items.map(function(item_def) {
		var item_quantity = item_def[0];
		var item_name = item_def[1];
		var item = parent.G.items[item_name];
		return { name: item_name, quantity: item_quantity, level: item.scroll === true ? 0 : null };
	});
}

function find_recipe_slots(req) {
	var picks = [];
	var remaining = req.quantity;
	for (var i = 0; i < character.items.length && remaining > 0; i++) {
		var item = character.items[i];
		if (!item || item.name !== req.name || (req.level != null && item.level !== req.level)) continue;
		var take = Math.min(item.q || 1, remaining);
		for (var k = 0; k < take; k++) picks.push(i);
		remaining -= take;
	}
	return remaining > 0 ? null : picks;
}

function max_craftable_by_space(item_name) {
	var free_slots = character.items.filter(function(it) { return !it; }).length;
	var usable_free_slots = Math.max(0, free_slots - 3);

	var stack_size = parent.G.items[item_name]?.s;
	if (!stack_size || stack_size <= 1) {
		return usable_free_slots;
	}

	var room_in_existing_stacks = 0;
	character.items.forEach(function(it) {
		if (it && it.name === item_name) {
			room_in_existing_stacks += Math.max(0, stack_size - (it.q || 1));
		}
	});

	return room_in_existing_stacks + usable_free_slots * stack_size;
}

function total_held(name, level) {
	var have = bank_quantity_for(name, level);
	character.items.forEach(function(item) {
		if (item && item.name === name && (level == null || item.level === level)) {
			have += item.q || 1;
		}
	});
	return have;
}

function max_craftable_by_ingredients(craft_def) {
	var basics = parent.G.npcs["basics"];
	var max_count = Infinity;
	craft_recipe_items(craft_def).forEach(function(req) {
		if (basics.items.includes(req.name)) return;
		max_count = Math.min(max_count, Math.floor(total_held(req.name, req.level) / req.quantity));
	});
	return max_count;
}

function craft_cost_for_count(craft_def, count) {
	var basics = parent.G.npcs["basics"];
	var cost = craft_def.cost;
	craft_recipe_items(craft_def).forEach(function(req) {
		if (!basics.items.includes(req.name)) return;
		var item_def = parent.G.items[req.name];
		var to_buy = Math.max(0, req.quantity * count - total_held(req.name, req.level));
		cost += (item_def.g || 0) * to_buy;
	});
	return cost;
}

function max_affordable_count(craft_def, upper_bound) {
	if (upper_bound <= 0) return 0;
	if (craft_cost_for_count(craft_def, upper_bound) <= character.gold) return upper_bound;
	var lo = 0, hi = upper_bound;
	while (lo < hi) {
		var mid = Math.ceil((lo + hi) / 2);
		if (craft_cost_for_count(craft_def, mid) <= character.gold) lo = mid;
		else hi = mid - 1;
	}
	return lo;
}

function max_craftable_now(target) {
	var craft_def = parent.G.craft[target.name];
	if (!craft_def) return 0;

	var count = Math.min(
		target.max ?? Infinity,
		max_craftable_by_space(target.name),
		max_craftable_by_ingredients(craft_def)
	);
	if (count <= 0) return 0;

	return max_affordable_count(craft_def, count);
}

function compute_missing_ingredients(craft_def, count) {
	var missing = [];
	craft_recipe_items(craft_def).forEach(function(req) {
		var needed = req.quantity * count;
		var have = 0;
		character.items.forEach(function(item) {
			if (item && item.name === req.name && (req.level == null || item.level === req.level)) {
				have += item.q || 1;
			}
		});
		if (have < needed) {
			missing.push({ name: req.name, level: req.level, amount: needed - have });
		}
	});
	return missing;
}

async function gather_ingredients_for_batch(craft_def, count) {
	var MAX_ROUNDS = 10;

	for (var round = 0; round < MAX_ROUNDS; round++) {
		var missing = compute_missing_ingredients(craft_def, count);
		if (missing.length === 0) return true;

		var made_progress = false;

		for (var i = 0; i < missing.length; i++) {
			var need = missing[i];

			if (bank_quantity_for(need.name, need.level) > 0) {
				try {
					await withdraw_item(need.name, need.level, need.amount);
				} catch (e) {
					catcher(e, "gather_ingredients_for_batch: withdraw " + need.name);
				}
				made_progress = true;
				continue;
			}

			var basics = parent.G.npcs["basics"];
			if (!basics.items.includes(need.name)) {
				game_log(`❌ Missing ${need.amount}x ${need.name} for crafting — not in bank, not buyable.`);
				return false;
			}

			var item_def = parent.G.items[need.name];
			var cost = (item_def.g || 0) * need.amount;
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

async function craft_batch(craft_name, count) {
	var craft_def = parent.G.craft[craft_name];
	if (craft_def == null) return 0;

	var gathered = await gather_ingredients_for_batch(craft_def, count);
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

	var recipe = craft_recipe_items(craft_def);
	var crafted = 0;

	while (crafted < count) {
		var craft_slots = [];
		var ok = true;
		for (var i = 0; i < recipe.length; i++) {
			var slots = find_recipe_slots(recipe[i]);
			if (!slots) { ok = false; break; }
			craft_slots = craft_slots.concat(slots);
		}
		if (!ok) break;

		var craft_array = craft_slots.slice(0, 9);
		while (craft_array.length < 9) {
			craft_array.push(null);
		}

		try {
			craft.apply(null, craft_array);
			await delay(10);
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
	var craft_def = parent.G.craft[craft_name];
	if (craft_def == null) return "no_recipe";

	var cost = craft_def.cost;

	if (cost > character.gold) return "missing";

	var missing = 0;
	var craft_slots = [];
	var buyable_missing = [];

	for (var item_index in craft_def.items) {
		var item_def = craft_def.items[item_index];
		var item_name = item_def[1];
		var item_quantity = item_def[0];
		var item = parent.G.items[item_name];

		var level = null;
		if (item.scroll == true) {
			level = 0;
		}

		var recipe_slots = find_recipe_slots({ name: item_name, quantity: item_quantity, level: level });

		if (recipe_slots) {
			craft_slots = craft_slots.concat(recipe_slots);
			continue;
		}

		if (bank_quantity_for(item_name, level) > 0) {
			try {
				await withdraw_item(item_name, level, item_quantity);
			} catch (e) {
				catcher(e, "craft_item: withdraw " + item_name);
			}
			return "withdrawing";
		}

		missing++;

		var basics = parent.G.npcs["basics"];

		if (basics.items.includes(item_name)) {
			cost += item.g;

			if (cost <= character.gold) {
				buyable_missing.push(item_name);
			} else {
				buyable_missing = [];
				break;
			}
		}
	}

	if (missing == 0) {
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

		var craft_array = craft_slots.slice(0, 9);
		while (craft_array.length < 9) {
			craft_array.push(null);
		}

		craft.apply(null, craft_array);
		return "crafted";
	}

	if (buyable_missing.length == missing) {
		for (var id_buy in buyable_missing) {
			var buy_name = buyable_missing[id_buy];

			try {
				await smart_move("basics");
			} catch (e) {
				catcher(e, "craft_item: travel to basics NPC");
				return "missing";
			}

			buy(buy_name);
			return "buying";
		}
	}

	return "missing";
}

var CRAFT_MAX_BATCHES = 50;

async function try_craft() {
	for (var t = 0; t < CONFIG.crafting.targets.length; t++) {
		var target = CONFIG.crafting.targets[t];
		var craft_def = parent.G.craft[target.name];
		if (craft_def == null) continue;

		var desired_count = max_craftable_now(target);
		if (desired_count < (target.min ?? 1)) continue;

		var target_max = target.max ?? Infinity;
		var total_crafted = 0;

		for (var batch = 0; batch < CRAFT_MAX_BATCHES && total_crafted < target_max; batch++) {
			var remaining = target_max - total_crafted;
			var batch_size = Math.min(max_craftable_now(target), remaining);
			if (batch_size <= 0) break;

			var crafted = await craft_batch(target.name, batch_size);
			total_crafted += crafted;
			if (crafted <= 0) break;

			game_log(`✅ Crafted ${crafted}x ${target.name} (${total_crafted}${target_max === Infinity ? "" : "/" + target_max} this run).`);

			if (total_crafted >= target_max) break;

			await sell_items();
			await bank_items();
		}

		await sell_items();
		await bank_items();
		break;
	}
}

function scan_inventory_for_item_index(name, max_level) {
	for (var i = 0; i <= 41; i++) {
		var cur_slot = character.items[i];
		if (cur_slot != null && cur_slot.name == name) {
			if (max_level == null || cur_slot.level <= max_level) {
				return i;
			}
		}
	}
}

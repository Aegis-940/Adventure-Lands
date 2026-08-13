// Craft targets live in Character_Functions/Merchant_Functions.js's CONFIG.crafting.targets;
// the merchant state machine calls try_craft() on its own CRAFTING-state cycle.

// Used by should_run_craft() to check if crafting is worth attempting — a target only
// counts if max_craftable_now() reaches at least its configured min.
function can_afford_any_craft() {
	for (const target of CONFIG.crafting.targets) {
		if (max_craftable_now(target) >= (target.min ?? 1)) return true;
	}
	return false;
}

// Crafting can only be done standing at the crafting bench.
var CRAFT_LOCATION = { map: "main", x: 0, y: 492 };
var CRAFT_POSITION_TOLERANCE = 5;

// Local constant, not Auto_Upgrade.js's UPGRADE_INTERVAL — must stay separate, a sibling eval closure can't see that file's const.
var CRAFT_INTERVAL = 300;

// Bank quantity of an item at a given level (null = any level), checked before buying.
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

// Normalizes a craft recipe's [quantity, item_name] entries into {name, quantity, level}.
function craft_recipe_items(craft_def) {
	return craft_def.items.map(function(item_def) {
		var item_quantity = item_def[0];
		var item_name = item_def[1];
		var item = parent.G.items[item_name];
		return { name: item_name, quantity: item_quantity, level: item.scroll === true ? 0 : null };
	});
}

// Finds slot indices covering req.quantity units, spanning multiple slots for non-stackable
// items. Returns null if inventory doesn't have enough.
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

// How many of item_name fit given free inventory space + existing partial stacks. Stackable
// items pack many units per slot, so free-slot count alone would undercount capacity.
// Leaves a 3-slot buffer either way.
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

// Inventory + bank quantity currently held of a named item/level.
function total_held(name, level) {
	var have = bank_quantity_for(name, level);
	character.items.forEach(function(item) {
		if (item && item.name === name && (level == null || item.level === level)) {
			have += item.q || 1;
		}
	});
	return have;
}

// Cap on how many of a recipe could be made from non-buyable ingredients (only held/banked
// counts). Buyable ingredients aren't capped here; gold is checked by max_affordable_count().
function max_craftable_by_ingredients(craft_def) {
	var basics = parent.G.npcs["basics"];
	var max_count = Infinity;
	craft_recipe_items(craft_def).forEach(function(req) {
		if (basics.items.includes(req.name)) return; // buyable — not capped here
		max_count = Math.min(max_count, Math.floor(total_held(req.name, req.level) / req.quantity));
	});
	return max_count;
}

// Total gold cost to craft `count`, buying whatever's short on buyable ingredients.
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

// Largest count (up to upper_bound) affordable given current gold — binary search.
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

// How many of a target could be crafted right now, respecting target.max, free space,
// non-buyable-ingredient availability, and gold.
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

// Total shortfall of each ingredient (inventory-only) needed to craft `count` of a recipe.
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

// Buys/withdraws enough of every missing ingredient for the whole batch up front (bank
// first, then NPC). Loops in bounded rounds, re-checking inventory each time since a
// single buy() can silently cap below the requested amount. Returns true once nothing
// is missing, false if a round makes no progress or the round limit is hit.
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

		if (!made_progress) return false; // stuck — avoid spinning MAX_ROUNDS for nothing
	}

	return compute_missing_ingredients(craft_def, count).length === 0;
}

// Crafts up to `count` of craft_name: gathers the whole batch up front, travels to the
// crafting bench once, then crafts repeatedly from inventory. Returns how many were crafted.
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
			// Explicit radius: smarter_move()'s default (10) is looser than CRAFT_POSITION_TOLERANCE (5).
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
		if (!ok) break; // ran out of ingredients partway through the batch

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

// Attempts to craft a single named item, gathering what's missing from the bank or by
// buying (one ingredient per call). Returns "crafted", "withdrawing"/"buying" (call again
// to continue), "missing", or "no_recipe". Kept for Merchant_Functions.js's
// ensure_tool_available() (single replacement "rod"/"pickaxe" on demand) — try_craft()
// below uses the batch functions instead.
async function craft_item(craft_name) {
	var craft_def = parent.G.craft[craft_name];
	if (craft_def == null) return "no_recipe";

	var cost = craft_def.cost;

	// >, not >=, to match the batch cost convention below — exact cost is affordable.
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

		// Not enough in inventory — check the bank before trying to buy.
		if (bank_quantity_for(item_name, level) > 0) {
			try {
				await withdraw_item(item_name, level, item_quantity);
			} catch (e) {
				catcher(e, "craft_item: withdraw " + item_name);
			}
			// Return so the caller controls pacing — call again once the item shows up in inventory.
			return "withdrawing";
		}

		missing++;

		var basics = parent.G.npcs["basics"];

		if (basics.items.includes(item_name)) {
			cost += item.g; // <=, not <, matching the affordability check above

			if (cost <= character.gold) {
				buyable_missing.push(item_name);
			} else {
				buyable_missing = [];
				break;
			}
		}
	}

	if (missing == 0) {
		// Server expects a flat 9-slot grid (inventory indices, null for empty). Must be at the crafting bench.
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

// Safety cap on batches per try_craft() call so a stuck loop can't spin forever.
var CRAFT_MAX_BATCHES = 50;

async function try_craft() {
	// CONFIG.crafting.targets: [{ name, min?, max? }] — min (default 1) is the smallest
	// worthwhile batch; max (default unlimited) caps the TOTAL crafted this call, not a
	// single batch (each batch is still capped by max_craftable_by_space()), so reaching
	// max loops withdraw-craft-bank cycles until max, resources run out, or CRAFT_MAX_BATCHES hits.
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
			if (batch_size <= 0) break; // out of ingredients/gold/space -- nothing more to do

			var crafted = await craft_batch(target.name, batch_size);
			total_crafted += crafted;
			if (crafted <= 0) break; // no progress -- avoid spinning on a stuck batch

			game_log(`✅ Crafted ${crafted}x ${target.name} (${total_crafted}${target_max === Infinity ? "" : "/" + target_max} this run).`);

			if (total_crafted >= target_max) break;

			// sell_items()/bank_items() directly, not sell_and_bank() -- its return-to-HOME trip
			// would just be undone by the next craft_batch() traveling to CRAFT_LOCATION anyway.
			await sell_items();
			await bank_items();
		}
		break; // one target per try_craft() call
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

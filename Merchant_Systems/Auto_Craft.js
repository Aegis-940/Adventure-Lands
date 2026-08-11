// Craft targets live in Character_Functions/Merchant_Functions.js's CONFIG.crafting.targets
// (that file loads after this one, but this array is only read once try_craft() actually
// runs, well after everything has loaded).
//
// No standalone interval here anymore — the merchant state machine
// (Character_Functions/Merchant_Functions.js) calls try_craft() on its own
// CRAFTING-state cycle, so this stays a plain callable function.

// Checked by Character_Functions/Merchant_Functions.js's should_run_craft() — contextual
// stand-in for the old time interval: is crafting even worth attempting right now?
function can_afford_any_craft() {
	for (const target of CONFIG.crafting.targets) {
		const craft_def = parent.G.craft[target.name];
		if (craft_def && craft_def.cost <= character.gold) return true;
	}
	return false;
}

// Crafting itself (the "craft" socket action) can only be done standing at the crafting
// bench, not wherever the ingredients happened to be gathered from.
var CRAFT_LOCATION = { map: "main", x: 0, y: 492 };
var CRAFT_POSITION_TOLERANCE = 5;

// Total quantity of an item sitting in the bank at a given level (null = any level) —
// checked before falling back to buying, since not every craft ingredient is NPC-buyable.
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

// How many of a recipe we could fit given current free inventory space, when
// CONFIG.crafting.targets doesn't specify an explicit count — conservative: 1 free
// slot per craft (each produces one output item), leaving a small buffer.
function max_craftable_by_space() {
	var free_slots = character.items.filter(function(it) { return !it; }).length;
	return Math.max(0, free_slots - 3);
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

// Buys/withdraws enough of every missing ingredient for the WHOLE batch up front (bank
// first, then NPC purchase in one bulk buy() call), instead of one craft's worth at a
// time. Returns true once nothing is missing, false if something couldn't be fully
// gathered (not in the bank, not buyable, or not enough gold).
async function gather_ingredients_for_batch(craft_def, count) {
	var missing = compute_missing_ingredients(craft_def, count);

	for (var i = 0; i < missing.length; i++) {
		var need = missing[i];

		if (bank_quantity_for(need.name, need.level) > 0) {
			try {
				await withdraw_item(need.name, need.level, need.amount);
			} catch (e) {
				catcher(e, "gather_ingredients_for_batch: withdraw " + need.name);
			}
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
		await delay(400);
	}

	return compute_missing_ingredients(craft_def, count).length === 0;
}

// Crafts up to `count` of craft_name: gathers the whole batch's ingredients first (see
// gather_ingredients_for_batch()), travels to the crafting bench once, then crafts
// repeatedly from inventory. Returns how many were actually crafted.
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
			await smarter_move(CRAFT_LOCATION);
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
			var idx = scan_inventory_for_item_index(recipe[i].name, recipe[i].level);
			if (idx == null) { ok = false; break; }
			craft_slots.push(idx);
		}
		if (!ok) break; // ran out of ingredients partway through the batch

		var craft_array = craft_slots.slice(0, 9);
		while (craft_array.length < 9) {
			craft_array.push(null);
		}

		try {
			await craft.apply(null, craft_array);
		} catch (e) {
			catcher(e, "craft_batch: craft " + craft_name);
			break;
		}
		crafted++;
		await delay(UPGRADE_INTERVAL);
	}

	return crafted;
}

// Attempts to craft a single named item — one recipe check, gathering what's missing
// from the bank or by buying (one ingredient per call, same throttling as the rest of
// this file). Returns "crafted", "withdrawing"/"buying" (gathered one ingredient, call
// again to continue), "missing" (can't complete or afford it), or "no_recipe". Kept for
// Merchant_Functions.js's ensure_tool_available() (crafting a single replacement
// "rod"/"pickaxe" on demand) — try_craft() below uses the batch functions instead.
async function craft_item(craft_name) {
	//Grab the crafting recipe.
	var craft_def = parent.G.craft[craft_name];
	if (craft_def == null) return "no_recipe";

	var cost = craft_def.cost;

	//Do we have enough to pay for the recipe?
	if (cost >= character.gold) return "missing";

	//Variable to track how many items we're missing from the recipe.
	var missing = 0;

	//Variable to hold the inventory slots of items that belong to the recipe.
	var craft_slots = [];

	//Variable to hold the item names of things we're missing from the recipe.
	var buyable_missing = [];

	//Iterate over every item in the recipe to check if we have it.
	for (var item_index in craft_def.items) {
		//Grab the item from the recipe, it'll say what and how many.
		var item_def = craft_def.items[item_index];

		//What is the name of the item in the recipe?
		var item_name = item_def[1];

		//How many of the item do we need.
		var item_quantity = item_def[0];

		//Grab information on the item we need.
		var item = parent.G.items[item_name];

		var level = null;

		//Is this item upgradeable?
		if (item.scroll == true) {
			//As of now we need level 0 items.
			//May need to change later.
			level = 0;
		}

		//Try to find the index of the item in our inventory
		var item_search = scan_inventory_for_item_index(item_name, level);
		var have_qty = item_search != null ? (character.items[item_search].q || 1) : 0;

		//Do we have enough of the item in inventory already?
		if (item_search != null && (have_qty >= item_quantity || item_quantity == 1)) {
			//Yeah? Then we'll mark it for use.
			craft_slots.push(item_search);
			continue;
		}

		//Not enough in inventory — check the bank before giving up or trying to buy.
		if (bank_quantity_for(item_name, level) > 0) {
			try {
				await withdraw_item(item_name, level, item_quantity);
			} catch (e) {
				catcher(e, "craft_item: withdraw " + item_name);
			}
			//Return so the caller controls pacing — call craft_item() again to continue
			//once the withdrawn item shows up in inventory.
			return "withdrawing";
		}

		//Not in the bank either — mark it missing and see if it's buyable from an NPC.
		missing++;

		var basics = parent.G.npcs["basics"];

		if (basics.items.includes(item_name)) {
			//Do we have enough to complete the crafting with the cost of the item included?
			cost += item.g;

			if (cost < character.gold) {
				//Yeah? Mark it as something to buy.
				buyable_missing.push(item_name);
			} else {
				//Not enough gold to craft, clear the list of things to buy and stop.
				buyable_missing = [];
				break;
			}
		}
	}

	//Are we missing anything?
	if (missing == 0) {
		//Craft it! Server expects a flat 9-slot grid (inventory indices, null for empty).
		//Crafting has to happen at the crafting bench — travel there first.
		if (
			character.map !== CRAFT_LOCATION.map ||
			Math.hypot(character.x - CRAFT_LOCATION.x, character.y - CRAFT_LOCATION.y) > CRAFT_POSITION_TOLERANCE
		) {
			try {
				await smarter_move(CRAFT_LOCATION);
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

	//Try to buy whatever we're missing.
	if (buyable_missing.length == missing) {
		for (var id_buy in buyable_missing) {
			//Buy an item we're missing, and return so the caller controls how fast
			//requests are sent to the server — call craft_item() again to continue.
			var buy_name = buyable_missing[id_buy];

			//Missing items are only buyable from the "basics" NPC — travel there first.
			//smart_move (the native bot function, not our smarter_move wrapper) resolves
			//NPC ids directly and is a safe no-op if already close enough.
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

async function try_craft() {
	// CONFIG.crafting.targets: [{ name, count? }] — count omitted crafts as many as
	// will fit in free inventory space. One target's full batch per call: gather
	// everything needed up front, craft the whole batch, then bank the results.
	for (var t = 0; t < CONFIG.crafting.targets.length; t++) {
		var target = CONFIG.crafting.targets[t];
		var craft_def = parent.G.craft[target.name];
		if (craft_def == null) continue;

		var desired_count = target.count != null ? target.count : max_craftable_by_space();
		if (desired_count <= 0) continue;

		var crafted = await craft_batch(target.name, desired_count);
		if (crafted > 0) {
			game_log(`✅ Crafted ${crafted}x ${target.name}.`);
			await sell_and_bank();
		}
		break; // one target per try_craft() call
	}
}

function scan_inventory_for_item_index(name, max_level) {
	//Iterate over every slot in our inventory.
	for (var i = 0; i <= 41; i++) {
		var cur_slot = character.items[i];

		//Does the item name match?
		if (cur_slot != null && cur_slot.name == name) {
			//Does the level match?
			if (max_level == null || cur_slot.level <= max_level) {
				//Return the inventory slot #.
				return i;
			}
		}
	}
}

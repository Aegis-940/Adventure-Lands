// Craft targets live in Character_Functions/Merchant_Functions.js's CONFIG.crafting.targets
// (that file loads after this one, but this array is only read once try_craft() actually
// runs, well after everything has loaded).
//
// No standalone interval here anymore — the merchant state machine
// (Character_Functions/Merchant_Functions.js) calls try_craft() on its own
// CRAFTING-state cycle, so this stays a plain callable function.

// Checked by Character_Functions/Merchant_Functions.js's should_run_craft() — contextual
// stand-in for the old time interval: is crafting even worth attempting right now?
// A target only counts if max_craftable_now() (real ingredient/space/gold availability,
// not just a wish) reaches at least its configured min — see try_craft() below.
function can_afford_any_craft() {
	for (const target of CONFIG.crafting.targets) {
		if (max_craftable_now(target) >= (target.min ?? 1)) return true;
	}
	return false;
}

// Crafting itself (the "craft" socket action) can only be done standing at the crafting
// bench, not wherever the ingredients happened to be gathered from.
var CRAFT_LOCATION = { map: "main", x: 0, y: 492 };
var CRAFT_POSITION_TOLERANCE = 5;

// Delay between successive crafts in a batch. A local constant, not Auto_Upgrade.js's
// UPGRADE_INTERVAL — that file only runs through the eval-based role-file loader, so
// its top-level const never becomes visible outside that one eval call. Referencing it
// here threw a ReferenceError right after the first craft in a batch, ending it early.
var CRAFT_INTERVAL = 300;

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

// Finds enough inventory slot indices to supply req.quantity units of an ingredient,
// spanning multiple slots if it's non-stackable (each unit its own slot) instead of
// assuming one slot's stack always covers the whole requirement — same pattern as
// Auto_Upgrade.js's pick_three_slots() for compounds. Returns null if inventory doesn't
// actually have enough.
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

// How many of a recipe we could fit given current free inventory space, when
// CONFIG.crafting.targets doesn't specify an explicit count — conservative: 1 free
// slot per craft (each produces one output item), leaving a small buffer.
function max_craftable_by_space() {
	var free_slots = character.items.filter(function(it) { return !it; }).length;
	return Math.max(0, free_slots - 3);
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

// Hard cap on how many of a recipe could ever be made right now from non-buyable
// ingredients (nothing sells them — only what's already banked/held counts). Buyable
// ingredients aren't capped here; gold is checked separately by max_affordable_count().
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

// Largest count (up to upper_bound) affordable given current gold — binary search since
// cost is monotonic non-decreasing in count.
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

// How many of a target could actually be crafted right now, respecting all three
// limits: target.max (batch cap, default unlimited), free inventory space,
// non-buyable-ingredient availability, and current gold. Compared against target.min
// (default 1) by can_afford_any_craft()/try_craft() to decide if it's worth attempting.
function max_craftable_now(target) {
	var craft_def = parent.G.craft[target.name];
	if (!craft_def) return 0;

	// max_craftable_by_space() is always finite, so count is too even if target.max
	// and/or the ingredient cap are Infinity (i.e. all-buyable, uncapped recipe).
	var count = Math.min(
		target.max ?? Infinity,
		max_craftable_by_space(),
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

// Buys/withdraws enough of every missing ingredient for the WHOLE batch up front (bank
// first, then NPC purchase), instead of one craft's worth at a time. Loops in bounded
// rounds, re-checking actual inventory after each buy/withdraw: some items (e.g.
// non-stackable gear-type ingredients) silently cap a single buy() to fewer than
// requested, so one pass isn't reliable — this tops up the remainder automatically
// instead of only fixing itself across separate try_craft() calls. Returns true once
// nothing is missing, false if a round makes no progress (out of gold, or genuinely
// unobtainable) or the round limit is hit.
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
			await delay(10); // wait for the crafted item to show up in inventory before continuing
		} catch (e) {
			catcher(e, "craft_batch: craft " + craft_name);
			break;
		}
		crafted++;
		await delay(CRAFT_INTERVAL);
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

	//Do we have enough to pay for the recipe? (>, not >=, to match the batch cost
	//convention below — an exact-cost craft is affordable, not "missing".)
	if (cost > character.gold) return "missing";

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

		//Try to find enough slots to cover the required quantity — may span multiple
		//slots for a non-stackable item (see find_recipe_slots()).
		var recipe_slots = find_recipe_slots({ name: item_name, quantity: item_quantity, level: level });

		//Do we have enough of the item in inventory already?
		if (recipe_slots) {
			//Yeah? Then we'll mark them for use.
			craft_slots = craft_slots.concat(recipe_slots);
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
			//(<=, not <, to match the same convention as the affordability check above.)
			cost += item.g;

			if (cost <= character.gold) {
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
	// CONFIG.crafting.targets: [{ name, min?, max? }] — min (default 1) is the smallest
	// batch worth bothering with; max (default unlimited) caps the batch size. Skips a
	// target unless max_craftable_now() (real ingredient/space/gold availability) can
	// reach at least min. One target's full batch per call: gather everything needed
	// up front, craft the whole batch, then bank the results.
	for (var t = 0; t < CONFIG.crafting.targets.length; t++) {
		var target = CONFIG.crafting.targets[t];
		var craft_def = parent.G.craft[target.name];
		if (craft_def == null) continue;

		var desired_count = max_craftable_now(target);
		if (desired_count < (target.min ?? 1)) continue;

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

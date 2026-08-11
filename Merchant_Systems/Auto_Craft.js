//The items we want to craft.
var craft_list = ["pouchbow"];

setInterval(function() {
	try_craft();
}, 500);

function try_craft() {
	//Iterate over everything we've configured to auto craft.
	for (var index in craft_list) {
		//What's the name of the item we want to craft?
		var craft_name = craft_list[index];

		//Grab the crafting recipe.
		var craft_def = parent.G.craft[craft_name];

		var cost = craft_def.cost;

		//Did we find a recipe?
		if (craft_def != null) {
			//Yeah? Do we have enough to pay for the recipe?
			if (cost < character.gold) {
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

					//Do we have the item needed to craft?
					if (item_search == null) {
						//Mark that we're missing an item.
						missing++;

						//No? Then check to see if we can buy one.
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
					} else {
						//Do we have the amount of the item that is required by the recipe?
						var inv_item = character.items[item_search];

						if (inv_item.q >= item_quantity || item_quantity == 1) {
							//Yeah? Then we'll mark it for use.
							craft_slots.push(item_search);
						} else {
							missing++;
						}
					}
				}

				//Are we missing anything?
				if (missing == 0) {
					//Craft it! Server expects a flat 9-slot grid (inventory indices, null for empty).
					var craft_array = craft_slots.slice(0, 9);
					while (craft_array.length < 9) {
						craft_array.push(null);
					}

					craft.apply(null, craft_array);
					break;
				} else {
					//Try to buy whatever we're missing.
					if (buyable_missing.length == missing) {
						for (var id_buy in buyable_missing) {
							//Buy an item we're missing, and break execution so that we can control how fast requests are sent to the server.
							var buy_name = buyable_missing[id_buy];

							buy(buy_name);
							break;
						}
					}
				}
			}
		}
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

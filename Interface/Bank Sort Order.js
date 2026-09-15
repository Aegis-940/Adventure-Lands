// --------------------------------------------------------------------------------------------------------------------------------- //
// BANK SORTER
// --------------------------------------------------------------------------------------------------------------------------------- //

var al_items = {};
const order = {};
al_items.order = order;

order.names = [
	"Helmets",
	"Armors",
	"Underarmors",
	"Gloves",
	"Shoes",
	"Capes",
	"Rings",
	"Earrings",
	"Amulets",
	"Belts",
	"Orbs",
	"Weapons",
	"Shields",
	"Offhands",
	"Elixirs",
	"Potions",
	"Scrolls",
	"Crafting and Collecting",
	"Exchangeables",
	"Others",
];

order.ids = [
	"helmet",
	"chest",
	"pants",
	"gloves",
	"shoes",
	"cape",
	"ring",
	"earring",
	"amulet",
	"belt",
	"orb",
	"weapon",
	"shield",
	"offhand",
	"elixir",
	"pot",
	"scroll",
	"material",
	"exchange",
	"",
];

order.item_ids = order.ids.map((_id) => []);
object_sort(G.items, "gold_value").forEach(function (b) {
	if (!b[1].ignore)
	for (var c = 0; c < order.ids.length; c++)
		if (
		!order.ids[c] ||
		b[1].type == order.ids[c] ||
		("offhand" == order.ids[c] &&
			in_arr(b[1].type, ["source", "quiver", "misc_offhand"])) ||
		("scroll" == order.ids[c] &&
			in_arr(b[1].type, ["cscroll", "uscroll", "pscroll", "offering"])) ||
		("exchange" == order.ids[c] && G.items[b[0]].e)
		) {
		order.item_ids[c].push(b[0]);
		break;
		}
});
order.flat_iids = order.item_ids.flat();
order.comparator = function (a, b) {
	return (
	(a == null) - (b == null) ||
	(a != null &&
		(order.flat_iids.indexOf(a.name) - order.flat_iids.indexOf(b.name) ||
		(a.name < b.name && -1) ||
		+(a.name > b.name) ||
		b.level - a.level))
	);
};

// --------------------------------------------------------------------------------------------------------------------------------- //
// FLOORS
// --------------------------------------------------------------------------------------------------------------------------------- //

const BANK_FLOOR_RANGES = [
	{ map: "bank", first: 0, last: 7, x: 0, y: -37 },
	{ map: "bank_b", first: 8, last: 23, x: -265, y: -344 },
	{ map: "bank_u", first: 24, last: 47 },
];

function bank_packs_on_floor(map) {
	const packs = [];
	const bank = character.bank || {};

	for (const floor of BANK_FLOOR_RANGES) {
		if (floor.map !== map) continue;
		for (let i = floor.first; i <= floor.last; i++) {
			if (Array.isArray(bank["items" + i])) packs.push("items" + i);
		}
	}

	return packs;
}

function get_packs_on_this_floor() {
	return bank_packs_on_floor(character.map);
}

function bank_floors_with_items() {
	const floors = [];

	for (const floor of BANK_FLOOR_RANGES) {
		const packs = bank_packs_on_floor(floor.map);
		if (packs.some((pack) => character.bank[pack].some((slot) => !!slot))) floors.push(floor.map);
	}

	return floors;
}

async function goto_bank_floor(map) {
	if (character.map === map) return;
	if (character.map !== "bank") await smarter_move({ map: "bank", x: 0, y: -37 });
	if (map === "bank") return;

	const floor = BANK_FLOOR_RANGES.find((f) => f.map === map);
	const spawn = G.maps[map] && G.maps[map].spawns && G.maps[map].spawns[0];
	const x = floor.x != null ? floor.x : spawn && spawn[0];
	const y = floor.y != null ? floor.y : spawn && spawn[1];
	if (x == null || y == null) return;

	await smarter_move({ map, x, y });
	await delay(300);
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// STACK CONSOLIDATION
// --------------------------------------------------------------------------------------------------------------------------------- //

var bank_merge_disabled = false;

function bank_stack_cap(name) {
	const def = G.items[name];
	return def && def.s ? def.s : 1;
}

function bank_stack_key(item) {
	return item.name + "|" + (item.level != null ? item.level : "") + "|" + (item.p || "");
}

function free_inventory_slots() {
	const free = [];
	for (let i = 0; i < character.items.length; i++) if (!character.items[i]) free.push(i);
	return free;
}

function inventory_slots_of(key) {
	const slots = [];

	for (let i = 0; i < character.items.length; i++) {
		const itm = character.items[i];
		if (itm && bank_stack_key(itm) === key) slots.push(i);
	}

	return slots;
}

function find_partial_bank_stacks(packs) {
	const groups = {};

	for (const pack of packs) {
		const arr = character.bank[pack];
		if (!Array.isArray(arr)) continue;
		for (let i = 0; i < arr.length; i++) {
			const itm = arr[i];
			if (!itm) continue;
			const cap = bank_stack_cap(itm.name);
			if (cap <= 1 || (itm.q || 1) >= cap) continue;
			const key = bank_stack_key(itm);
			if (!groups[key]) groups[key] = [];
			groups[key].push({ key, pack, slot: i, q: itm.q || 1, cap });
		}
	}

	return Object.values(groups).filter((group) => group.length > 1);
}

async function consolidate_stack_group(group) {
	const key = group[0].key;
	const cap = group[0].cap;
	if (inventory_slots_of(key).length) return 0;

	const free = free_inventory_slots().length;
	if (free < 2) {
		game_log("⚠️ Bank consolidation needs 2 free inventory slots");
		return 0;
	}

	const chunk = group.slice().sort((a, b) => a.q - b.q).slice(0, Math.min(group.length, free));
	if (chunk.length < 2) return 0;

	let withdrawn = 0;
	let pulled = 0;
	for (const entry of chunk) {
		try {
			await bank_retrieve(entry.pack, entry.slot, -1);
			withdrawn += entry.q;
			pulled++;
		} catch (e) {
			game_log(`⚠️ Consolidation could not withdraw ${key} from ${entry.pack}:${entry.slot}`, "#FFA500");
		}
		await delay(150);
	}

	const held = inventory_slots_of(key);
	if (held.length > Math.ceil(withdrawn / cap)) {
		bank_merge_disabled = true;
		game_log("⚠️ Stacks did not merge in inventory, consolidation stopped", "#FFA500");
	}

	for (const slot of held) {
		try {
			await bank_store(slot);
		} catch (e) {
			game_log(`⚠️ Consolidation could not store ${key} back`, "#FFA500");
		}
		await delay(150);
	}

	return bank_merge_disabled || pulled < 2 ? 0 : pulled;
}

async function consolidate_bank_floor(packs) {
	let merged = 0;

	for (let pass = 0; pass < 10 && !bank_merge_disabled; pass++) {
		const groups = find_partial_bank_stacks(packs);
		if (!groups.length) break;

		let changed = false;
		for (const group of groups) {
			if (bank_merge_disabled) break;
			const gained = await consolidate_stack_group(group);
			if (gained > 0) {
				merged += gained;
				changed = true;
			}
		}

		if (!changed) break;
	}

	return merged;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// SORTING
// --------------------------------------------------------------------------------------------------------------------------------- //

async function sort_all_bank() {
	if (!character.bank) return log("Not inside the bank");

	bank_merge_disabled = false;
	const floors = bank_floors_with_items();

	for (const map of floors) {
		await goto_bank_floor(map);
		if (character.map !== map) {
			game_log(`⚠️ Could not reach ${map}, skipping`, "#FFA500");
			continue;
		}

		const packs = bank_packs_on_floor(map);
		if (!packs.length) {
			game_log(`⚠️ No bank packs readable on ${map}`, "#FFA500");
			continue;
		}

		const merged = await consolidate_bank_floor(packs);
		if (merged) game_log(`🧺 Combined ${merged} partial stacks on ${map}`);
		await delay(200);
		await sort_bank_floor(packs);
		game_log(`🏧 Sorted ${map}`);
	}
}

function sort_bank_floor(packs_on_floor, inv_indices, sorted_bank, i_running) {
	if (!character.bank) return log("Not inside the bank");

	if (!inv_indices) {
	inv_indices = [];
	for (let i = 0; i < 42; i++) {
		if (!character.items[i]) inv_indices.push(i);
	}
	}
	if (inv_indices.length == 0) return log("Make some space in inventory");
	if (!sorted_bank) {
	let bank_array = [];
	for (let bank_pack of packs_on_floor) {
		if (bank_pack == "gold") continue;
		bank_array = bank_array.concat(character.bank[bank_pack]);
	}
	bank_array.sort(al_items.order.comparator);
	sorted_bank = {};
	for (let bank_pack of packs_on_floor) {
		if (bank_pack == "gold") continue;
		sorted_bank[bank_pack] = bank_array.slice(0, 42);
		bank_array = bank_array.slice(42);
	}
	}
	if (i_running == null) i_running = 0;
	else i_running = (i_running + 1) % inv_indices.length;
	const inv_pointer = inv_indices[i_running];
	const inv_itm = character.items[inv_pointer];
	if (!inv_itm) {
	for (let bank_pack of packs_on_floor) {
		if (bank_pack == "gold") continue;
		for (let i = 0; i < 42; i++) {
		if (
			character.bank[bank_pack][i] &&
			al_items.order.comparator(
			character.bank[bank_pack][i],
			sorted_bank[bank_pack][i]
			)
		) {
			log("Swapping empty " + inv_pointer + " with " + i + bank_pack);
			parent.socket.emit("bank", {
			operation: "swap",
			pack: bank_pack,
			str: i,
			inv: inv_pointer,
			});
			return delay(150).then((x) =>
			sort_bank_floor(packs_on_floor, inv_indices, sorted_bank, i_running)
			);
		}
		}
	}
	inv_indices.splice(i_running, 1);
	return delay(150).then((x) =>
		sort_bank_floor(packs_on_floor, inv_indices, sorted_bank, i_running)
	);

	} else {
	for (let bank_pack of packs_on_floor) {
		if (bank_pack == "gold") continue;
		for (let i = 0; i < 42; i++) {
		if (
			!al_items.order.comparator(inv_itm, sorted_bank[bank_pack][i]) &&
			al_items.order.comparator(
			character.bank[bank_pack][i],
			sorted_bank[bank_pack][i]
			)
		) {
			log({ operation: "swap", pack: bank_pack, str: i, inv: inv_pointer });
			parent.socket.emit("bank", {
			operation: "swap",
			inv: inv_pointer,
			pack: bank_pack,
			str: i,
			});
			return delay(150).then((x) =>
			sort_bank_floor(packs_on_floor, inv_indices, sorted_bank, i_running)
			);
		}
		}
	}
	}

	return sorted_bank;
}

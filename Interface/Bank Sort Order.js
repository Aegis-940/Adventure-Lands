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
	if (!def || !def.s) return 1;
	return def.s === true ? 9999 : def.s;
}

function bank_stack_key(item) {
	return [
		item.name,
		item.level != null ? item.level : "",
		item.p || "",
		item.v ? "v" : "",
		item.data != null ? item.data : "",
	].join("|");
}

function stackable_bank_item(item) {
	return !!item && !item.l && !item.b && bank_stack_cap(item.name) > 1;
}

const INVENTORY_SLOTS = 42;

function free_inventory_slots() {
	const free = [];
	for (let i = 0; i < INVENTORY_SLOTS; i++) if (!character.items[i]) free.push(i);
	return free;
}

function inventory_slots_of(key) {
	const slots = [];

	for (let i = 0; i < INVENTORY_SLOTS; i++) {
		const itm = character.items[i];
		if (itm && bank_stack_key(itm) === key) slots.push(i);
	}

	return slots;
}

function bank_slots_of(packs, key) {
	const slots = [];

	for (const pack of packs) {
		const arr = character.bank[pack];
		if (!Array.isArray(arr)) continue;
		for (let i = 0; i < arr.length; i++) {
			if (arr[i] && bank_stack_key(arr[i]) === key) slots.push({ key, pack, slot: i, q: arr[i].q || 1 });
		}
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
			if (!stackable_bank_item(itm)) continue;
			const cap = bank_stack_cap(itm.name);
			if ((itm.q || 1) >= cap) continue;
			const key = bank_stack_key(itm);
			if (!groups[key]) groups[key] = [];
			groups[key].push({ key, pack, slot: i, q: itm.q || 1, cap });
		}
	}

	return Object.values(groups).filter((group) => group.length > 1);
}

const BANK_OP_TIMEOUT = 4000;

async function bank_op(start, done) {
	try {
		const promise = start();
		if (promise && promise.catch) promise.catch(() => { });
	} catch (e) {
		return false;
	}

	const until = Date.now() + BANK_OP_TIMEOUT;
	while (Date.now() < until) {
		await delay(100);
		if (done()) return true;
	}

	return false;
}

function inventory_total(key) {
	return inventory_slots_of(key).reduce((sum, slot) => sum + item_q(slot), 0);
}

async function pull_bank_slot(entry) {
	const before = {};
	for (const slot of inventory_slots_of(entry.key)) before[slot] = item_q(slot);
	const before_total = inventory_total(entry.key);

	const ok = await bank_op(
		() => bank_retrieve(entry.pack, entry.slot, -1),
		() => inventory_total(entry.key) > before_total
	);

	if (!ok) {
		game_log(`⚠️ Could not withdraw ${entry.key.split("|")[0]} from ${entry.pack}:${entry.slot}`, "#FFA500");
		return -1;
	}

	const held = inventory_slots_of(entry.key);
	const changed = held.filter((slot) => item_q(slot) !== (before[slot] || 0));
	return changed.length ? changed[changed.length - 1] : held[held.length - 1];
}

async function split_off(inv_slot, key, amount) {
	const find_piece = function () {
		const found = inventory_slots_of(key).filter((slot) => item_q(slot) === amount);
		return found.length ? found[0] : -1;
	};

	const ok = await bank_op(() => split(inv_slot, amount), () => find_piece() >= 0);
	if (!ok) {
		const held = inventory_slots_of(key).map((slot) => item_q(slot)).join("/");
		game_log(`⚠️ Split of ${key.split("|")[0]} for ${amount} gave ${held || "nothing"}`, "#FFA500");
		return -1;
	}

	return find_piece();
}

function item_q(slot) {
	const itm = character.items[slot];
	return itm ? itm.q || 1 : 0;
}

async function put_back(inv_slot, pack) {
	return await bank_op(() => bank_store(inv_slot, pack), () => !character.items[inv_slot]);
}

async function merge_slots(key, a, b, want) {
	const ok = await bank_op(
		() => swap(a, b),
		() => inventory_slots_of(key).some((slot) => item_q(slot) === want)
	);

	if (!ok) return -1;
	return inventory_slots_of(key).find((slot) => item_q(slot) === want);
}

async function consolidate_stack_group(group, packs) {
	const key = group[0].key;
	const cap = group[0].cap;
	const name = key.split("|")[0];

	if (inventory_slots_of(key).length) {
		game_log(`⏭️ Skipped ${name} — already in inventory`, "#999999");
		return 0;
	}

	if (free_inventory_slots().length < 3) {
		game_log("⚠️ Bank consolidation needs 3 free inventory slots");
		return 0;
	}

	let topped = 0;

	for (let step = 0; step < group.length * 2 && !bank_merge_disabled; step++) {
		const partials = bank_slots_of(packs, key).filter((entry) => entry.q < cap);
		if (partials.length < 2) break;

		partials.sort((a, b) => b.q - a.q);
		const target = partials[0];
		const donor = partials[partials.length - 1];
		const need = cap - target.q;
		game_log(`🧺 ${name} ${donor.pack}:${donor.slot} q${donor.q} → ${target.pack}:${target.slot} q${target.q}, need ${need}`, "#999999");

		const pulled = await pull_bank_slot(donor);
		if (pulled < 0) break;

		let piece = pulled;
		if (donor.q > need) {
			piece = await split_off(pulled, key, need);
			if (piece < 0) {
				await put_back(pulled, donor.pack);
				break;
			}
			for (const slot of inventory_slots_of(key)) {
				if (slot !== piece) await put_back(slot, donor.pack);
			}
		}

		const want = item_q(piece) + target.q;
		const held = await pull_bank_slot(target);
		if (held < 0) {
			await put_back(piece, donor.pack);
			break;
		}

		let merged = inventory_slots_of(key).find((slot) => item_q(slot) === want);
		if (merged === undefined) merged = await merge_slots(key, piece, held, want);

		if (merged === undefined || merged < 0) {
			bank_merge_disabled = true;
			game_log(`⚠️ ${name} would not combine in inventory, consolidation stopped`, "#FFA500");
		} else {
			topped++;
		}

		for (const slot of inventory_slots_of(key)) await put_back(slot, target.pack);
	}

	return topped;
}

async function consolidate_bank_floor(packs) {
	let topped = 0;

	for (let pass = 0; pass < 10 && !bank_merge_disabled; pass++) {
		const groups = find_partial_bank_stacks(packs);
		if (!groups.length) break;

		let changed = false;
		for (const group of groups) {
			if (bank_merge_disabled) break;
			const gained = await consolidate_stack_group(group, packs);
			if (gained > 0) {
				topped += gained;
				changed = true;
			}
		}

		if (!changed) break;
	}

	return topped;
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

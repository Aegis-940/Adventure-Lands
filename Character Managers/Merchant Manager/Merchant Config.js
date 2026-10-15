// --------------------------------------------------------------------------------------------------------------------------------- //
// MERCHANT CONFIG — tunables, locations, and the task flag every other Merchant file reads
// --------------------------------------------------------------------------------------------------------------------------------- //

function upgrade_target() {
	return { name: setting("upgrade_target"), level: setting("upgrade_level"), count: setting("upgrade_count") };
}

function craft_targets() {
	const name = setting("craft_target");
	return name ? [{ name }] : [];
}

var CONFIG = {
	locations: {
		HOME: { map: "main", x: -87, y: -96 },
		BANK_LOCATION: { map: "bank", x: 0, y: -37 },
		POTION_SHOP: { map: "main", x: -87, y: -150 },
		FISHING_SPOT: { map: "main", x: -1116, y: -285 },
		MINING_SPOT: { map: "tunnel", x: 244, y: -153 },
	},
	party: {
		members: ["Ulric", "Myras", "Riva"],
		nearby_trigger_range: 200,
		action_range: 350,
	},
	delivery: {
		free_slots_threshold: 10,
		gold_threshold: 20000000,
	},
	upgrade_gold_threshold: 100000000,
	potions: {
		hp_threshold: 500,
		mp_threshold: 500,
	},
	do_not_bank: ["tracker", "computer", "hpot1", "mpot1"],
	min_bank_free_space: 10,
	min_free_inventory_slots: 3,
	priorities: ["dead", "delivering", "banking", "lolipops", "upgrading", "fishing", "mining", "crafting", "exchanging"],
};

var equipment_sets = {
	default: [
		{ slot: "mainhand", item_name: "broom", level: 9 },
		{ slot: "offhand", item_name: "wbookhs", level: 1 },
	],
	rod: [{ slot: "mainhand", item_name: "rod" }],
	pickaxe: [{ slot: "mainhand", item_name: "pickaxe" }],
};

var HOME = CONFIG.locations.HOME;
var BANK_LOCATION = CONFIG.locations.BANK_LOCATION;
var PARTY = CONFIG.party.members;

var merchant_task = "Idle";
var merchant_task_generation = 0;

function set_task(label) {
	merchant_task = label;
}

function begin_task(label) {
	set_task(label);
	return merchant_task_generation;
}

function end_task(generation) {
	if (generation === merchant_task_generation) set_task("Idle");
}

function abandon_task() {
	set_task("Idle");
	merchant_task_generation++;
}

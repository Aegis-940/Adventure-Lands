// --------------------------------------------------------------------------------------------------------------------------------- //
// MERCHANT CONFIG — tunables, locations, and the task flag every other Merchant file reads
// --------------------------------------------------------------------------------------------------------------------------------- //

function local_bool(key, fallback) {
	const raw = localStorage.getItem(key);
	return raw === null ? fallback : raw === "true";
}

var CONFIG = {
	enabled: {
		upgrading:  local_bool("AL_merchant_enabled_upgrading", true),
		crafting:   local_bool("AL_merchant_enabled_crafting", true),
		exchanging: local_bool("AL_merchant_enabled_exchanging", true),
		fishing:    local_bool("AL_merchant_enabled_fishing", false),
		mining:     false,
	},

	trading: {
		enabled: true,
	},
	sell_profile: [
		{ name: "firebow", level: 9, price: 1000000000, quantity: 3 },
		{ name: "firebow", level: 8, price: 100000000, quantity: 5 },
		{ name: "strring", level: 4, price: 1000000000, quantity: 1 },
		{ name: "ukey", level: 0, price: 20000000000, quantity: 1 },
	],
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
	crafting: {
		targets: [{ name: "basketofeggs", min: 25, max: 9999 }],
	},
	exchange: {
		targets: [
			{ name: "seashell",         min: 20 },
			{ name: "brownenvelope",    min: 1 },
			{ name: "goldenegg",    	min: 1 },
			{ name: "basketofeggs", 	min: 1 },
			{ name: "gem0",         	min: 1 },
			{ name: "gem1",         	min: 1 },
			{ name: "armorbox",     	min: 1 },
			{ name: "weaponbox",    	min: 1 },
			// { name: "candy1",   	 	min: 1 },
		],
	},
	do_not_bank: ["hpot1", "mpot1"],
	min_bank_free_space: 10,
	min_free_inventory_slots: 3,
	default_gear: {
		mainhand: { name: "broom", level: 9 },
		offhand: { name: "wbookhs", level: 1 },
	},
	priorities: ["dead", "anniversary", "delivering", "banking", "upgrading", "fishing", "mining", "crafting", "exchanging", "restocking"],
};

var HOME = CONFIG.locations.HOME;
var BANK_LOCATION = CONFIG.locations.BANK_LOCATION;
var PARTY = CONFIG.party.members;

var merchant_task = "Idle";
var merchant_task_generation = 0;

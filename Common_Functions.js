// -------------------------------------------------------------------- //
// CONFIG VARIABLES
// -------------------------------------------------------------------- //

let attack_mode                   = true;
let taunt_mode                    = true;
let fight_as_a_team               = false;
let inventory_check_enabled       = true;

let group_or_solo_button_title    = "Solo";
let taunt_button_title            = "Taunt";

const INVENTORY_CHECK_INTERVAL    = 10 * 60 * 1000;  // 20 minutes in ms
let last_inventory_check          = 0;

const PARTY_CHECK_INTERVAL        = 5000;
let last_party_check              = 0;

const REQUEST_COOLDOWN            = 30000;           // 30 seconds
let last_potion_request           = 0;
const HP_POT_THRESHOLD            = 3000;
const MP_POT_THRESHOLD            = 3000;

const HP_THRESHOLD                = 500;
const MP_THRESHOLD                = 500;
const HEAL_THRESHOLD              = 800;
const HEAL_COOLDOWN               = 200;

const TAUNT_RANGE                 = 320;

const PARTY_LEADER                = "Ulric";
const PARTY_MEMBERS               = ["Riva", "Myras", "Riff"];

const FOLLOW_DISTANCE             = 150;

const MONSTER_TYPES               = ["goo", "bee", "crab", "snake", "osnake", "bat", "goldenbat", "croc", "arcticbee", "spider", "prat", "cgoo", "stoneworm", "jr"];
const MERCHANT_NAME               = "Riff";

let last_death_time               = 0;

const FLOATING_BUTTON_IDS         = [];
let gold_history                  = [];

const MERCHANT_TASK_QUEUE         = [];
let merchant_busy                 = false;

// -------------------------------------------------------------------- //
// TANK ROLE CONFIG / PERSISTENCE
// -------------------------------------------------------------------- //

const TANK_ROLES = [
    { name: "Ulric", label: "🛡️🗡️" },
    { name: "Myras", label: "🛡️✨" },
    { name: "Riva",  label: "🛡️🏹" }
];
let who_is_tank                   = 0;  // default index

Object.defineProperty(window, "tank_name", {
    get() {
        // whenever you read tank_name, return the name at the current index
        return TANK_ROLES[who_is_tank].name;
    },
    set(new_name) {
        // whenever you write tank_name = "Myras", update who_is_tank to match
        const idx = TANK_ROLES.findIndex(r => r.name === new_name);
        if (idx !== -1) who_is_tank = idx;
    }
});

// -------------------------------------------------------------------- //
// CM HANDLERS
// -------------------------------------------------------------------- //

// Utility to add CM listeners
function add_cm_listener(fn) {
    if (!_cmListeners.includes(fn)) _cmListeners.push(fn);
}

// Utility to remove CM listeners
function remove_cm_listener(fn) {
    const index = _cmListeners.indexOf(fn);
    if (index !== -1) _cmListeners.splice(index, 1);
}

// Preserve existing handler
const original_on_cm = typeof on_cm === "function" ? on_cm : () => {};

// Global handler dispatcher
on_cm = function (name, data) {
    _cmListeners.forEach(fn => {
        try {
            fn(name, data);
        } catch (e) {
            console.error("CM listener error:", e);
        }
    });

    original_on_cm(name, data);
};

// Central CM message handlers
const CM_HANDLERS = {
    "my_location": (name, data) => {
        smart_move({ map: data.map, x: data.x, y: data.y });
    },

    "where_are_you": (name) => {
        send_cm(name, {
            type: "my_location",
            map: character.map,
            x: character.x,
            y: character.y
        });
    },

    "request_pots": async (name, data) => {
        const slot = locate_item(data.item);
        const available = character.items[slot]?.q || 0;

        if (slot === -1 || available < data.quantity) {
            game_log(`❌ Not enough ${data.item} to fulfill request from ${name}`);
            return;
        }

        game_log(`📦 Potion request received from ${name}...`);

        // Move to the player
        move_to_character(name);

        // Wait until we're close enough to transfer
        let attempts = 0;
        while (distance(character, get_player(name)) > 400 && attempts < 20) {
            await new Promise(res => setTimeout(res, 500));
            attempts++;
        }

        // Check again after moving
        if (distance(character, get_player(name)) <= 400) {
            send_item(name, slot, data.quantity);
            game_log(`✅ Sent ${data.quantity} x ${data.item} to ${name}`);
        } else {
            game_log(`⚠️ Failed to reach ${name} to send ${data.item}`);
        }
    },

    "check_inventory": (name) => {
        const count = character.items.filter(item => item).length;
        send_cm(name, { type: "inventory_status", count });
    },

    "send_inventory": () => {
        wait_for_merchant_and_send();
    },

    "default": (name, data) => {
        console.warn("Unhandled CM message:", data);
    },

    "set_tank": (name, data) => {
        who_is_tank = data.who_is_tank;

        const btn = window.top.document.getElementById("ToggleRoleMode");
        if (btn) btn.innerText = data.label;

        game_log(`📡 New tank set by ${name}: ${data.tank_name}`);
    }
};

const _cm_listeners = [];
// Register the handler dispatcher
add_cm_listener((name, data) => {
    if (!["Ulric", "Riva", "Myras", "Riff"].includes(name)) {
        game_log("❌ Unauthorized CM from " + name);
        return;
    }

    const handler = CM_HANDLERS[data.type] || CM_HANDLERS["default"];
    handler(name, data);
});

// -------------------------------------------------------------------- //
// FOLLOW PARTY LEADER
// -------------------------------------------------------------------- //

function follow_party_leader(party_leader) {
    setInterval(() => {
        if (!attack_mode || character.rip) return;

        const leader = parent.entities[party_leader];

        // Move if leader is not on screen, dead, or too far
        if (!leader || leader.rip || leader.map !== character.map || simple_distance(character, leader) > FOLLOW_DISTANCE) {
            move_to_character(party_leader);
        }
    }, 500); // Adjusted interval to reduce spamming
}

// -------------------------------------------------------------------- //
// CONSUME POTS
// -------------------------------------------------------------------- //

function pots() {
    // Use mana potion if needed
    if ((character.max_mp - character.mp >= 500 || character.mp < 720) && can_use("mp")) {
        use("mp"); // small mana potion
        // use("mpot1") or use("mpot0") for specific types
    }

    // Use health potion if needed
    if (character.max_hp - character.hp >= 400 && can_use("hp")) {
        use("hp"); // small health potion
        // use("hpot1") or use("hpot0") for specific types
    }
}

// -------------------------------------------------------------------- //
// TRANSFER LOOT TO MERCHANT
// -------------------------------------------------------------------- //

function send_to_merchant() {
    const merchant_name = "Riff";
    const merchant = parent.entities[merchant_name];

    // Check if merchant is valid and nearby
    if (!merchant || merchant.rip || merchant.map !== character.map || distance(character, merchant) > 400) {
        game_log("Merchant not nearby or unavailable");
        return;
    }

    for (let i = 2; i < character.items.length; i++) {
        const item = character.items[i];
        if (item) {
            send_item(merchant_name, i, item.q || 1);
        }
    }

    send_gold(merchant_name, character.gold);
}

// -------------------------------------------------------------------- //
// TARGET TANK'S TARGET
// -------------------------------------------------------------------- //

function target_tanks_target() {
    const tank = parent.entities[tank_name];
    if (!tank || tank.rip || tank.map !== character.map) {
        change_target(null);
        return null;
    }

    const tank_target_id = tank.target;
    if (!tank_target_id) {
        change_target(null);
        return null;
    }

    const monster = parent.entities[tank_target_id];
    if (monster && !monster.rip) {
        if (character.target !== monster.id) {
            change_target(monster);
        }
        return monster; // ✅ You must return this
    } else {
        change_target(null);
        return null;
    }
}

function get_monster_by_type_array(types, radius = 500) {
    const candidates = [];

    for (const id in parent.entities) {
        const m = parent.entities[id];

        if (
            m &&
            m.type === "monster" &&
            !m.rip &&
            types.includes(m.mtype) &&
            distance(character, m) <= radius
        ) {
            candidates.push(m);
        }
    }

    // Sort by distance to pick the closest
    candidates.sort((a, b) => distance(character, a) - distance(character, b));

    return candidates[0] || null;
}

function is_in_party(name) {
    return !!(parent.party && parent.party[name] !== undefined);
}

function party_manager() {
    const am_leader = character.name === PARTY_LEADER;
    const am_member = PARTY_MEMBERS.includes(character.name);
    const current_party = Object.keys(parent.party || {});

    if (am_leader) {
        PARTY_MEMBERS.forEach(name => {
            if (name === character.name) return;
            if (!current_party.includes(name)) {
                send_party_invite(name);
                accept_party_request(name); // Optional, in case of mutual sending
            }
        });
    } else if (am_member) {
        if (!current_party.includes(PARTY_LEADER)) {
            send_party_request(PARTY_LEADER);
            accept_party_invite(PARTY_LEADER);
        }
    }
}

function check_and_request_pots() {
    if (new Date() - last_potion_request < REQUEST_COOLDOWN) return;
    last_potion_request = new Date();

    const hp_pot_index = locate_item("hpot1");
    const mp_pot_index = locate_item("mpot1");
    const hp_count = hp_pot_index !== -1 ? character.items[hp_pot_index].q : 0;
    const mp_count = mp_pot_index !== -1 ? character.items[mp_pot_index].q : 0;

    if (hp_count < HP_POT_THRESHOLD) {
        send_cm("Riff", {
            type: "request_pots",
            item: "hpot1",
            quantity: 3000
        });
    }

    if (mp_count < MP_POT_THRESHOLD) {
        send_cm("Riff", {
            type: "request_pots",
            item: "mpot1",
            quantity: 3000 // Adjust as needed
        });
    }
}

function move_to_character(name, timeout_ms = 10000) {
    // Prevent multiple overlapping handlers
    let responded = false;

    function handle_response(n, data) {
        if (n !== name || !data || data.type !== "my_location") return;

        responded = true;
        remove_cm_listener(handle_response);
        clearTimeout(timeout_id);

        const { map, x, y } = data;
        if (!map || x == null || y == null) {
            game_log(`❌ Invalid location data from ${name}`);
            return;
        }

        smart_move({ map, x, y });
    }

    // Add listener
    add_cm_listener(handle_response);

    // Send request
    send_cm(name, { type: "where_are_you" });

    // Timeout fallback
    const timeout_id = setTimeout(() => {
        if (!responded) {
            remove_cm_listener(handle_response);
            game_log(`⚠️ No location response from ${name} within ${timeout_ms / 1000}s`);
        }
    }, timeout_ms);
}

// -------------------------------------------------------------------- //
// CHECK FOR LOOT AND TRANSFER
// -------------------------------------------------------------------- //

const INVENTORY_QUEUE       = ["Ulric", "Myras", "Riva"];
let currently_processing    = false;
const INVENTORY_THRESHOLD  = 15;
const SELLING_LOCATION     = { map: "main", x: -20, y: -100 };

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

let inventory_lock_timestamp    = 0;
const INVENTORY_LOCK_DURATION  = 5000; // 5 seconds max lock

async function check_remote_inventories() {
    const now = Date.now();

    // Prevent overlapping calls
    if (currently_processing && now - inventory_lock_timestamp < INVENTORY_LOCK_DURATION) {
        game_log("⏳ Inventory check already in progress.");
        return;
    }

    currently_processing = true;
    inventory_lock_timestamp = now;

    const initial_count = character.items.filter(Boolean).length;
    let resolved = false;

    const cleanup = () => {
        for (const t of INVENTORY_QUEUE) remove_cm_listener(listeners[t]);
        currently_processing = false;
        inventory_lock_timestamp = 0;
        INVENTORY_QUEUE.length = 0;
        INVENTORY_QUEUE.push("Ulric", "Myras", "Riva");
    };

    const listeners = {};

    for (const target of INVENTORY_QUEUE) {
        listeners[target] = (name, data) => {
            if (resolved || name !== target || data?.type !== "inventory_status") return;
            if (data.count <= INVENTORY_THRESHOLD) return;

            resolved = true;

            (async () => {
                try {
                    game_log(`📦 ${target} has ${data.count} items. Transferring...`);
                    move_to_character(target);
                    await delay(3000);
                    send_cm(target, { type: "send_inventory" });

                    // Wait for item increase
                    while (character.items.filter(Boolean).length <= initial_count) {
                        await delay(500);
                    }

                    // Wait for stable inventory
                    let stable_ticks = 0, last = character.items.filter(Boolean).length;
                    while (stable_ticks < 4) {
                        await delay(500);
                        const current = character.items.filter(Boolean).length;
                        if (current === last) {
                            stable_ticks++;
                        } else {
                            last = current;
                            stable_ticks = 0;
                        }
                    }

                    await smart_move(SELLING_LOCATION);
                    await sell_and_bank();
                } catch (e) {
                    console.error("❌ Inventory transfer error:", e);
                } finally {
                    cleanup();
                }
            })();
        };

        add_cm_listener(listeners[target]);
        send_cm(target, { type: "check_inventory" });
    }

    // Global timeout fallback
    setTimeout(() => {
        if (!resolved) {
            game_log("⚠️ No valid inventory responses received. Skipping.");
            cleanup();
        }
    }, INVENTORY_LOCK_DURATION);
}

// -------------------------------------------------------------------- //
// WAIT FOR MERCHANT AND SEND LOOT
// -------------------------------------------------------------------- //

async function wait_for_merchant_and_send() {
    game_log("📦 Waiting for merchant...");

    let attempts = 0;
    let merchant = null;

    while (attempts < 40) {
        merchant = get_player("Riff");

        if (merchant && !merchant.rip && merchant.map === character.map &&
            distance(character, merchant) <= 400
        ) {
            break; // Merchant is ready
        }

        await delay(5000);
        attempts++;
    }

    if (merchant && !merchant.rip && merchant.map === character.map &&
        distance(character, merchant) <= 400
    ) {
        for (let i = 2; i < character.items.length; i++) {
            const item = character.items[i];
            if (item) {
                send_item("Riff", i, item.q || 1);
            }
        }

        send_gold("Riff", 999999999); // Optional
        game_log("✅ Sent inventory and gold to merchant");
    } else {
        game_log("⚠️ Merchant not reachable after 10 seconds");
    }
}

// -------------------------------------------------------------------- //
// SIMPLE FISHING SCRIPT WITH AUTO-EQUIP
// -------------------------------------------------------------------- //

async function go_fish() {
	const FISHING_SPOT = { map: "main", x: -1116, y: -285 };

	// Check if fishing skill is available
	if (!can_use("fishing")) {
		game_log("*** Fishing cooldown active ***");
		return;
	}

	// Ensure fishing rod is equipped or try to equip it
	if (character.slots.mainhand?.name !== "rod") {
		const rod_index = character.items.findIndex(item => item?.name === "rod");
		if (rod_index === -1) {
			game_log("*** No fishing rod equipped or in inventory ***");
			return;
		}
		game_log("*** Equipping fishing rod... ***");
		await equip(rod_index);
		await delay(500);
	}

	// Double check it's now equipped
	if (character.slots.mainhand?.name !== "rod") {
		game_log("*** Failed to equip fishing rod ***");
		return;
	}

	// Move to fishing spot
	await smart_move(FISHING_SPOT);

	while (true) {
		// Final pre-fishing checks
		if (!can_use("fishing")) {
			await delay(500);
			game_log("*** Fishing cooldown active ***");
			break;
		}

		if (character.slots.mainhand?.name !== "rod") {
			await delay(500);
			game_log("*** Fishing rod not equipped or broken ***");
			break;
		}

		// Snapshot inventory before casting
		const before_items = character.items.map(i => i?.name || null);
		await delay(500);
		game_log("*** Casting line... ***");
		use_skill("fishing");

		let success = false;
		let attempts = 0;

		while (attempts < 30) { // wait up to 30s
			await delay(500);
			attempts++;

			const after_items = character.items.map(i => i?.name || null);
			let changed = false;

			for (let i = 0; i < after_items.length; i++) {
				if (after_items[i] !== before_items[i]) {
					changed = true;
					break;
				}
			}

			if (changed) {
				success = true;
				break;
			}
		}

		if (success) {
			game_log("*** 🎣 Caught something! ***");
		} else {
			game_log("*** ⚠️ No catch or timeout. ***");
		}

		await delay(500);
	}
}

// -------------------------------------------------------------------- //
// SIMPLE MINING SCRIPT WITH AUTO-EQUIP
// -------------------------------------------------------------------- //

async function go_mine() {
	const MINING_SPOT = { map: "tunnel", x: 232, y: -157 };

	// Check if mining is available
	if (!can_use("mining")) {
		game_log("*** Mining cooldown active ***");
		return;
	}

	// Ensure pickaxe is equipped or try to equip it
	if (character.slots.mainhand?.name !== "pickaxe") {
		const pickaxe_index = character.items.findIndex(item => item?.name === "pickaxe");
		if (pickaxe_index === -1) {
			game_log("*** No pickaxe equipped or in inventory ***");
			return;
		}
		game_log("*** Equipping pickaxe... ***");
		await equip(pickaxe_index);
		await delay(500);
	}

	// Confirm it's now equipped
	if (character.slots.mainhand?.name !== "pickaxe") {
		game_log("*** Failed to equip pickaxe ***");
		return;
	}

	// Move to mining spot
	await smart_move(MINING_SPOT);

	while (true) {
		// Final pre-mining checks
		if (!can_use("mining")) {
			await delay(500);
			game_log("*** Mining cooldown active ***");
			break;
		}

		if (character.slots.mainhand?.name !== "pickaxe") {
			await delay(500);
			game_log("*** Pickaxe not equipped or broken ***");
			break;
		}

		// Snapshot inventory before mining
		const before_items = character.items.map(i => i?.name || null);
		await delay(500);
		game_log("*** Starting mining attempt... ***");
		use_skill("mining");

		let success = false;
		let attempts = 0;

		while (attempts < 30) { // wait up to 30s
			await delay(500);
			attempts++;

			const after_items = character.items.map(i => i?.name || null);
			let changed = false;

			for (let i = 0; i < after_items.length; i++) {
				if (after_items[i] !== before_items[i]) {
					changed = true;
					break;
				}
			}

			if (changed) {
				success = true;
				break;
			}
		}

		if (success) {
			game_log("*** ⛏️ Mined something! ***");
		} else {
			game_log("*** ⚠️ No ore mined or timeout. ***");
		}

		await delay(500);
	}
}

// -------------------------------------------------------------------- //
// EXCHANGE ITEMS FOR LOOT
// -------------------------------------------------------------------- //

async function exchange_item(item_name) {
    const TARGET_MAP = "main";
    const TARGET_X = -21;
    const TARGET_Y = -422;
    const RANGE = 50;
    const EXCHANGE_INTERVAL = 6000; // 10 seconds

    // === Move to exchange NPC ===
    await smart_move({ map: TARGET_MAP, x: TARGET_X, y: TARGET_Y });

    // Wait until we're in correct spot and not moving
    while (
        character.map !== TARGET_MAP ||
        Math.abs(character.x - TARGET_X) > RANGE ||
        Math.abs(character.y - TARGET_Y) > RANGE ||
        character.moving
    ) {
        await delay(500);
    }

    game_log("📍 At exchange location. Starting exchange loop...");

    // === Main exchange loop ===
    const interval = setInterval(() => {
        if (character.moving) return; // Skip while moving

        // Stop if inventory is full
        if (character.items.filter(Boolean).length >= character.items.length) {
            game_log("⚠️ Inventory full. Stopping exchange.");
            clearInterval(interval);
            return;
        }

        // Find the slot of the item
        const slot = locate_item(item_name);

        if (slot === -1 || !character.items[slot]) {
            game_log(`✅ No more ${item_name} to exchange. Done.`);
            clearInterval(interval);
            return;
        }

        game_log(`🔁 Exchanging slot ${slot} (${item_name})`);
        exchange(slot);

    }, EXCHANGE_INTERVAL);
}

function hide_skills_ui() {
    const doc = parent.document;

    // Hide skill buttons (bottom right grid)
    const skill_buttons = doc.querySelector("#skillbar");
    if (skill_buttons) skill_buttons.style.display = "none";

    // Hide the right panel (contains skills, info, etc.)
    const right_panel = doc.querySelector("#rightcorner");
    if (right_panel) right_panel.style.display = "none";

    // Optional: Hide the "Stats", "Skills", "Inventory" tab buttons
    const tabs = [
        "#rightcornerbuttonskills",
        "#rightcornerbuttonstats",
        "#rightcornerbuttoninventory"
    ];
    for (const selector of tabs) {
        const btn = doc.querySelector(selector);
        if (btn) btn.style.display = "none";
    }
}

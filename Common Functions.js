
// -------------------------------------------------------------------- //
// CONFIG VARIABLES
// -------------------------------------------------------------------- //

let attack_mode                   = true;
let taunt_mode                    = true;
let fight_as_a_team               = false;
let inventory_check_enabled       = true;

let group_or_solo_button_title    = "Solo";
let taunt_button_title            = "Taunt";

let last_inventory_check          = 0;

const PARTY_CHECK_INTERVAL        = 5000;
let last_party_check              = 0;

const REQUEST_COOLDOWN            = 30000;           // 30 seconds
let last_potion_request           = 0;
const HP_POT_THRESHOLD            = 3000;
const MP_POT_THRESHOLD            = 3000;

const HP_THRESHOLD                = 500;
const MP_THRESHOLD                = 500;

const TAUNT_RANGE                 = 320;

const PARTY_LEADER                = "Ulric";
const PARTY_MEMBERS               = ["Riva", "Myras", "Riff"];

const FOLLOW_DISTANCE             = 150;

const MONSTER_TYPES               = ["goo", "bee", "crab", "snake", "osnake", "bat", "goldenbat", "croc", "arcticbee", "spider", "cgoo", "stoneworm", "jr", "minimush", 
                                     "rat", "bbpompom", "tortoise", "crabx", "porcupine", "armadillo"];
const MERCHANT_NAME               = "Riff";

let last_death_time               = 0;

const FLOATING_BUTTON_IDS         = [];
let gold_history                  = [];

const MERCHANT_TASK_QUEUE         = [];

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
    location_responses[name] = { map: data.map, x: data.x, y: data.y };
    },

    "where_are_you": (name) => {
        send_cm(name, {
            type: "my_location",
            map: character.map,
            x: character.x,
            y: character.y
        });
    },
	
	"what_potions": (name) => {
	    const counts = {};
	
	    for (const pot of POTION_TYPES) {
	        counts[pot] = character.items.reduce((sum, item) => {
	            return item?.name === pot ? sum + (item.q || 1) : sum;
	        }, 0);
	    }
	
	    send_cm(name, { type: "my_potions", ...counts });
	},

    "default": (name, data) => {
        console.warn("Unhandled CM message:", data);
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
// CONSUME POTS
// -------------------------------------------------------------------- //

function pots() {

    // Use health potion if needed
    if (character.max_hp - character.hp >= 400 && can_use("hp")) {
        use("hp"); // small health potion
        // use("hpot1") or use("hpot0") for specific types
    }
    
    // Use mana potion if needed
    if ((character.max_mp - character.mp >= 500 || character.mp < 720) && can_use("mp")) {
        use("mp"); // small mana potion
        // use("mpot1") or use("mpot0") for specific types
    }
}

// -------------------------------------------------------------------- //
// SCAN BANK
// -------------------------------------------------------------------- //

let bank_inventory = [];

/**
 * Scans all available bank tabs using `parent.bank`, if available.
 * Fills `bank_inventory` with metadata: name, level, quantity, tab, slot.
 */
function scan_bank_inventory() {
  if (!parent.bank || !Array.isArray(parent.bank)) {
    game_log("❌ Bank data not available. Open the bank first.");
    return;
  }

  bank_inventory = [];

  for (let tab = 0; tab < parent.bank.length; tab++) {
    const tab_items = parent.bank[tab];
    if (!Array.isArray(tab_items)) continue;

    for (let slot = 0; slot < tab_items.length; slot++) {
      const item = tab_items[slot];
      if (!item) continue;

      bank_inventory.push({
        name: item.name,
        level: item.level ?? 0,
        q: item.q ?? 1,
        tab: tab,
        slot: slot
      });
    }
  }

  game_log(`📦 Bank scan complete: ${bank_inventory.length} items recorded`);
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

    for (let i = 7; i < character.items.length; i++) {
        const item = character.items[i];
        if (item) {
            send_item(merchant_name, i, item.q || 1);
        }
    }

    send_gold(merchant_name, character.gold);
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
        send_to_merchant()

        send_gold("Riff", 999999999); // Optional
        game_log("✅ Sent inventory and gold to merchant");
    } else {
        game_log("⚠️ Merchant not reachable after 10 seconds");
    }
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

// -------------------------------------------------------------------- //
// MAINTAIN POSITION
// -------------------------------------------------------------------- //

let radius_lock_enabled = false;
let radius_lock_origin = null;
let radius_lock_loop = null;
let radius_lock_circle_id = "radius_lock_visual";

function toggle_radius_lock(radius = 200, check_interval = 500) {
	if (radius_lock_enabled) {
		// Disable
		radius_lock_enabled = false;
		radius_lock_origin = null;
		clear_drawings(radius_lock_circle_id);
		if (radius_lock_loop) clearInterval(radius_lock_loop);
		game_log("🔓 Radius lock disabled.");
	} else {
		// Enable
		radius_lock_enabled = true;
		radius_lock_origin = {
			x: Math.round(character.x),
			y: Math.round(character.y)
		};
		game_log(`🔒 Radius lock enabled. Origin set to (${radius_lock_origin.x}, ${radius_lock_origin.y})`);

		// Draw circle (circumference only)
		clear_drawings(radius_lock_circle_id);
		draw_circle(
			radius_lock_origin.x,
			radius_lock_origin.y,
			radius,
			1,
			0x00FFFF,
			radius_lock_circle_id
		);

		// Start loop
		radius_lock_loop = setInterval(async () => {
			if (!radius_lock_enabled) return;

			const dx = character.x - radius_lock_origin.x;
			const dy = character.y - radius_lock_origin.y;
			const dist = Math.hypot(dx, dy);

			if (dist > radius) {
				game_log(`🚨 Out of bounds (${Math.round(dist)} units)! Returning halfway...`);

				parent.stop();

				const mid_x = character.x - dx / 2;
				const mid_y = character.y - dy / 2;

				try {
					await move(mid_x, mid_y);
				} catch (e) {
					game_log("⚠️ Move failed:", e);
				}
			}
		}, check_interval);
	}
}

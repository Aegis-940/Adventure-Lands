
// --------------------------------------------------------------------------------------------------------------------------------- //
// CONFIG VARIABLES
// --------------------------------------------------------------------------------------------------------------------------------- //

// TODO: Clean up unused variables

let attack_mode                   = true;

const PARTY_CHECK_INTERVAL        = 5000;
let last_party_check              = 0;

// For potion deliveries from merchant
const POTION_TYPES = ["mpot1", "hpot1"];

// Merchant collects nth item and above when collecting loot.
const LOOT_THRESHOLD = 7;

const HP_THRESHOLD                = 500;
const MP_THRESHOLD                = 500;

const TAUNT_RANGE                 = 320;

const PARTY_LEADER                = "Ulric";
const PARTY_MEMBERS               = ["Riva", "Myras", "Riff"];

const FOLLOW_DISTANCE             = 150;

const MONSTER_TYPES               = ["goo", "bee", "crab", "snake", "osnake", "bat", "goldenbat", "croc", "arcticbee", "spider", "cgoo", "stoneworm", "jr", "minimush", 
                                     "rat", "bbpompom", "tortoise", "crabx", "porcupine", "armadillo", "squig"];
const MERCHANT_NAME               = "Riff";

let last_death_time               = 0;

const FLOATING_BUTTON_IDS         = [];
let gold_history                  = [];

const MERCHANT_TASK_QUEUE         = [];

// --------------------------------------------------------------------------------------------------------------------------------- //
// GLOBAL FUNCTIONS
// --------------------------------------------------------------------------------------------------------------------------------- //

// Critical function. Must be declared early.
function delay(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

function halt_movement() {
	parent.socket.emit("move", { to: { x: character.x, y: character.y } });
}

// -------------------------------------------------------------------- //
// CM HANDLERS
// -------------------------------------------------------------------- //

const _cmListeners = []; // unified naming

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
			counts[pot] = character.items.reduce((sum, item) =>
				item?.name === pot ? sum + (item.q || 1) : sum, 0);
		}
		send_cm(name, { type: "my_potions", ...counts });
	},

	"do_you_have_loot": (name) => {
		const count = character.items.slice(6).filter(Boolean).length;
		if (count > 0) {
			send_cm(name, { type: "yes_i_have_loot", count });
		}
	},

	"send_loot": async (name) => {
    		await send_to_merchant();
	}
};

// Register the handler dispatcher
add_cm_listener((name, data) => {
	if (!["Ulric", "Riva", "Myras", "Riff"].includes(name)) {
		game_log("❌ Unauthorized CM from " + name);
		return;
	}

	const handler = CM_HANDLERS[data.type] || CM_HANDLERS["default"];
	if (handler) {
		if (handler.constructor.name === "AsyncFunction") {
			handler(name, data).catch(e => console.error("CM async handler error:", e));
		} else {
			try {
				handler(name, data);
			} catch (e) {
				console.error("CM handler error:", e);
			}
		}
	}
});

// --------------------------------------------------------------------------------------------------------------------------------- //
// CONSUME POTS
// --------------------------------------------------------------------------------------------------------------------------------- //

function pots() {
	// Calculate missing HP/MP
	const hpMissing = character.max_hp - character.hp;
	const mpMissing = character.max_mp - character.mp;

	// Use health logic (or priest special)
	if (hpMissing >= 400) {
		if (character.ctype === 'priest') {
			// Priest: top up MP then partyheal
			if (mpMissing >= 500 && can_use("mp")) {
				use("mp");
			}
			if (can_use("partyheal")) {
				use_skill("partyheal");
			}
		} else if (can_use("hp")) {
			// Everyone else: normal HP potion
			use("hp");
		}
	}

	// Use mana potion if needed (non-priest or extra MP for priests)
	if (mpMissing >= 500 || character.mp < 720) {
		if (can_use("mp")) {
			use("mp");
		}
	}
}


// --------------------------------------------------------------------------------------------------------------------------------- //
// SCAN BANK
// --------------------------------------------------------------------------------------------------------------------------------- //

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

// --------------------------------------------------------------------------------------------------------------------------------- //
// TRANSFER LOOT TO MERCHANT
// --------------------------------------------------------------------------------------------------------------------------------- //

async function send_to_merchant() {
    const merchant_name = MERCHANT_NAME;          // "Riff"
    const merchant = get_player(merchant_name);   // ← use get_player, not parent.entities

    if (!merchant || merchant.rip) {
        return game_log("❌ Merchant not found or dead");
    }
    if (merchant.map !== character.map || distance(character, merchant) > 400) {
        return game_log("❌ Merchant not nearby");
    }

    // Send every item in slots ≥ LOOT_THRESHOLD
    for (let i = LOOT_THRESHOLD; i < character.items.length; i++) {
        const item = character.items[i];
        if (item) {
            send_item(merchant_name, i, item.q || 1);
        }
    }
    // Then send all gold
    if (character.gold > 0) {
        send_gold(merchant_name, character.gold);
    }
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// PARTY MANAGER
// --------------------------------------------------------------------------------------------------------------------------------- //

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

// --------------------------------------------------------------------------------------------------------------------------------- //
// BANK ITEM WITHDRAW FUNCTION
// --------------------------------------------------------------------------------------------------------------------------------- //

/**
 * Retrieves items from your bank and brings them back home.
 *
 * @param {string} item_name  – The name of the item to withdraw.
 * @param {number|null} level – (optional) If provided, only withdraw items at this level.
 * @param {number|null} total – (optional) The total quantity to withdraw; omit or null to take all.
 */
async function retrieve_item(item_name, level = null, total = null) {
    const BANK_LOC = { map: "main", x: -300, y: -110 };  // adjust to your bank NPC
    const HOME     = { map: "main", x:  -89, y: -116 };  // your home coords

    // 1) Move to bank
    await smart_move(BANK_LOC);
    await delay(1000);

    // 2) Ensure we have bank data
    const bankData = character.bank;
    if (!bankData) {
        game_log("⚠️ No bank data available. Did you open the bank?");
        return;
    }

    let remaining = (total != null) ? total : Infinity;
    // 3) Iterate through each tab in the bank
    for (const pack in bankData) {
        const slotArr = bankData[pack];
        if (!Array.isArray(slotArr)) continue;

        for (let slot = 0; slot < slotArr.length && remaining > 0; slot++) {
            const itm = slotArr[slot];
            if (!itm || itm.name !== item_name) continue;
            if (level != null && itm.level !== level) continue;

            // how much to take
            const takeQty = Math.min(itm.q || 0, remaining);
            if (takeQty <= 0) continue;

            // 4) Withdraw from bank
            bank_withdraw(slot, takeQty);
            game_log(`🏧 Withdrew ${item_name} x${takeQty} from bank slot ${slot}`);

            remaining -= takeQty;
        }
        if (remaining <= 0) break;
    }

    if (remaining > 0 && total != null && total !== Infinity) {
        const got = total - remaining;
        game_log(`⚠️ Only retrieved ${got}/${total} of ${item_name}`);
    }

    // 5) Return home
    await smart_move(HOME);
    await delay(500);
    game_log("🏠 Returned home after retrieving items.");
}

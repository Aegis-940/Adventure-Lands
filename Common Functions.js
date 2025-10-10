
// --------------------------------------------------------------------------------------------------------------------------------- //
// CONFIG VARIABLES
// --------------------------------------------------------------------------------------------------------------------------------- //

// TODO: Clean up unused variables

let attack_mode                   = true;

// For potion deliveries from merchant
const POTION_TYPES = ["mpot1", "hpot1"];

// Merchant collects nth item and above when collecting loot.
const LOOT_THRESHOLD = 5;

const PARTY_LEADER                = "Ulric";
const PARTY_MEMBERS               = ["Riva", "Myras", "Riff"];

const MONSTER_TYPES               = ["goo", "bee", "crab", "snake", "osnake", "bat", "goldenbat", "croc", "arcticbee", "spider", "cgoo", "stoneworm", "jr", "minimush", 
                                     "rat", "bbpompom", "tortoise", "crabx", "porcupine", "armadillo", "squig", "ghost", "phoenix", "iceroamer", "skeletor", "snowman",
									"prat", "booboo", "bigbird", "poisio", "boar", "mechagnome", "mrpumpkin", "mrgreen", "greenjr"];

const MONSTER_LOCS			   	  = {

	                                spider: { map: "main", x: 907, y: -174 },

									}

const MERCHANT_NAME               = "Riff";

const FLOATING_BUTTON_IDS         = [];

let status_cache = {}; // { characterName: { inventory, mpot1, hpot1, lastSeen } }

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

// Filters out code message logs from the in-game log window
function filter_code_messages_from_log() {
    const codeMsgRegex = /(Sent code message to|Received code message from)/i;
    const $ = parent.$;
    // Hide existing code message entries
    $('.gameentry').each(function() {
        if (codeMsgRegex.test(this.innerHTML)) {
            this.style.display = 'none';
        }
    });
    // Observe future log entries and hide code messages as they appear
    const gamelog = $('#gamelog')[0];
    if (!gamelog) return;
    if (gamelog._codeMsgObserver) return; // Prevent multiple observers
    gamelog._codeMsgObserver = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                if (node.nodeType === 1 && codeMsgRegex.test(node.innerHTML)) {
                    node.style.display = 'none';
                }
            });
        });
    });
    gamelog._codeMsgObserver.observe(gamelog, { childList: true });
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// CM HANDLERS
// --------------------------------------------------------------------------------------------------------------------------------- //

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

const location_responses = {};

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
	if (hpMissing >= 400 && character.ctype !== 'priest' && !is_on_cooldown("use_hp")) {
		if (can_use("hp")) {
			// Everyone else: normal HP potion
			use("hp");
		}
	}

	if (hpMissing >= 720 && character.ctype === 'priest') {
		if (can_use("partyheal")) {
			use_skill("partyheal");
		}
	}

	// Use mana potion if needed (non-priest or extra MP for priests)
	if (mpMissing >= 500 || character.mp < 720 && !is_on_cooldown("use_mp")) {
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
	const merchant_name = MERCHANT_NAME;          // e.g., "Riff"
	const merchant = get_player(merchant_name);   // use get_player for live info

	if (!merchant || merchant.rip) {
		return game_log("❌ Merchant not found or dead");
	}
	if (merchant.map !== character.map || distance(character, merchant) > 400) {
		return game_log("❌ Merchant not nearby");
	}

	// Send every unlocked item in slots ≥ LOOT_THRESHOLD
	for (let i = LOOT_THRESHOLD; i < character.items.length; i++) {
		const item = character.items[i];
		if (item && !item.l) { // Skip locked items
			await delay(10);
			try {
				await send_item(merchant_name, i, item.q || 1);
			} catch (e) {
				game_log(`⚠️ Could not send item in slot ${i}: ${item.name}`);
			}
		}
	}

	// Then send all gold
	if (character.gold > 0) {
		await delay(10);
		try {
			await send_gold(merchant_name, character.gold);
		} catch (e) {
			game_log("⚠️ Could not send gold");
		}
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

// --------------------------------------------------------------------------------------------------------------------------------- //
// MOVE TO CHARACTER'S LOCATION
// --------------------------------------------------------------------------------------------------------------------------------- //

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

// --------------------------------------------------------------------------------------------------------------------------------- //
// HIDE THE USELESS SKILLS BAR
// --------------------------------------------------------------------------------------------------------------------------------- //

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

// --------------------------------------------------------------------------------------------------------------------------------- //
// BANK ITEM WITHDRAW FUNCTION
// --------------------------------------------------------------------------------------------------------------------------------- //

/**
 * Withdraws items from your bank using the native `bank_retrieve` call.
 * Call this while standing at your bank.
 *
 * @param {string} itemName         – The name of the item to withdraw.
 * @param {number|null} level       – (optional) Only withdraw items at this exact level.
 * @param {number|null} total       – (optional) Max total quantity to withdraw; omit to take all.
 */
async function withdraw_item(itemName, level = null, total = null) {
	const BANK_LOC = { map: "bank", x: 0, y: -37 };
	if (character.map !== "bank") {
		await smart_move(BANK_LOC);
	}
	await delay(200);

	// 1) Grab live bank data
	let bankData = character.bank;
	if (!bankData || Object.keys(bankData).length === 0) {
		bankData = load_bank_from_local_storage();
		if (!bankData) {
			game_log("⚠️ No bank data available. Open your bank or save it first.");
			return;
		}
	}

	let remaining = (total != null ? total : Infinity);
	let foundAny  = false;

	// 2) Iterate each "items<N>" pack
	for (const packKey of Object.keys(bankData)) {
		if (!packKey.startsWith("items")) continue;
		const slotArr = bankData[packKey];
		if (!Array.isArray(slotArr)) continue;

		// 3) Scan slots in this pack
		for (let slot = 0; slot < slotArr.length && remaining > 0; slot++) {
			const itm = slotArr[slot];
			if (!itm || itm.name !== itemName) continue;
			if (level != null && itm.level !== level) continue;

			foundAny = true;
			// Decide how many to retrieve (bank_retrieve pulls the entire stack or single item)
			// For non-stackable gear it'll always be 1; remaining logic still honored.
			const takeCount = Math.min(itm.q || 1, remaining);

			for (let i = 0; i < takeCount; i++) {
				await bank_retrieve(packKey, slot, -1);
				await delay(100);
				remaining--;
				if (remaining <= 0) break;
			}
		}

		if (remaining <= 0) break;
	}

	// 4) Summarize
	if (!foundAny) {
		game_log(`⚠️ No "${itemName}"${level != null ? ` level ${level}` : ""} found in bank.`);
	} else if (total != null && remaining > 0) {
		const got = total - remaining;
		game_log(`⚠️ Only retrieved ${got}/${total} of ${itemName}.`);
	}
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// FOLLOW PRIEST
// --------------------------------------------------------------------------------------------------------------------------------- //

let follow_priest_enabled = false;
let follow_priest_interval = null;
let currently_smart_moving = false;

function toggle_follow_priest(state) {
    follow_priest_enabled = state;

    if (state && !follow_priest_interval) {
        follow_priest_loop(); // run immediately
        follow_priest_interval = setInterval(follow_priest_loop, 500);
    } else if (!state && follow_priest_interval) {
        clearInterval(follow_priest_interval);
        follow_priest_interval = null;
    }
}

function request_priest_location() {
    send_cm("Myras", { type: "where_are_you" });
}

async function follow_priest_loop() {
    if (!follow_priest_enabled || character.name === "Myras" || currently_smart_moving) return;

    request_priest_location();
    const priest_location = location_responses["Myras"];
    if (!priest_location) return;
    const { map, x, y } = priest_location;

    if (character.map === map) {
        const dist = Math.hypot(x - character.x, y - character.y);

        if (dist > 15) {
            // Cancel existing move command
            if (character.moving) stop();

            // Move toward priest
            move(x, y);
        }
    } else {
        currently_smart_moving = true;
        try {
            await smart_move({ map, x, y });
        } catch (e) {
            // Smart move failed (e.g. can't path), ignore
        }
        currently_smart_moving = false;
    }
}


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
									"prat", "booboo", "bigbird", "poisio", "boar", "mechagnome", "mrpumpkin", "mrgreen", "greenjr", "fireroamer"];

const MONSTER_LOCS = {
    spider: 	  { map: "main", x: 907, y: -174, orbit: true },
    crab:   	  { map: "main", x: -1197, y: -79, orbit: false },
    fireroamer:   { map: "desertland", x: 116, y: -606, orbit: true },
    cgoo:         { map: "level2s", x: 10, y: 500, orbit: true },
    bbpompop:     { map: "winter_cave", x: -82, y: -949, orbit: true },
    booboo:       { map: "spookytown", x: 370, y: -790, orbit: true }
};

const HEALER_TARGET = MONSTER_LOCS.booboo;
const WARRIOR_TARGET = MONSTER_LOCS.booboo;
const RANGER_TARGET  = MONSTER_LOCS.crab;

const FLOATING_BUTTON_IDS = [];

const SOFT_RESTART_TIMER = 60000;    // 1 minute
const HARD_RESET_TIMER   = 240000;   // 4 minutes

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


// --------------------------------------------------------------------------------------------------------------------------------- //
// GLOBAL WATCHDOG
// --------------------------------------------------------------------------------------------------------------------------------- //

// Global Watchdog Monitor
let last_activity_time = Date.now();
let last_soft_restart_time = 0;
let last_hard_reset_time = 0;
let is_active = null;

async function passive_activity_monitor() {
    let last_mp = character.mp;
    let last_hpots = character.items.filter(it => it && it.name === "hpot1").reduce((sum, it) => sum + (it.q || 1), 0);
    let last_mpots = character.items.filter(it => it && it.name === "mpot1").reduce((sum, it) => sum + (it.q || 1), 0);

    while (true) {
        is_active = false;

        // 1. Smart moving
        if (smart.moving) is_active = true;

        // 2. Mana changed (any change up or down)
        if (character.mp !== last_mp) is_active = true;

        // 3. HP/MP potions used (count decreased)
        let current_hpots = character.items.filter(it => it && it.name === "hpot1").reduce((sum, it) => sum + (it.q || 1), 0);
        let current_mpots = character.items.filter(it => it && it.name === "mpot1").reduce((sum, it) => sum + (it.q || 1), 0);

        if (current_hpots < last_hpots) is_active = true;
        if (current_mpots < last_mpots) is_active = true;

        if (is_active) last_activity_time = Date.now();

        last_mp = character.mp;
        last_hpots = current_hpots;
        last_mpots = current_mpots;
        await delay(1000); // Check every second
    }
}

async function watchdog_loop() {
    function safely_call(fnName, ...args) {
        try {
            const fn = typeof window !== "undefined" ? window[fnName] : parent[fnName];
            if (typeof fn === "function") return fn(...args);
        } catch (e) {
            log(`⚠️ Could not call ${fnName}: ${e.message}`, "#FF8800", "Errors");
        }
    }

    while (true) {
        await delay(5000); // check every 5 seconds
        const now = Date.now();

        // Hard reset if inactive for 2 minutes
        if (now - last_activity_time > HARD_RESET_TIMER && now - last_hard_reset_time > HARD_RESET_TIMER) {
            log("🔄 Hard reset: Reloading page due to persistent inactivity.", "#ff0000", "Alerts");
            last_hard_reset_time = now;
            parent.window.location.reload();
            // No need to reset last_activity_time here, page will reload
        }
        // Soft restart if inactive for 30 seconds, but not more than once every 30s
        else if (
            now - last_activity_time > SOFT_RESTART_TIMER &&
            now - last_soft_restart_time > SOFT_RESTART_TIMER
        ) {
            log("⚠️ Inactivity detected! Attempting to restart main loops...", "#ff8800", "Alerts");
            last_soft_restart_time = now;
            try {
                safely_call("stop_attack_loop");
                safely_call("stop_heal_loop");
                safely_call("stop_move_loop");
                safely_call("stop_skill_loop");
                safely_call("stop_panic_loop");
                safely_call("stop_boss_loop");
                safely_call("stop_orbit_loop");
                safely_call("stop_status_cache_loop");
                await delay(500);

                log("✅ Main loops restarted by watchdog.", "#00ff00", "Alerts");
                log("Moving to target location...", "#00ff00", "Alerts");

                // Move to respective character's target location (concise, by name)
                if (character.name === "Myras") {
                    await smart_move(HEALER_TARGET);
                } else if (character.name === "Ulric") {
                    await smart_move(WARRIOR_TARGET);
                } else if (character.name === "Riva") {
                    await smart_move(RANGER_TARGET);
                }
            } catch (e) {
                catcher(e, "Watchdog restart error");
            }
        }
    }
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
// SUPPORT FUNCTIONS
// --------------------------------------------------------------------------------------------------------------------------------- //

function ms_to_next_skill(skill) {
	const next_skill = parent.next_skill[skill]
	if (next_skill == undefined) return 0
	const ms = parent.next_skill[skill].getTime() - Date.now() - Math.min(...parent.pings) - character.ping;
	return ms < 0 ? 0 : ms;
}

function get_nearest_monster_v2(args = {}) {
	let min_d = 999999, target = null;
	let optimal_hp = args.check_max_hp ? 0 : 999999999;

	for (let id in parent.entities) {
		let current = parent.entities[id];
		if (current.type != "monster" || !current.visible || current.dead) continue;

		if (args.type) {
			if (Array.isArray(args.type)) {
				if (!args.type.includes(current.mtype)) continue;
			} else {
				if (current.mtype !== args.type) continue;
			}
		}

		if (args.min_level !== undefined && current.level < args.min_level) continue;
		if (args.max_level !== undefined && current.level > args.max_level) continue;
		if (args.target && !args.target.includes(current.target)) continue;
		if (args.no_target && current.target) continue;

		if (args.statusEffects && !args.statusEffects.every(effect => current.s[effect])) continue;

		if (args.min_xp !== undefined && current.xp < args.min_xp) continue;
		if (args.max_xp !== undefined && current.xp > args.max_xp) continue;

		if (args.max_att !== undefined && current.attack > args.max_att) continue;

		if (args.path_check && !can_move_to(current)) continue;

		let c_dist = args.point_for_distance_check
			? Math.hypot(args.point_for_distance_check[0] - current.x, args.point_for_distance_check[1] - current.y)
			: parent.distance(character, current);

		if (args.max_distance !== undefined && c_dist > args.max_distance) continue;

		if (args.check_min_hp || args.check_max_hp) {
			let c_hp = current.hp;
			if ((args.check_min_hp && c_hp < optimal_hp) || (args.check_max_hp && c_hp > optimal_hp)) {
				optimal_hp = c_hp;
				target = current;
			}
			continue;
		}
		
		if (c_dist < min_d) {
			min_d = c_dist;
			target = current;
		}
	}
	return target;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// STATUS CACHE LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

async function status_cache_loop() {
    LOOP_STATES.cache = true;
    let delayMs = 5000;

        while (true) {
            if (!LOOP_STATES.cache) {
                await delay(100);
                continue;
            }
            let inventory_count = 0, mpot1_count = 0, hpot1_count = 0, map = "", x = 0, y = 0;
            try { inventory_count = character.items.filter(Boolean).length; } catch (e) {}
            try { mpot1_count = character.items.filter(it => it && it.name === "mpot1").reduce((sum, it) => sum + (it.q || 1), 0); } catch (e) {}
            try { hpot1_count = character.items.filter(it => it && it.name === "hpot1").reduce((sum, it) => sum + (it.q || 1), 0); } catch (e) {}
            try { map = character.map; x = character.x; y = character.y; } catch (e) {}

            // Only send status if inventory is 20+ or either potion is below 2000
            if (
                inventory_count >= 30 ||
                mpot1_count < 2000 ||
                hpot1_count < 2000
            ) {
                try {
                    send_cm("Riff", {
                        type: "status_update",
                        data: {
                            name: character.name,
                            inventory: inventory_count,
                            mpot1: mpot1_count,
                            hpot1: hpot1_count,
                            map: map,
                            x: x,
                            y: y,
                            lastSeen: Date.now()
                        }
                    });
                } catch (e) {
                    catcher(e, "Error sending status to Riff: ");
                }
            }

            await delay(delayMs);
        }

}

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
	const merchant_name = "Riff";          // e.g., "Riff"
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
			await delay(150);
			try {
				send_item(merchant_name, i, item.q || 1);
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
// ERROR CATCHER
// --------------------------------------------------------------------------------------------------------------------------------- //

const CRITICAL_ERROR = "#ff1100ff";
const GENERAL_ERROR = "#ffa127ff";

function catcher(e, context = "Error") {
    // Map keywords to either a shorthand function or [shorthand, color]
    const keywordMap = {
        "attack cooldown": [
            (msg, ctx) => {
                if (msg.toLowerCase().includes("attack") && msg.toLowerCase().includes("cooldown") && msg.toLowerCase().includes("ms")) {
                    let msMatch = msg.match(/"ms":\s*(\d+)/) || msg.match(/ms[:=]\s*(\d+)/i);
                    let msText = msMatch ? `, ${msMatch[1]}ms` : "";
                    return `Attack c/d${msText} (${ctx})`;
                }
                return null;
            },
            GENERAL_ERROR
        ],
        "3shot cooldown": [
            (msg, ctx) => {
                if (msg.toLowerCase().includes("3shot") && msg.toLowerCase().includes("cooldown") && msg.toLowerCase().includes("ms")) {
                    let msMatch = msg.match(/"ms":\s*(\d+)/) || msg.match(/ms[:=]\s*(\d+)/i);
                    let msText = msMatch ? `, ${msMatch[1]}ms` : "";
                    return `3-Shot c/d${msText} (${ctx})`;
                }
                return null;
            },
            GENERAL_ERROR
        ],
        "5shot cooldown": [
            (msg, ctx) => {
                if (msg.toLowerCase().includes("5shot") && msg.toLowerCase().includes("cooldown") && msg.toLowerCase().includes("ms")) {
                    let msMatch = msg.match(/"ms":\s*(\d+)/) || msg.match(/ms[:=]\s*(\d+)/i);
                    let msText = msMatch ? `, ${msMatch[1]}ms` : "";
                    return `5-Shot c/d${msText} (${ctx})`;
                }
                return null;
            },
            GENERAL_ERROR
        ],
        "supershot cooldown": [
            (msg, ctx) => {
                if (msg.toLowerCase().includes("supershot") && msg.toLowerCase().includes("cooldown") && msg.toLowerCase().includes("ms")) {
                    let msMatch = msg.match(/"ms":\s*(\d+)/) || msg.match(/ms[:=]\s*(\d+)/i);
                    let msText = msMatch ? `, ${msMatch[1]}ms` : "";
                    return `Super Shot c/d${msText} (${ctx})`;
                }
                return null;
            },
            GENERAL_ERROR
        ],
        "huntersmark cooldown": [
            (msg, ctx) => {
                if (msg.toLowerCase().includes("huntersmark") && msg.toLowerCase().includes("cooldown") && msg.toLowerCase().includes("ms")) {
                    let msMatch = msg.match(/"ms":\s*(\d+)/) || msg.match(/ms[:=]\s*(\d+)/i);
                    let msText = msMatch ? `, ${msMatch[1]}ms` : "";
                    return `Hunters Mark c/d${msText} (${ctx})`;
                }
                return null;
            },
            GENERAL_ERROR
        ],
        "heal cooldown": [
            (msg, ctx) => {
                if (msg.toLowerCase().includes("heal") && msg.toLowerCase().includes("cooldown") && msg.toLowerCase().includes("ms")) {
                    let msMatch = msg.match(/"ms":\s*(\d+)/) || msg.match(/ms[:=]\s*(\d+)/i);
                    let msText = msMatch ? `, ${msMatch[1]}ms` : "";
                    return `Heal c/d${msText} (${ctx})`;
                }
                return null;
            },
            GENERAL_ERROR
        ],
        "missing monster": [
            (msg, ctx) => {
                if (msg.toLowerCase().includes("not_there")) {
                    return `Monster already dead (${ctx})`;
                }
                return null;
            },
            GENERAL_ERROR
        ],
        "out of range": [
            (msg, ctx) => {
                if (msg.toLowerCase().includes("too_far")) {
                    return `Monster out of range (${ctx})`;
                }
                return null;
            },
            GENERAL_ERROR
        ],
        "out of mana": [
            (msg, ctx) => {
                if (msg.toLowerCase().includes("no_mp")) {
                    return `Out of mana (${ctx})`;
                }
                return null;
            },
            GENERAL_ERROR
        ],
        // Add more as needed
    };

    // Robust error message extraction
    let msg;
    if (typeof e === "string") {
        msg = e;
    } else if (e && e.message) {
        msg = e.message;
    } else {
        try {
            msg = JSON.stringify(e);
        } catch {
            msg = String(e);
        }
    }

    // Check for keywords and print shorthand if matched
    for (const [keyword, value] of Object.entries(keywordMap)) {
        if (Array.isArray(value)) {
            const [handlerOrStr, color] = value;
            if (typeof handlerOrStr === "function") {
                const result = handlerOrStr(msg, context);
                if (result) {
                    log(result, color, "Errors");
                    return;
                }
            } else if (msg && msg.toLowerCase().includes(keyword)) {
                log(`${handlerOrStr} (${context})`, color, "Errors");
                return;
            }
        }
    }

    // Default: print full error and stack trace if available
    let stack = "";
    if (e && e.stack) {
        stack = `\nStack trace:\n${e.stack}`;
    }
    log(`⚠️ ${context}: ${msg}${stack}`, "#FF0000", "Errors");
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// CUSTOM GAME LOG
// --------------------------------------------------------------------------------------------------------------------------------- //

function create_custom_log_window() {
    // Only create if it doesn't exist
    if (parent.document.getElementById("custom-log-window")) return;

    const doc = parent.document;

    // Create main window
    const div = doc.createElement("div");
    div.id = "custom-log-window";
    div.style.position = "absolute";
    div.style.bottom = "1px";
    div.style.right = "325px";
    div.style.width = "350px";
    div.style.height = "260px";
    div.style.background = "rgba(0,0,0,0.66)";
    div.style.color = "#fff";
    div.style.overflow = "hidden";
    div.style.zIndex = 9999;
    div.style.fontSize = "22px";
    div.style.fontFamily = "pixel";
    div.style.padding = "0";
    div.style.border = "4px solid #888";
    div.style.display = "flex";
    div.style.flexDirection = "column";

    // --- Tabs ---
    const tabBar = doc.createElement("div");
    tabBar.style.display = "flex";
    tabBar.style.background = "#222";
    tabBar.style.borderBottom = "2px solid #888";
    tabBar.style.height = "32px";
    tabBar.style.alignItems = "center";

    const tabs = [
        { name: "All", id: "tab-all" },
        { name: "General", id: "tab-general" },
        { name: "Alerts", id: "tab-alerts" },
        { name: "Errors", id: "tab-errors" }
    ];

    // Store current tab in window
    div._currentTab = "All";

    // --- Log containers for each tab ---
    const logContainers = {};
    const alertStates = {};
    // For checkboxes: which tabs are included in "All"
    const includeInAll = {
        "General": true,
        "Alerts": true,
        "Errors": true
    };

    // Store all log entries for each tab for dynamic All tab updates
    const logHistory = {
        "General": [],
        "Alerts": [],
        "Errors": []
    };

    for (const tab of tabs) {
        const tabDiv = doc.createElement("div");
        tabDiv.id = `custom-log-${tab.id}`;
        tabDiv.style.flex = "1";
        tabDiv.style.overflowY = "auto";
        tabDiv.style.display = tab.name === "All" ? "block" : "none";
        tabDiv.style.height = "100%";
        div.appendChild(tabDiv);
        logContainers[tab.name] = tabDiv;
        alertStates[tab.name] = false;
    }

    // --- Tab buttons with alert indicators and checkboxes ---
    for (const tab of tabs) {
        const btn = doc.createElement("button");
        btn.textContent = tab.name;
        btn.style.flex = "1";
        btn.style.height = "100%";
        btn.style.background = tab.name === "All" ? "#444" : "#222";
        btn.style.color = "#fff";
        btn.style.border = "none";
        btn.style.fontFamily = "pixel";
        btn.style.fontSize = "20px";
        btn.style.cursor = "pointer";
        btn.id = `btn-${tab.id}`;
        btn.style.display = "flex";
        btn.style.alignItems = "center";
        btn.style.justifyContent = "center";
        btn.style.position = "relative";

        // Alert indicator span
        const alertSpan = doc.createElement("span");
        alertSpan.textContent = "";
        alertSpan.style.color = "#fff";
        alertSpan.style.marginLeft = "8px";
        alertSpan.style.fontWeight = "bold";
        alertSpan.id = `alert-${tab.id}`;
        btn.appendChild(alertSpan);

        // Add checkbox for General, Alerts, and Errors tabs
        if (tab.name !== "All") {
            const checkbox = doc.createElement("input");
            checkbox.type = "checkbox";
            checkbox.checked = true;
            checkbox.style.marginLeft = "6px";
            checkbox.style.transform = "scale(1.2)";
            checkbox.title = `Include ${tab.name} messages in All tab`;
            checkbox.onclick = (e) => {
                includeInAll[tab.name] = checkbox.checked;
                updateAllTab(logContainers, logHistory, includeInAll);
            };
            btn.appendChild(checkbox);
        }

        btn.onclick = () => {
            // Switch tab
            div._currentTab = tab.name;
            for (const t of tabs) {
                logContainers[t.name].style.display = t.name === tab.name ? "block" : "none";
                tabBar.querySelector(`#btn-${t.id}`).style.background = t.name === tab.name ? "#444" : "#222";
                // Clear alert when tab is viewed
                const alertElem = tabBar.querySelector(`#alert-${t.id}`);
                if (alertElem) alertElem.textContent = "";
                alertStates[t.name] = false;
            }
        };
        tabBar.appendChild(btn);
    }

    div.appendChild(tabBar);

    // Move log containers after tab bar
    for (const tab of tabs) {
        div.appendChild(logContainers[tab.name]);
    }

    doc.body.appendChild(div);

    // Store containers, alert state, includeInAll, and logHistory globally for log() to use
    parent._custom_log_tabs = logContainers;
    parent._custom_log_window = div;
    parent._custom_log_alerts = alertStates;
    parent._custom_log_includeInAll = includeInAll;
    parent._custom_log_history = logHistory;
}

// Helper to update the All tab when checkboxes change
function updateAllTab(logContainers, logHistory, includeInAll) {
    const allDiv = logContainers["All"];
    allDiv.innerHTML = "";
    let allEntries = [];
    for (const tabName of ["General", "Alerts", "Errors"]) {
        if (includeInAll[tabName]) {
            allEntries = allEntries.concat(logHistory[tabName]);
        }
    }
    // Sort by timestamp (oldest first)
    allEntries.sort((a, b) => a.time - b.time);
    // Only keep the most recent 100
    allEntries = allEntries.slice(-100);
    for (const entry of allEntries) {
        const p = parent.document.createElement("div");
        p.textContent = entry.text;
        p.style.color = entry.color;
        p.style.padding = "2px";
        allDiv.appendChild(p);
    }
    allDiv.scrollTop = allDiv.scrollHeight;
}

// Modified log function to support All tab and checkboxes
function log(msg, color = "#fff", type = "General") {
    create_custom_log_window();
    const logContainers = parent._custom_log_tabs;
    const div = parent._custom_log_window;
    const alertStates = parent._custom_log_alerts;
    const includeInAll = parent._custom_log_includeInAll;
    const logHistory = parent._custom_log_history;

    // Support "General", "Alerts", "Errors" as valid types
    let tabName = "General";
    if (type === "Errors") tabName = "Errors";
    else if (type === "Alerts") tabName = "Alerts";

    const logDiv = logContainers[tabName];

    const time = Date.now();
    const text = `[${new Date(time).toLocaleTimeString()}] ${msg}`;

    // Store in history for this tab
    if (!logHistory[tabName]) logHistory[tabName] = [];
    logHistory[tabName].push({ text, color, time });
    // Keep only the most recent 100 messages per tab
    while (logHistory[tabName].length > 100) logHistory[tabName].shift();

    // Add to tab display
    const p = parent.document.createElement("div");
    p.textContent = text;
    p.style.color = color;
    p.style.padding = "2px";
    logDiv.appendChild(p);
    while (logDiv.children.length > 100) logDiv.removeChild(logDiv.firstChild);

    // If this tab is visible, scroll to bottom
    if (div._currentTab === tabName) {
        logDiv.scrollTop = logDiv.scrollHeight;
    } else {
        // Show alert (!) if new message arrives in a hidden tab
        if (!alertStates[tabName]) {
            const alertElem = parent.document.getElementById(`alert-tab-${tabName.toLowerCase()}`);
            if (alertElem) alertElem.textContent = "*";
            alertStates[tabName] = true;
        }
    }

    // Also log to All tab if enabled for this type
    if (tabName !== "All" && includeInAll[tabName]) {
        // Add to All history and update All tab
        if (!logHistory["All"]) logHistory["All"] = [];
        logHistory["All"].push({ text, color, time, source: tabName });
        // Only keep the most recent 100 in All history
        while (logHistory["All"].length > 100) logHistory["All"].shift();
        updateAllTab(logContainers, logHistory, includeInAll);
    }
}
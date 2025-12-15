
// --------------------------------------------------------------------------------------------------------------------------------- //
// CONFIG VARIABLES
// --------------------------------------------------------------------------------------------------------------------------------- //

// TODO: Clean up unused variables

let attack_mode                   = true;

// For potion deliveries from merchant
const POTION_TYPES = ["mpot1", "hpot1"];

// Merchant collects nth item and above when collecting loot.
const LOOT_THRESHOLD = 6;

const PARTY_LEADER                = "Ulric";
const PARTY_MEMBERS               = ["Riva", "Myras", "Riff"];

const MONSTER_TYPES               = ["goo", "bee", "crab", "snake", "osnake", "bat", "goldenbat", "croc", "arcticbee", "spider", "cgoo", "stoneworm", "jr", "minimush", 
                                     "rat", "bbpompom", "tortoise", "crabx", "porcupine", "armadillo", "squig", "ghost", "phoenix", "iceroamer", "skeletor", "snowman",
									"prat", "booboo", "bigbird", "poisio", "boar", "mechagnome", "mrpumpkin", "mrgreen", "greenjr", "fireroamer", "dryad"];

const MONSTER_LOCS = {
    spider: 	  { map: "main", x: 907, y: -174, orbit: true , hostile: false },
    crab:   	  { map: "main", x: -1197, y: -79, orbit: false , hostile: false },
    fireroamer:   { map: "desertland", x: 116, y: -606, orbit: true , hostile: false },
    cgoo:         { map: "level2s", x: 10, y: 500, orbit: true , hostile: false },
    bbpompop:     { map: "winter_cave", x: -82, y: -949, orbit: true , hostile: false },
    booboo:       { map: "spookytown", x: 370, y: -790, orbit: true , hostile: true },
    ghost:        { map: "halloween", x: 229, y: -1203, orbit: true , hostile: false },
    prat:         { map: "level1", x: 89, y: 199, orbit: true , hostile: false },
    dryad:        { map: "mforest", x: 380, y: -359, orbit: true , hostile: false },
};

const HEALER_TARGET    = MONSTER_LOCS.dryad;
const WARRIOR_TARGET   = MONSTER_LOCS.dryad;
const RANGER_TARGET    = MONSTER_LOCS.dryad;
const MERCHANT_TARGET  = { map: "main", x: -87, y: -96 };

const FLOATING_BUTTON_IDS = [];

const SOFT_RESTART_TIMER = 60000;    // 1 minute
const HARD_RESET_TIMER   = 90000;    // 1.5 minutes


// --------------------------------------------------------------------------------------------------------------------------------- //
// LOOP TOGGLES
// --------------------------------------------------------------------------------------------------------------------------------- //

let ATTACK_LOOP_ENABLED       = false;
let HEAL_LOOP_ENABLED         = true;
let MOVE_LOOP_ENABLED         = false;
let SKILL_LOOP_ENABLED        = true;
let PANIC_LOOP_ENABLED        = true;
let BOSS_LOOP_ENABLED         = false;
let ORBIT_LOOP_ENABLED        = false;
let POTION_LOOP_ENABLED       = true;
let LOOT_LOOP_ENABLED         = true;
let STATUS_CACHE_LOOP_ENABLED = true;

// --------------------------------------------------------------------------------------------------------------------------------- //
// GLOBAL FUNCTIONS
// --------------------------------------------------------------------------------------------------------------------------------- //

// Critical function. Must be declared early.
function delay(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

let timeout_interval = 30000; // Default timeout of 30 seconds

async function with_timeout(
  promise,
  timeout_interval = Math.max(...parent.pings),
) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(resolve, timeout_interval)),
  ]);
}

function halt_movement() {
	parent.socket.emit("move", { to: { x: character.x, y: character.y } });
}

/**
 * Improved smarter_move function.
 * - Returns a Promise that always resolves or rejects.
 * - Handles interruptions and timeouts gracefully.
 * - Allows for external interruption via halt_movement or a global flag.
 * - Provides better error messages and status.
 */
function smarter_move(destination, on_done, options = {}) {
    // Cancel any previous smarter_move
    if (smart.moving && typeof smart._interrupt === "function") {
        smart._interrupt("interrupted");
    }

    // Internal state
    let interrupted = false;
    let interruptReason = null;
    let resolveFn, rejectFn;
    let timeoutId = null;

    // Default timeout: 120 seconds
    const MOVE_TIMEOUT = options.timeout || 120000;

    // Helper to interrupt movement
    smart._interrupt = (reason = "interrupted") => {
        interrupted = true;
        interruptReason = reason;
        smart.moving = false;
        if (timeoutId) clearTimeout(timeoutId);
        if (typeof on_done === "function") on_done(false, reason);
        if (rejectFn) rejectFn({ success: false, reason });
    };

    // Helper to complete movement
    function complete(success = true, reason = null) {
        smart.moving = false;
        if (timeoutId) clearTimeout(timeoutId);
        if (typeof on_done === "function") on_done(success, reason);
        if (success && resolveFn) resolveFn({ success: true });
        else if (rejectFn) rejectFn({ success: false, reason });
    }

    // Validate destination
    let target = {};
    if (typeof destination === "string") target = { to: destination };
    else if (typeof destination === "number") target = { x: destination, y: on_done }, on_done = null;
    else if (typeof destination === "object") target = { ...destination };
    else return Promise.reject({ reason: "invalid destination" });

    // Set up target coordinates
    if ("x" in target) {
        smart.map = target.map || character.map;
        smart.x = target.x;
        smart.y = target.y;
    } else if ("to" in target || "map" in target) {
        // ...existing logic for resolving named locations...
        // For brevity, you can copy your original location resolution logic here.
        // If not found, return rejecting promise.
        // Example:
        if (!G.maps[target.to || target.map]) {
            return Promise.reject({ reason: "invalid location" });
        }
        smart.map = target.to || target.map;
        smart.x = G.maps[smart.map].spawns[0][0];
        smart.y = G.maps[smart.map].spawns[0][1];
    } else {
        return Promise.reject({ reason: "invalid destination" });
    }

    // Start movement
    smart.moving = true;
    smart.plot = [];
    smart.flags = {};
    smart.searching = smart.found = false;

    // Movement monitoring loop
    function monitorMovement() {
        // If interrupted, exit
        if (interrupted) return;

        // If arrived at destination
        if (
            character.map === smart.map &&
            Math.hypot(character.x - smart.x, character.y - smart.y) < (options.radius || 10)
        ) {
            complete(true);
            return;
        }

        // If movement stopped unexpectedly
        if (!smart.moving) {
            complete(false, "movement stopped");
            return;
        }

        // Continue monitoring
        setTimeout(monitorMovement, 200);
    }

    // Start monitoring
    setTimeout(monitorMovement, 200);

    // Timeout handler
    timeoutId = setTimeout(() => {
        smart._interrupt("timeout");
    }, MOVE_TIMEOUT);

    // Return a Promise that resolves/rejects on completion/interruption
    return new Promise((resolve, reject) => {
        resolveFn = resolve;
        rejectFn = reject;
    });
}

// Usage example:
// let movePromise = smarter_move({ map: "main", x: 100, y: 100 }, null, { timeout: 30000, radius: 20 });
// To interrupt: smart._interrupt("manual stop");

// --------------------------------------------------------------------------------------------------------------------------------- //
// GLOBAL WATCHDOG
// --------------------------------------------------------------------------------------------------------------------------------- //



// --------------------------------------------------------------------------------------------------------------------------------- //
// UNIVERSAL LOOP CONTROL
// --------------------------------------------------------------------------------------------------------------------------------- //

// --- Helper: Boss alive check ---
function is_boss_alive() {
    return BOSSES.some(name => {
        const s = parent.S[name];
        return (
            s &&
            s.live === true
        );
    });
}

const STATES = {
    DEAD: "dead",
    PANIC: "panic",
    BOSS: "boss",
    NORMAL: "normal"
};

function get_character_state() {
    if (character.rip) return STATES.DEAD;
    if (panicking) return STATES.PANIC;
    if (is_boss_alive()) return STATES.BOSS;
    return STATES.NORMAL;
}

let handling_death = false;

async function set_state(state) {

    try {
        // Always-on loops
        if (!POTION_LOOP_ENABLED)       POTION_LOOP_ENABLED = true;
        if (!STATUS_CACHE_LOOP_ENABLED) STATUS_CACHE_LOOP_ENABLED = true;
        if (!HEAL_LOOP_ENABLED)         HEAL_LOOP_ENABLED = true;

        // Helper for movement target
        function get_main_target() {
            if (character.name === "Ulric") return WARRIOR_TARGET;
            if (character.name === "Riva") return RANGER_TARGET;
            if (character.name === "Myras") return HEALER_TARGET;
        }

        // State-specific
        switch (state) {
            case STATES.DEAD:
                if (!handling_death) {
                    handling_death = true;
                    try {

                        log("Respawning in 20s...", "red");
                        await delay(20000);
                        if (character.rip) await respawn();
                        await delay(1000);

                        smarter_move(get_main_target());

                        // Re-evaluate state after respawn
                        const NEW_STATE = get_character_state();
                        set_state(NEW_STATE);
                        
                    } catch (e) {
                        catcher(e, "set_state: DEAD state error");
                    }
                    handling_death = false;
                }
                break;

            case STATES.PANIC:
                try {
                    ATTACK_LOOP_ENABLED = false;
                    SKILL_LOOP_ENABLED = false;
                    BOSS_LOOP_ENABLED = false;
                } catch (e) {
                    catcher(e, "set_loops: PANIC state error");
                }
                break;

            case STATES.BOSS:
                try {
                    if (ATTACK_LOOP_ENABLED) ATTACK_LOOP_ENABLED = false;
                    if (SKILL_LOOP_ENABLED)  SKILL_LOOP_ENABLED = false;
                    if (ORBIT_LOOP_ENABLED)  ORBIT_LOOP_ENABLED = false;

                    if (!BOSS_LOOP_ENABLED) BOSS_LOOP_ENABLED = true;
                } catch (e) {
                    catcher(e, "set_loops: BOSS state error");
                }
                break;

            case STATES.NORMAL:
                try {
                    if (BOSS_LOOP_ENABLED)    BOSS_LOOP_ENABLED = false;
                    if (!SKILL_LOOP_ENABLED)  SKILL_LOOP_ENABLED = true;
                    if (!ATTACK_LOOP_ENABLED) ATTACK_LOOP_ENABLED = true;

                    // Orbit logic
                    const target = get_main_target();
                    if (target.orbit) {
                        const at_target = character.x === target.x && character.y === target.y;
                        const near_target = parent.distance(character, target) <= 50;

                        // Only start moving if not already moving, not orbiting, and NOT already at target
                        if (near_target && !at_target && !ORBIT_LOOP_ENABLED && !smart.moving) {
                            smarter_move(target).catch(e => log("Orbit move error: " + e));
                        }

                        // Only start orbit if at target and not already orbiting
                        if (!ORBIT_LOOP_ENABLED && at_target) {
                            ORBIT_LOOP_ENABLED = true;
                        }
                    }
                } catch (e) {
                    catcher(e, "set_state: NORMAL state error");
                }
                break;
        }
    } catch (e) {
        catcher(e, "set_loops: Global error");
    }
}

async function loop_controller() {
    while (true) {
        try {
            const state = get_character_state();
            await set_state(state);
        } catch (e) {
            catcher(e, "Loop Controller error");
        }
        await delay(250);
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
    STATUS_CACHE_LOOP_ENABLED = true;
    let delayMs = 5000;

        while (true) {
            if (!STATUS_CACHE_LOOP_ENABLED) {
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

		smarter_move({ map, x, y });
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
		await smarter_move(BANK_LOC);
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
    div.style.right = "700px";
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
    div.style.cursor = "default";

    // --- Drag logic ---
    let isDragging = false, dragOffsetX = 0, dragOffsetY = 0;

    // Drag handle (top bar)
    const dragHandle = doc.createElement("div");
    dragHandle.style.height = "18px";
    dragHandle.style.background = "#444";
    dragHandle.style.cursor = "move";
    dragHandle.style.display = "flex";
    dragHandle.style.alignItems = "center";
    dragHandle.style.justifyContent = "flex-start";
    dragHandle.style.paddingLeft = "8px";
    dragHandle.style.fontSize = "16px";
    dragHandle.style.fontFamily = "pixel";
    dragHandle.style.color = "#fff";
    dragHandle.textContent = "Custom Log";

    dragHandle.onmousedown = function (e) {
        isDragging = true;
        dragOffsetX = e.clientX - div.offsetLeft;
        dragOffsetY = e.clientY - div.offsetTop;
        doc.body.style.userSelect = "none";
    };

    doc.onmousemove = function (e) {
        if (isDragging) {
            div.style.left = (e.clientX - dragOffsetX) + "px";
            div.style.top = (e.clientY - dragOffsetY) + "px";
            div.style.right = ""; // Unset right when dragging
            div.style.bottom = ""; // Unset bottom when dragging
        }
    };

    doc.onmouseup = function () {
        isDragging = false;
        doc.body.style.userSelect = "";
    };

    div.appendChild(dragHandle);

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

// --------------------------------------------------------------------------------------------------------------------------------- //
// PANIC BUTTON!!!
// --------------------------------------------------------------------------------------------------------------------------------- //

let panicking = false;

let LOW_HEALTH = 0;
let LOW_MANA = 0;
let HIGH_HEALTH = 0;
let HIGH_MANA = 0;
let MONSTERS_TARGETING_ME = 0;

async function panic_loop() {
    
    let delayMs = 100;

    while (true) { 
        // Check if panic loop is enabled
        if (!PANIC_LOOP_ENABLED) {
            if (panicking) panicking = false;
            await delay(delayMs);
            continue;
        }
        // --- Panic/Safe Conditions ---
        LOW_HEALTH = character.hp < character.max_hp * PANIC_HP_THRESHOLD;
        LOW_MANA = character.mp < PANIC_MP_THRESHOLD;
        HIGH_HEALTH = character.hp >= character.max_hp * SAFE_HP_THRESHOLD;
        HIGH_MANA = character.mp >= SAFE_MP_THRESHOLD;

        // Aggro check: monsters targeting me
        MONSTERS_TARGETING_ME = Object.values(parent.entities).filter(
            e => e.type === "monster" && e.target === character.name && !e.dead
        ).length;

        // PANIC CONDITION
        if (LOW_HEALTH || LOW_MANA || MONSTERS_TARGETING_ME >= PANIC_AGGRO_THRESHOLD) {
            if (!panicking) {
                panicking = true;
                let reason = [];
                if (LOW_HEALTH) reason.push("low health");
                if (LOW_MANA) reason.push("low mana");
                if (MONSTERS_TARGETING_ME >= PANIC_AGGRO_THRESHOLD) reason.push("high aggro");
                log(`⚠️ Panic triggered: ${reason.join(", ")}!`, "#ffcc00", "Alerts");
            }


            // Equip panic orb if needed
            if (character.slots.orb?.name !== PANIC_ORB) {
                try {
                    const orb_slot = locate_item(PANIC_ORB);
                    await delay(delayMs);
                    if (orb_slot === -1) {
                        log("[PANIC] Panic orb not found in inventory!", "#ff4444", "Errors");
                    } else {
                        equip(orb_slot);
                        await delay(2 * delayMs);
                        if (character.slots.orb?.name !== PANIC_ORB) {
                            log("[PANIC] Failed to equip panic orb!", "#ff4444", "Errors");
                        }
                    }
                } catch (e) {
                    log(`[PANIC] Error equipping panic orb: ${e && e.message ? e.message : e}`, "#ff4444", "Errors");
                }
            }

            // Try to cast scare if possible
            if (!is_on_cooldown("scare") && can_use("scare") && character.slots.orb?.name === PANIC_ORB) {
                try {
                    log("Using Scare!", "#ffcc00", "Alerts");
                    use_skill("scare");
                    await delay(delayMs);
                } catch (e) {
                    log(`[PANIC] Error using scare: ${e && e.message ? e.message : e}`, "#ff4444", "Errors");
                }
            }

            await delay(delayMs);
            continue;
        }

        // SAFE CONDITION
        if (HIGH_HEALTH && HIGH_MANA && MONSTERS_TARGETING_ME < PANIC_AGGRO_THRESHOLD) {
            if (panicking) {
                panicking = false;
                log("✅ Panic over.", "#00ff00", "Alerts");
            }
            // Equip normal orb if needed
            if (character.slots.orb?.name !== NORMAL_ORB) {
                try {
                    const orb_slot = locate_item(NORMAL_ORB);
                    await delay(delayMs);
                    if (orb_slot === -1) {
                        log("[PANIC] Normal orb not found in inventory!", "#ff4444", "Errors");
                    } else {
                        equip(orb_slot);
                        await delay(2 * delayMs);
                        if (character.slots.orb?.name !== NORMAL_ORB) {
                            log("[PANIC] Failed to equip normal orb!", "#ff4444", "Errors");
                        }
                    }
                } catch (e) {
                    log(`[PANIC] Error equipping normal orb: ${e && e.message ? e.message : e}`, "#ff4444", "Errors");
                }
            }
            await delay(2 * delayMs);
            continue;
        }

        await delay(delayMs);
    }
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// COMBAT ORBIT
// --------------------------------------------------------------------------------------------------------------------------------- //

let orbit_origin = null;

// Dynamically set orbit_origin based on character name
if (character.name === "Myras") {
    orbit_origin = HEALER_TARGET;
} else if (character.name === "Ulric") {
    orbit_origin = WARRIOR_TARGET;
} else if (character.name === "Riva") {
    orbit_origin = RANGER_TARGET;
}

let orbit_path_points = [];
let orbit_path_index = 0;
const MOVE_CHECK_INTERVAL = 120; // ms
const MOVE_TOLERANCE = 5; // pixels

function set_orbit_radius(r) {
    if (typeof r === "number" && r > 0) {
        orbit_radius = r;
        game_log(`Orbit radius set to ${orbit_radius}`);
    }
}

function compute_orbit_path(origin, ORBIT_RADIUS, steps) {
    const points = [];
    for (let i = 0; i < steps; i++) {
        const angle = (2 * Math.PI * i) / steps;
        points.push({
            x: origin.x + ORBIT_RADIUS * Math.cos(angle),
            y: origin.y + ORBIT_RADIUS * Math.sin(angle)
        });
    }
    return points;
}

async function orbit_loop() {

    let delayMs = 50;

    while(true) {
        // Wait until orbit loop is enabled
        if (!ORBIT_LOOP_ENABLED) {
            await delay(100);
            continue;
        }

        // orbit_origin = { x: character.real_x, y: character.real_y };
        set_orbit_radius(ORBIT_RADIUS);
        orbit_path_points = compute_orbit_path(orbit_origin, ORBIT_RADIUS, ORBIT_STEPS);
        orbit_path_index = 0;

        while (true) {
            // Check if orbit loop is enabled
            if (!ORBIT_LOOP_ENABLED) {
                await delay(100);
                continue;
            }
            // Stop the loop if character is more than 100 units from the orbit origin
            const dist_from_origin = Math.hypot(character.real_x - orbit_origin.x, character.real_y - orbit_origin.y);
            if (dist_from_origin > 100) {
                game_log("⚠️ Exiting orbit: too far from origin.", "#FF0000");
                ORBIT_LOOP_ENABLED = false;
                break;
            }

            const point = orbit_path_points[orbit_path_index];
            orbit_path_index = (orbit_path_index + 1) % orbit_path_points.length;

            // Only move if not already close to the next point
            const dist = Math.hypot(character.real_x - point.x, character.real_y - point.y);
            if (!character.moving && !smart.moving && dist > MOVE_TOLERANCE) {
                try {
                    await move(point.x, point.y);
                } catch (e) {
                    console.error("Orbit move error:", e);
                }
            }

            // Wait until movement is finished or interrupted
            while (ORBIT_LOOP_ENABLED && (character.moving || smart.moving)) {
                await new Promise(resolve => setTimeout(resolve, MOVE_CHECK_INTERVAL));
            }

            // Small delay before next step to reduce CPU usage
            await delay(delayMs);
        }
    }

}

// --------------------------------------------------------------------------------------------------------------------------------- //
// RESET BUTTON
// --------------------------------------------------------------------------------------------------------------------------------- //

function add_reload_button() {
    const $ = parent.$;
    const trc = $("#toprightcorner");
    if (!trc.length) return setTimeout(add_reload_button, 500);


    // Remove any existing reload or stats button to avoid duplicates
    $("#reload-btn").remove();
    $("#stats-btn").remove();

    // Create the stats button (as a div for consistent style)
    const stats_btn = $(`
        <div id="stats-btn" class="gamebutton" style="margin-right: 4px; cursor: pointer;">
            📊
        </div>
    `);
    stats_btn.on("click", () => {
        const doc = parent.document;
        let win = doc.getElementById("ui-statistics-window");
        if (!win) {
            if (typeof ui_window === "function") ui_window();
        } else {
            win.style.display = win.style.display === "none" ? "block" : "none";
        }
    });

    // Create the reload button
    const reload_btn = $(`
        <div id="reload-btn" class="gamebutton" style="margin-right: 0px; cursor: pointer;">
            🔄
        </div>
    `);
    reload_btn.on("click", () => {
        parent.window.location.reload();
    });

    // Insert stats button to the left of reload button
    trc.children().first().after(stats_btn);
    stats_btn.after(reload_btn);
}

add_reload_button();

// --------------------------------------------------------------------------------------------------------------------------------- //
// STATS BUTTON
// --------------------------------------------------------------------------------------------------------------------------------- //

function create_stats_button(top = 10, left = null, right = null) {
    // No longer used; see add_reload_button for stats button logic
}

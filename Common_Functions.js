
// -------------------------------------------------------------------- //
// CONFIG VARIABLES
// -------------------------------------------------------------------- //

let attack_mode                 = true;
let taunt_mode                  = true;
let fight_as_a_team             = false;
let inventoryCheckEnabled       = true;

let group_or_solo_button_title  = "Solo";
let taunt_button_title          = "Taunt";

const SELLABLE_ITEMS 		= ["hpbelt", "hpamulet", "wattire", "ringsj", "wgloves", "wbook0", "wshoes", "wcap", "cclaw", "crabclaw", "slimestaff", "stinger", "coat1", "helmet1"];
const BANKABLE_ITEMS            = [];

const INVENTORY_CHECK_INTERVAL  = 10 * 60 * 1000;  // 20 minutes in ms
let lastInventoryCheck          = 0;

const PARTY_CHECK_INTERVAL      = 5000;
let lastPartyCheck              = 0;

const REQUEST_COOLDOWN          = 30000;           // 30 seconds
let lastPotionRequest           = 0;
const HP_POT_THRESHOLD		= 3000;
const MP_POT_THRESHOLD		= 3000;

const HP_THRESHOLD              = 500;
const MP_THRESHOLD              = 500;
const HEAL_THRESHOLD            = 800;
const HEAL_COOLDOWN             = 200;

const TAUNT_RANGE               = 320;

const PARTY_LEADER              = "Ulric";
const PARTY_MEMBERS             = ["Riva", "Myras", "Riff"];

const follow_distance           = 150;

const MONSTER_TYPES             = ["goo", "bee", "crab", "snake", "osnake", "bat", "goldenbat", "croc", "arcticbee", "spider", "prat", "cgoo", "stoneworm", "jr"];
const MERCHANT_NAME             = "Riff";

let lastDeathTime               = 0;

const floatingButtonIds         = [];
let goldHistory                 = [];

const merchantTaskQueue         = [];
let merchantBusy                = false;

// -------------------------------------------------------------------- //
// TANK ROLE CONFIG / PERSISTENCE
// -------------------------------------------------------------------- //

const tankRoles = [
	{ name: "Ulric", label: "🛡️🗡️" },
	{ name: "Myras", label: "🛡️✨" },
	{ name: "Riva",  label: "🛡️🏹" }
];
let who_is_tank = 0;  // default index

Object.defineProperty(window, "tank_name", {
	get() {
		// whenever you read tank_name, return the name at the current index
		return tankRoles[who_is_tank].name;
	},
	set(newName) {
		// whenever you write tank_name = "Myras", update who_is_tank to match
		const idx = tankRoles.findIndex(r => r.name === newName);
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
const cmHandlers = {
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
    waitForMerchantAndSend();
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

// Register the handler dispatcher
add_cm_listener((name, data) => {
  if (!["Ulric", "Riva", "Myras", "Riff"].includes(name)) {
    game_log("❌ Unauthorized CM from " + name);
    return;
  }

  const handler = cmHandlers[data.type] || cmHandlers["default"];
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
		if (!leader || leader.rip || leader.map !== character.map || simple_distance(character, leader) > follow_distance) {
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
	const merchant = get_merchant();

	// Check if merchant is valid and nearby
	if (!merchant || merchant.rip || merchant.map !== character.map || distance(character, merchant) > 400) {
		game_log("Merchant not nearby or unavailable");
		return;
	}

	for (let i = 2; i < character.items.length; i++) {
		const item = character.items[i];
		if (item) {
			send_item(merchant, i, item.q || 1);
		}
	}

	send_gold(merchant, 999999999);
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

    const tankTargetId = tank.target;
    if (!tankTargetId) {
        change_target(null);
        return null;
    }

    const monster = parent.entities[tankTargetId];
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
	const amLeader = character.name === PARTY_LEADER;
	const amMember = PARTY_MEMBERS.includes(character.name);
	const currentParty = Object.keys(parent.party || {});

	if (amLeader) {
		PARTY_MEMBERS.forEach(name => {
			if (name === character.name) return;
			if (!currentParty.includes(name)) {
				send_party_invite(name);
				accept_party_request(name); // Optional, in case of mutual sending
			}
		});
	} else if (amMember) {
		if (!currentParty.includes(PARTY_LEADER)) {
			send_party_request(PARTY_LEADER);
			accept_party_invite(PARTY_LEADER);
		}
	}
}

function check_and_request_pots() {
	
	if (new Date() - lastPotionRequest < REQUEST_COOLDOWN) return;
    lastPotionRequest = new Date();
	
    const hpPotIndex = locate_item("hpot1");
	const mpPotIndex = locate_item("mpot1");
    const hpCount = hpPotIndex !== -1 ? character.items[hpPotIndex].q : 0;
    const mpCount = mpPotIndex !== -1 ? character.items[mpPotIndex].q : 0;

    if (hpCount < HP_POT_THRESHOLD) {
        send_cm("Riff", {
            type: "request_pots",
            item: "hpot1",
            quantity: 3000
        })
    }
	
	    if (mpCount < MP_POT_THRESHOLD) {
        send_cm("Riff", {
            type: "request_pots",
            item: "mpot1",
            quantity: 3000 // Adjust as needed
        })
    }
}

async function sell_and_bank() {
	// Only run when not moving
    if (character.moving) return;
	
	await smart_move({ x: -210, y: -107, map: "main" });
    await new Promise(resolve => setTimeout(resolve, 3000));
	
	// === SELLING ===
    for (let i = 0; i < character.items.length; i++) {
        let item = character.items[i];
        if (!item) continue;

        if (SELLABLE_ITEMS.includes(item.name)) {
            sell(i, item.q || 1);
            game_log(`Sold ${item.name}`);
        }
    }
}

function move_to_character(name, timeoutMs = 10000) {
	// Prevent multiple overlapping handlers
	let responded = false;

	function handle_response(n, data) {
		if (n !== name || !data || data.type !== "my_location") return;

		responded = true;
		remove_cm_listener(handle_response);
		clearTimeout(timeoutId);

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
	const timeoutId = setTimeout(() => {
		if (!responded) {
			remove_cm_listener(handle_response);
			game_log(`⚠️ No location response from ${name} within ${timeoutMs / 1000}s`);
		}
	}, timeoutMs);
}

// Global cooldown tracker
let lastBuyTime = 0;

function buy_pots() {
	
  const MAX_POTS = 9999;
  const POT_TYPES = ["hpot1", "mpot1"];
  const TARGET_MAP = "main";
  const TARGET_X = -36;
  const TARGET_Y = -153;
  const RANGE = 300;
  const COOLDOWN = 2000;

  // === Pre-check: If both hpot and mpot are at or above max, skip ===
  let hpot_total = 0;
  let mpot_total = 0;

  for (const item of character.items) {
    if (!item) continue;
    if (item.name === "hpot1") hpot_total += item.q || 1;
    if (item.name === "mpot1") mpot_total += item.q || 1;
  }

  if (hpot_total >= MAX_POTS && mpot_total >= MAX_POTS) {
    return;
  }

  const now = Date.now();
  if (now - lastBuyTime < COOLDOWN) {
    return;
  }

  lastBuyTime = now;

  // Check if we're on the correct map and within distance
  if (character.map !== TARGET_MAP) return;

  const dx = character.x - TARGET_X;
  const dy = character.y - TARGET_Y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist > RANGE) {
    return;
  }

  for (const pot of POT_TYPES) {
    let total = 0;

    for (const item of character.items) {
      if (item && item.name === pot) {
        total += item.q || 1;
      }
    }

    const toBuy = Math.max(0, MAX_POTS - total);

    if (toBuy > 0) {
      game_log(`🧪 Buying ${toBuy} x ${pot} (you have ${total})`);
      buy(pot, toBuy);
    } else {
      game_log(`✅ You already have enough ${pot} (${total})`);
    }
  }
}

// -------------------------------------------------------------------- //
// CHECK FOR LOOT AND TRANSFER
// -------------------------------------------------------------------- //

const inventoryQueue = ["Ulric", "Myras", "Riva"];
let currentlyProcessing = false;
const INVENTORY_THRESHOLD = 15;
const SELLING_LOCATION = { map: "main", x: -20, y: -100 };

function delay(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

let inventoryLockTimestamp = 0;
const INVENTORY_LOCK_DURATION = 5000; // 5 seconds max lock

async function checkRemoteInventories() {
	const now = Date.now();

	// Prevent overlapping calls
	if (currentlyProcessing && now - inventoryLockTimestamp < INVENTORY_LOCK_DURATION) {
		game_log("⏳ Inventory check already in progress.");
		return;
	}

	currentlyProcessing = true;
	inventoryLockTimestamp = now;

	const initialCount = character.items.filter(Boolean).length;
	let resolved = false;

	const cleanup = () => {
		for (const t of inventoryQueue) remove_cm_listener(listeners[t]);
		currentlyProcessing = false;
		inventoryLockTimestamp = 0;
		inventoryQueue.length = 0;
		inventoryQueue.push("Ulric", "Myras", "Riva");
	};

	const listeners = {};

	for (const target of inventoryQueue) {
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
					while (character.items.filter(Boolean).length <= initialCount) {
						await delay(500);
					}

					// Wait for stable inventory
					let stableTicks = 0, last = character.items.filter(Boolean).length;
					while (stableTicks < 4) {
						await delay(500);
						const current = character.items.filter(Boolean).length;
						if (current === last) {
							stableTicks++;
						} else {
							last = current;
							stableTicks = 0;
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

async function waitForMerchantAndSend() {
	game_log("📦 Waiting for merchant...");

	let attempts = 0;
	let merchant = null;

	while (attempts < 40) {
		merchant = get_player("Riff");

		if (merchant &&	!merchant.rip && merchant.map === character.map &&
			distance(character, merchant) <= 400
		) {
			break; // Merchant is ready
		}

		await delay(5000);
		attempts++;
	}

	if (merchant &&	!merchant.rip && merchant.map === character.map &&
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
// SIMPLE FISHING SCRIPT
// -------------------------------------------------------------------- //

async function goFish() {
	const FISHING_SPOT = { map: "main", x: -1116, y: -285 };

	// Check if fishing is available and rod is equipped
	if (!can_use("fishing")) {
		game_log("*** Fishing cooldown active ***");
		return;
	}

	if (character.slots.mainhand?.name !== "rod") {
		game_log("*** Fishing rod not equipped or broken ***");
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
		const beforeItems = character.items.map(i => i?.name || null);
		await delay(500);
		game_log("*** Casting line... ***");
		use_skill("fishing");

		let success = false;
		let attempts = 0;

		while (attempts < 30) { // wait up to 30s
			await delay(500);
			attempts++;

			const afterItems = character.items.map(i => i?.name || null);
			let changed = false;

			for (let i = 0; i < afterItems.length; i++) {
				if (afterItems[i] !== beforeItems[i]) {
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

		// Wait a moment before next cast
		await delay(500);
	}
}

// -------------------------------------------------------------------- //
// EXCHANGE ITEMS FOR LOOT
// -------------------------------------------------------------------- //

async function exchange_item(itemName) {
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
		const slot = locate_item(itemName);

		if (slot === -1 || !character.items[slot]) {
			game_log(`✅ No more ${itemName} to exchange. Done.`);
			clearInterval(interval);
			return;
		}

		game_log(`🔁 Exchanging slot ${slot} (${itemName})`);
		exchange(slot);

	}, EXCHANGE_INTERVAL);
}

// -------------------------------------------------------------------- //
// GOLD PER HOUR FOR STATS WINDOW
// -------------------------------------------------------------------- //

function hookGoldTrackingToStatsWindow() {
  let sumGold = 0;
  let largestGoldDrop = 0;
  const startTime = Date.now();

  // Every time you loot, accumulate
  character.on("loot", (data) => {
    if (data.gold && typeof data.gold === "number" && !isNaN(data.gold)) {
      const share = parent.party[character.name]?.share || 1;
      const full = Math.round(data.gold / share);
      sumGold += full;
      if (full > largestGoldDrop) largestGoldDrop = full;
    }
  });

  // Every 500ms, recompute and write into #statsBody
  setInterval(() => {
    // Find the <div id="statsBody"> we reserved in createTeamStatsWindow()
    const statsBody = window.top.document.getElementById("statsBody");
    if (!statsBody) return;

    const elapsedMs = Date.now() - startTime;
    const elapsedHrs = elapsedMs / 3_600_000;
    const avg = elapsedHrs > 0 ? Math.round(sumGold / elapsedHrs) : 0;

    // Build the two lines
    const goldLine    = `💰 Gold/hr: ${avg.toLocaleString()} g/h 🎲 Jackpot: ${largestGoldDrop.toLocaleString()} g`;

    // Overwrite the contents of statsBody
    statsBody.innerText = goldLine + "\n";
  }, 500);
}

// -------------------------------------------------------------------- //
// DPS FOR STATS WINDOW (Reload‐Safe, Floating‐Text Friendly, All Columns)
// -------------------------------------------------------------------- //

// Which columns to show
const damageTypes = ["Base", "Burn", "DPS"];

// Color mappings
const damageTypeColors = {
  Base: "#A92000",
  Burn: "#FF7F27",
  HPS:  "#9A1D27",
  DPS:  "#FFD700"
};
const classColors = {
  mage:    "#3FC7EB",
  paladin: "#F48C4BA",
  priest:  "#FFFFFF",
  ranger:  "#AAD372",
  rogue:   "#FFF468",
  warrior: "#C69B6D"
};

// Durable per‐player history on parent.socket:
parent.socket._dpsHistory = parent.socket._dpsHistory || {};

// Remove any old handler on reload:
if (parent.socket._dpsHandlerRef) {
  if (typeof parent.socket.off === "function") {
    parent.socket.off("hit", parent.socket._dpsHandlerRef);
  } else if (typeof parent.socket.removeListener === "function") {
    parent.socket.removeListener("hit", parent.socket._dpsHandlerRef);
  }
}

// Define and remember the handler:
parent.socket._dpsHandlerRef = function dpsHitHandler(data) {
  // Only once per event
  if (data.__dpsSeen) return;
  data.__dpsSeen = true;

  // Only track party members
  const inParty = id => parent.party_list.indexOf(id) >= 0;
  if (!inParty(data.hid) && !inParty(data.id)) return;

  // Derive fields
  const raw = data.damage || 0;
  const base  = raw && data.source !== "burn" && !data.splash ? raw : 0;
  const burn  = data.source === "burn" ? raw : 0;
  const heal  = (data.heal || 0) + (data.lifesteal || 0);
  const ret   = data.dreturn || 0;
  const refl  = data.reflect  || 0;
  const total = raw;

  // Skip if nothing to track
  if (!base && !burn && !heal && !ret && !refl) return;

  // Record timestamped entry
  const now = Date.now();
  const hist = parent.socket._dpsHistory[data.hid] || [];
  hist.push({ t: now, base, burn, heal, ret, refl, total });
  
  // Trim to last 60s
  const cutoff = now - 60000;
  parent.socket._dpsHistory[data.hid] = hist.filter(e => e.t >= cutoff);
};

// Attach once
parent.socket.on("hit", parent.socket._dpsHandlerRef);

function computeStatsArray() {
  const out = {};
  for (const name in parent.socket._dpsHistory) {
    const hist = parent.socket._dpsHistory[name];
    if (!hist || hist.length < 2) {
      out[name] = { Base:0, Burn:0, HPS:0, DPS:0 };
      continue;
    }
    const first = hist[0].t, last = hist[hist.length-1].t;
    const elapsed = Math.max(1, last - first);
    let sumBase=0, sumBurn=0, sumHeal=0, sumDPS=0;
    hist.forEach(e => {
      sumBase += e.base;
      sumBurn += e.burn;
      sumHeal += e.heal;
      sumDPS  += e.total + e.ret + e.refl;
    });
    const scale = 1000/elapsed;
    out[name] = {
      Base: Math.floor(sumBase * scale),
      Burn: Math.floor(sumBurn * scale),
      HPS:  Math.floor(sumHeal * scale),
      DPS:  Math.floor(sumDPS  * scale)
    };
  }
  return out;
}

function hookDPSTrackingToStatsWindow() {
  setInterval(() => {
    const container = window.top.document.getElementById("teamDpsContainer");
    if (!container) return;

    const stats = computeStatsArray();

    // Build table header
    let html = "<table style='width:100%;text-align:left;border-collapse:collapse'><tr><th></th>";
    damageTypes.forEach(t => {
      html += `<th style="color:${damageTypeColors[t]}">${t}</th>`;
    });
    html += "</tr>";

    // Fixed player order: Ulric, Riva, Myras
    ["Ulric", "Riva", "Myras"].forEach(name => {
      const vals = stats[name] || { Base:0, Burn:0, HPS:0, DPS:0 };
      const p = get_player(name);
      if (!p) return;
      const color = classColors[p.ctype.toLowerCase()] || "#fff";

      html += `<tr><td style="color:${color}">${name}</td>`;
      damageTypes.forEach(t => {
        html += `<td>${vals[t].toLocaleString()}</td>`;
      });
      html += "</tr>";
    });

    // Total row
    html += `<tr><td style="color:${damageTypeColors.DPS}">Total</td>`;
    damageTypes.forEach(t => {
      let sum = 0;
      ["Ulric", "Riva", "Myras"].forEach(name => {
        const v = (stats[name] || {})[t] || 0;
        sum += v;
      });
      html += `<td>${sum.toLocaleString()}</td>`;
    });
    html += "</tr></table>";

    container.innerHTML = html;
  }, 500);
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// CONFIG
// --------------------------------------------------------------------------------------------------------------------------------- //

const UPGRADE_INTERVAL = 75;

const upgradeProfile = {
  pouchbow:  { scroll0_until: 3, scroll1_until: 6, scroll2_until: 8, primling_from: 7, max_level: 8 },
  //fireblade: { scroll0_until: 2, scroll1_until: 5, scroll2_until: 7, primling_from: 6, max_level: 6 },
  hbow:      { scroll0_until: 3, scroll1_until: 6, scroll2_until: 8, primling_from: 7, max_level: 7 },
  // Add more items as needed
};

const combineProfile = {
  wbook0:  { scroll0_until: 2, scroll1_until: 4, scroll2_until: 6, primling_from: 4, max_level: 4 },
  dexring: { scroll0_until: 2, scroll1_until: 3, scroll2_until: 6, primling_from: 3, max_level: 3 },
  strring: { scroll0_until: 2, scroll1_until: 3, scroll2_until: 6, primling_from: 3, max_level: 3 },
  intring: { scroll0_until: 2, scroll1_until: 3, scroll2_until: 6, primling_from: 3, max_level: 3 },
  // Add more items as needed
};

// --------------------------------------------------------------------------------------------------------------------------------- //
// UPGRADE & COMPOUND – single‐pass versions
// --------------------------------------------------------------------------------------------------------------------------------- //

/**
 * Attempts one upgrade.  Returns true if it found an upgradable item
 * (and sent the packet or bought a scroll), false if nothing to do.
 */
function upgrade_once() {
  for (let i = 0; i < character.items.length; i++) {
    const item = character.items[i];
    if (!item) continue;

    const profile = upgradeProfile[item.name];
    if (!profile) continue;
    if (profile.max_level !== undefined && item.level >= profile.max_level) continue;

    let scrollname = null;
    if (item.level < profile.scroll0_until) {
      scrollname = "scroll0";
    } else if (item.level < profile.scroll1_until) {
      scrollname = "scroll1";
    } else {
      scrollname = "scroll2";
    }

    let offering_slot = null;
    if (profile.primling_from !== undefined && item.level >= profile.primling_from) {
      const [pSlot, prim] = find_item(it => it.name === "offeringp");
      if (!prim) {
        game_log("⚠️ Missing primling, skipping upgrade");
        continue;
      }
      offering_slot = pSlot;
    }

    const [scroll_slot, scroll] = find_item(it => it.name === scrollname);
    if (!scroll) {
      game_log(`📦 Need ${scrollname}, buying...`);
      parent.buy(scrollname);
      return false; // Wait for scroll to arrive
    }

    parent.socket.emit("upgrade", {
      item_num: i,
      scroll_num: scroll_slot,
      offering_num: offering_slot,
      clevel: item.level,
    });

    return true;
  }
  return false;
}

/**
 * Attempts one compound.  Returns true if it sent a compound packet 
 * (or bought a cscroll), false if nothing to do.
 */
function compound_once() {
  const buckets = new Map();

  character.items.forEach((item, idx) => {
    if (!item) return;

    const profile = combineProfile[item.name];
    if (!profile) return;
    if (profile.max_level !== undefined && item.level >= profile.max_level) return;

    const key = `${item.name}:${item.level}`;
    if (!buckets.has(key)) {
      buckets.set(key, [item.level, item_grade(item), [idx]]);
    } else {
      buckets.get(key)[2].push(idx);
    }
  });

  for (const [key, entries] of buckets) {
    const [level, grade, slots] = entries;
    if (slots.length < 3) continue;

    const [itemName] = key.split(":");
    const profile = combineProfile[itemName];
    if (!profile) continue;

    let scrollname = null;
    if (level < profile.scroll0_until) {
      scrollname = "cscroll0";
    } else if (level < profile.scroll1_until) {
      scrollname = "cscroll1";
    } else {
      scrollname = "cscroll2";
    }

    let offering_slot = null;
    if (profile.primling_from !== undefined && level >= profile.primling_from) {
      const [pSlot, prim] = find_item(it => it.name === "offeringp");
      if (prim) offering_slot = pSlot;
    }

   const [scroll_slot, scroll] = find_item(it => it.name === scrollname);
    if (!scroll) {
      game_log(`📦 Need ${scrollname}, buying...`);
      parent.buy(scrollname);
      return false;
    }

    const itemsToCompound = slots.slice(0, 3);
    parent.socket.emit("compound", {
      items:         itemsToCompound,
      scroll_num:    scroll_slot,
      offering_num:  offering_slot,
      clevel:        level
    });

    return true;
  }

  return false;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// AUTO–RUN LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

let auto_upgrade = false;

/**
 * Starts the auto-upgrade/compound process.  It will repeat
 * every UPGRADE_INTERVAL ms until both upgrade_once() and
 * compound_once() return false.
 */
function run_auto_upgrade() {
  if (auto_upgrade) return;  // only one runner at a time
  auto_upgrade = true;

  (function loop() {
    // Try upgrade first, then compound
    if (upgrade_once() || compound_once()) {
      // still work to do → schedule next tick
      setTimeout(loop, UPGRADE_INTERVAL);
    } else {
      // nothing left → stop
      auto_upgrade = false;
      console.log("🔧 auto upgrade/compound done");
    }
  })();
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// UTILITIES
// --------------------------------------------------------------------------------------------------------------------------------- //

function get_grade(item) {
  return parent.G.items[item.name].grades;
}

function find_item(filter) {
  for (let i = 0; i < character.items.length; i++) {
    const it = character.items[i];
    if (it && filter(it)) return [i, it];
  }
  return [-1, null];
}

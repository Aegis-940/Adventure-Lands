// --------------------------------------------------------------------------------------------------------------------------------- //
// CONFIG
// --------------------------------------------------------------------------------------------------------------------------------- //

const UPGRADE_INTERVAL = 75;  // ms between attempts

var upgradeWhitelist = {
  // itemName: maxLevel
  pouchbow: 7
};

var combineWhitelist = {
  // itemName: maxLevel
  wbook0: 3
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
    const c = character.items[i];
    if (!c) continue;

    const maxLevel = upgradeWhitelist[c.name];
    if (!maxLevel || c.level >= maxLevel) continue;

    // Choose scroll
    let scrollname;
    if (c.level >= 5) {
      scrollname = "scroll111";       // new rule for +5+
    } else {
      const grades = get_grade(c);
      if (c.level < grades[0]) {
        scrollname = "scroll0";
      } else if (c.level < grades[1]) {
        scrollname = "scroll1";
      } else {
        scrollname = "scroll2";
      }
    }

    // Find or buy scroll
    const [slot, scroll] = find_item(itm => itm.name === scrollname);
    if (!scroll) {
      parent.buy(scrollname);
      return true;
    }

    // Send upgrade
    parent.socket.emit("upgrade", {
      item_num:     i,
      scroll_num:   slot,
      offering_num: null,
      clevel:       c.level
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
  // Group items by name+level
  const buckets = new Map();
  character.items.forEach((item, idx) => {
    if (!item) return;
    const maxLvl = combineWhitelist[item.name];
    if (maxLvl == null || item.level >= maxLvl) return;

    const key = item.name + item.level;
    if (!buckets.has(key)) {
      buckets.set(key, [item.level, item_grade(item), idx]);
    } else {
      buckets.get(key).push(idx);
    }
  });

  // For each bucket of ≥3 items, do one compound
  for (const [lvl, grade, ...slots] of buckets.values()) {
    if (slots.length < 3) continue;
    const scrollName = `cscroll${grade}`;
    const [sSlot, scroll] = find_item(itm => itm.name === scrollName);

    if (!scroll) {
      parent.buy(scrollName);
      return true;
    }

    // take first three in slots
    const itemsToCompound = slots.slice(0, 3);
    parent.socket.emit("compound", {
      items:         itemsToCompound,
      scroll_num:    sSlot,
      offering_num:  null,
      clevel:        lvl
    });
    return true;
  }

  return false;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// AUTO–RUN LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

let _auto_running = false;

/**
 * Starts the auto-upgrade/compound process.  It will repeat
 * every UPGRADE_INTERVAL ms until both upgrade_once() and
 * compound_once() return false.
 */
function run_auto_upgrade() {
  if (_auto_running) return;  // only one runner at a time
  _auto_running = true;

  (function loop() {
    // Try upgrade first, then compound
    if (upgrade_once() || compound_once()) {
      // still work to do → schedule next tick
      setTimeout(loop, UPGRADE_INTERVAL);
    } else {
      // nothing left → stop
      _auto_running = false;
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

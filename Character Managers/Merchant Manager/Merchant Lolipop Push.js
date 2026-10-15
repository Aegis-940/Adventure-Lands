// --------------------------------------------------------------------------------------------------------------------------------- //
// LOLIPOP PUSH — ololipops +8 → +10 on demand: glolipop fails stack the odds, primlings grace every roll to its cap
// --------------------------------------------------------------------------------------------------------------------------------- //

var LOLIPOP_PUSH = {
	target: "ololipop",
	sacrifice: "glolipop",
	sacrifice_scroll: "scroll1",
	sacrifices_per_reset: 2,
	sacrifice_batch: 6,
	grace: "offeringp",
	stages: {
		8: { scroll: "scroll2", offering: "offeringp" },
		9: { scroll: "scroll3", offering: "offering" },
	},
	buyable: ["scroll1", "scroll2"],
	free_slots: 5,
};

var LOLIPOP_RUN_KEY = "AL_lolipop_push";

var lolipop_run = { active: false };

function save_lolipop_run() {
	storage_write(LOLIPOP_RUN_KEY, lolipop_run);
}

function lolipop_push() {
	if (lolipop_run.active) {
		log_msg("event", "🍭 Lolipop push is already running.");
		return;
	}
	lolipop_run = { active: true, due: LOLIPOP_PUSH.sacrifices_per_reset, rolls: { 8: 0, 9: 0 }, wins: { 8: 0, 9: 0 }, sacrificed: 0, graced: 0 };
	save_lolipop_run();
	log_msg("event", `🍭 Lolipop push started: ${stock_of(LOLIPOP_PUSH.target, 8)} ololipops at +8, ${stock_of(LOLIPOP_PUSH.target, 9)} at +9, `
		+ `${stock_of(LOLIPOP_PUSH.sacrifice, 8)} glolipops at +8 to fail.`);
}

function lolipop_push_stop() {
	stop_lolipop_push("stopped by hand");
}

function stop_lolipop_push(reason) {
	lolipop_run.active = false;
	save_lolipop_run();
	log_msg("event", `🍭 Lolipop push ended (${reason}). +8 rolls: ${lolipop_run.rolls[8]} → ${lolipop_run.wins[8]} at +9. `
		+ `+9 rolls: ${lolipop_run.rolls[9]} → ${lolipop_run.wins[9]} at +10. `
		+ `${lolipop_run.sacrificed} glolipops failed, ${lolipop_run.graced} primlings graced.`);
}

function stock_of(name, level) {
	return held_items(name)
		.filter(it => level === undefined || (it.level || 0) === level)
		.reduce((n, it) => n + (it.q || 1), 0);
}

function bag_slot(name, level) {
	const slot = character.items.findIndex(it => it && it.name === name && (level === undefined || (it.level || 0) === level));
	return slot === -1 ? null : slot;
}

function lolipop_stage() {
	if (stock_of(LOLIPOP_PUSH.target, 8) > 0) return 8;
	if (stock_of(LOLIPOP_PUSH.target, 9) > 0) return 9;
	return null;
}

function lolipop_kit_item(item) {
	if (item.name === LOLIPOP_PUSH.target) return item.level === 8 || item.level === 9;
	if (item.name === LOLIPOP_PUSH.sacrifice) return item.level === 8;
	return item.name === LOLIPOP_PUSH.grace || item.name === LOLIPOP_PUSH.sacrifice_scroll
		|| Object.values(LOLIPOP_PUSH.stages).some(kit => kit.scroll === item.name || kit.offering === item.name);
}

function lolipop_kit(stage) {
	const kit = LOLIPOP_PUSH.stages[stage];
	const items = [{ name: LOLIPOP_PUSH.grace }, { name: kit.scroll }, { name: kit.offering }];
	if (stage === 8 && lolipop_run.due > 0 && stock_of(LOLIPOP_PUSH.sacrifice, 8) > 0) {
		items.push({ name: LOLIPOP_PUSH.sacrifice_scroll }, { name: LOLIPOP_PUSH.sacrifice, level: 8, total: LOLIPOP_PUSH.sacrifice_batch });
	}
	items.push({ name: LOLIPOP_PUSH.target, level: stage, fill: true });
	return items;
}

async function stock_lolipop_kit(stage) {
	const in_bank = lolipop_kit(stage).filter(it => bag_slot(it.name, it.level) === null && stock_of(it.name, it.level) > 0);
	if (in_bank.length) {
		await bank_items(lolipop_kit_item);
		for (const it of in_bank) {
			await withdraw_item(it.name, it.level, it.fill ? Math.max(1, free_inventory_slots() - LOLIPOP_PUSH.free_slots) : it.total);
		}
		task_heartbeat();
	}

	if (character.map !== HOME.map || Math.hypot(character.x - HOME.x, character.y - HOME.y) > 10) {
		await smarter_move(HOME);
	}

	const kit = LOLIPOP_PUSH.stages[stage];
	const held = (name, level) => character.items.filter(it => it && it.name === name && it.level === level).length;
	const wanted = {
		[kit.scroll]: held(LOLIPOP_PUSH.target, stage),
		[LOLIPOP_PUSH.sacrifice_scroll]: stage === 8 ? Math.min(lolipop_run.due, held(LOLIPOP_PUSH.sacrifice, 8)) : 0,
	};
	for (const scroll of LOLIPOP_PUSH.buyable) {
		if (wanted[scroll] > 0 && bag_slot(scroll) === null) await buy_scrolls(scroll, wanted[scroll], "the lolipop push");
	}

	const short = [[LOLIPOP_PUSH.target, stage], [kit.scroll], [kit.offering]].filter(([name, level]) => bag_slot(name, level) === null);
	if (short.length) {
		stop_lolipop_push(`out of ${short.map(([name, level]) => G.items[name].name + (level ? ` +${level}` : "")).join(", ")}`);
		return false;
	}
	return true;
}

function upgrade_grade(def, level) {
	return def.grades.filter(g => level >= g).length;
}

function upgrade_chance_cap(item, kit) {
	const def = G.items[item.name];
	const grade = upgrade_grade(def, item.level);
	const base = G.upgrades[upgrade_grade(def, 0)][item.level + 1];
	const high = G.items[kit.scroll].grade > grade || G.items[kit.offering].grade > grade;
	return high ? Math.min(base + 0.36, base * 3) : Math.min(base + 0.24, base * 2);
}

async function upgrade_chance(slot, kit) {
	const reply = await upgrade(slot, inventory_slot(kit.scroll), inventory_slot(kit.offering), true);
	return reply.chance;
}

async function offer_grace(slot) {
	const offered = upgrade(slot, null, inventory_slot(LOLIPOP_PUSH.grace));
	const echo = parent.push_deferred("upgrade");
	try {
		await offered;
	} catch (e) {
		parent.resolve_deferred("upgrade");
		throw e;
	}
	await echo;
	task_heartbeat();
}

function spare_primlings(kit) {
	const held = character.items.filter(it => it && it.name === LOLIPOP_PUSH.grace).reduce((n, it) => n + (it.q || 1), 0);
	return held - (kit.offering === LOLIPOP_PUSH.grace ? 1 : 0);
}

async function grace_to_cap(slot, kit) {
	const cap = upgrade_chance_cap(character.items[slot], kit);
	let chance = await upgrade_chance(slot, kit);
	while (lolipop_run.active && chance < cap - 1e-9 && spare_primlings(kit) > 0) {
		await offer_grace(slot);
		lolipop_run.graced++;
		const next = await upgrade_chance(slot, kit);
		if (next <= chance) break;
		chance = next;
	}
	save_lolipop_run();
	return chance;
}

async function scroll_roll(slot, scroll, offering) {
	use_mass_production(character.items[slot].level);
	const result = await upgrade(slot, scroll, offering);
	task_heartbeat();
	return result.success;
}

async function lolipop_sacrifices() {
	while (lolipop_run.active && lolipop_run.due > 0) {
		let slot = bag_slot(LOLIPOP_PUSH.sacrifice, 8);
		const scroll = inventory_slot(LOLIPOP_PUSH.sacrifice_scroll);
		if (slot === null || scroll === null) return;

		const lucky = upgrade_slot_for(slot);
		if (slot === lucky) {
			const spare = character.items.findIndex((it, i) => !it && i !== lucky);
			await swap(slot, spare);
			slot = spare;
		}

		if (await scroll_roll(slot, scroll, null)) {
			lolipop_run.due = LOLIPOP_PUSH.sacrifices_per_reset;
			log_msg("event", `🍭 A glolipop reached +9, which resets the stack — failing ${lolipop_run.due} more.`);
		} else {
			lolipop_run.due--;
			lolipop_run.sacrificed++;
			log_msg("event", `🍭 Glolipop failed (stack +1). ${lolipop_run.due} more before the next ololipop.`);
		}
		save_lolipop_run();
	}
}

async function lolipop_roll(stage) {
	const kit = LOLIPOP_PUSH.stages[stage];
	const home = bag_slot(LOLIPOP_PUSH.target, stage);
	const chance = await grace_to_cap(home, kit);
	if (!lolipop_run.active) return;

	const slot = upgrade_slot_for(home);
	if (slot !== home) await swap(home, slot);

	log_msg("event", `🍭 Rolling ololipop +${stage} → +${stage + 1} at ${(chance * 100).toFixed(2)}% (grace ${(character.items[slot].grace || 0).toFixed(1)}).`);
	const won = await scroll_roll(slot, inventory_slot(kit.scroll), inventory_slot(kit.offering));
	lolipop_run.rolls[stage]++;
	if (won) {
		lolipop_run.wins[stage]++;
		if (stage === 8) lolipop_run.due = LOLIPOP_PUSH.sacrifices_per_reset;
		log_msg("event", stage === 9 ? "🎉 OLOLIPOP +10!" : `✅ Ololipop +9 (${lolipop_run.wins[8]} so far).`);
	} else {
		log_msg("event", `❌ Ololipop +${stage} lost.`);
	}
	save_lolipop_run();

	if (slot !== home && (character.items[slot] || character.items[home])) {
		await swap(slot, home).catch(e => catcher(e, `lolipop_roll: swap back ${slot} -> ${home}`));
	}
}

async function lolipop_push_step() {
	const stage = lolipop_stage();
	if (stage === null) {
		stop_lolipop_push("no ololipops left at +8 or +9");
		return;
	}
	if (!await stock_lolipop_kit(stage)) return;
	if (stage === 8) await lolipop_sacrifices();
	if (lolipop_run.active) await lolipop_roll(stage);
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// BOOT
// --------------------------------------------------------------------------------------------------------------------------------- //

on_boot("Merchant Lolipop Push", () => {
	lolipop_run = storage_read(LOLIPOP_RUN_KEY) || { active: false };
});

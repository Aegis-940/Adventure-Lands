// --------------------------------------------------------------------------------------------------------------------------------- //
// CIPHER GATHERING — the first 20 minutes of a Witch's Cipher round: the fighters leave their farm for the ingredient spots, nearest
// first from the plantoids, each for a share of the window by how short the account is of its ingredient, the last one until the window
// closes; the ingredients reach Riff with the rest of their loot. Myras owns the plan
// --------------------------------------------------------------------------------------------------------------------------------- //

const CIPHER_SPOTS = { verdantspore: "spider", frostscale: "wolfie", embercoal: "plantoid", gloomfeather: "ghost" };
const CIPHER_GATHER_KEY = "AL_cipher_gather";
const CIPHER_GATHER_OWNER = MOVEMENT_LEADER;
const CIPHER_GATHERERS = ["Ulric", "Myras", "Riva"];
const CIPHER_HOLDERS = ["Ulric", "Myras", "Riva", "Riff"];
const CIPHER_ROUTE = ["embercoal", "verdantspore", "frostscale", "gloomfeather"];
const CIPHER_STOCK_TARGET = 30;
const CIPHER_FIRST_QUOTA = 10;
const CIPHER_GATHER_TICK_MS = 1000;

let _cipher_gathering = false;

function cipher_ingredients() {
	return G.events.witchcipher.ingredients.map(entry => entry[0]);
}

function cipher_bag() {
	const bag = {};
	for (const name of cipher_ingredients()) bag[name] = quantity(name);
	return bag;
}

function cipher_account_stock() {
	const stock = {};
	for (const name of cipher_ingredients()) stock[name] = 0;
	for (const who of CIPHER_HOLDERS) {
		const state = who === character.name ? { cipher_bag: cipher_bag() } : read_state_cache(who);
		if (!state || !state.cipher_bag) continue;
		for (const name in stock) stock[name] += state.cipher_bag[name] || 0;
	}
	const bank = load_bank_from_local_storage();
	for (const pack in bank || {}) {
		if (!Array.isArray(bank[pack])) continue;
		for (const item of bank[pack]) if (item && item.name in stock) stock[item.name] += item.q || 1;
	}
	return stock;
}

function cipher_gathering_round() {
	const cipher = parent.S.witchcipher;
	return cipher && cipher.live && cipher.phase === "gathering" ? cipher : null;
}

function cipher_gather_allowed() {
	return setting("cipher_gathering") && !active_dungeon()
		&& CIPHER_GATHERERS.every(name => ![SURVEY_FARM_TARGET, PHOENIX].includes(farm_target_setting(name)));
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// THE PLAN — one per round: CIPHER_ROUTE's spots whose ingredient is short of CIPHER_STOCK_TARGET, in route order. Each but the last
// is held until the party has what it is short of (the plantoids, quick to farm, CIPHER_FIRST_QUOTA) or its share of what is left of the
// window, by how short it is, has gone; the last is held until the window closes
// --------------------------------------------------------------------------------------------------------------------------------- //

function cipher_plan_new(cipher, stock) {
	const want = {};
	for (const type of CIPHER_ROUTE) want[type] = Math.max(0, CIPHER_STOCK_TARGET - stock[type]);
	const order = CIPHER_ROUTE.filter(type => want[type] > 0);
	const quota = {};
	for (const type of order) quota[type] = type === CIPHER_ROUTE[0] ? CIPHER_FIRST_QUOTA : want[type];

	const plan = { round: cipher.id, order, want, quota, index: 0, done: !order.length };
	if (plan.done) log_msg("event", `🧪 Cipher gathering: every ingredient is at ${CIPHER_STOCK_TARGET}, staying on the farm`);
	else {
		log_msg("event", `🧪 Cipher gathering: ${order.map(type => `${CIPHER_SPOTS[type]} (have ${stock[type]}, want ${quota[type]})`).join(" → ")}`);
		cipher_spot_begin(plan, cipher, stock);
	}
	return plan;
}

function cipher_spot_begin(plan, cipher, stock) {
	const type = plan.order[plan.index];
	const short = plan.order.slice(plan.index).reduce((sum, t) => sum + plan.want[t], 0);
	plan.spot_started = Date.now();
	plan.base = stock[type];
	plan.budget_ms = Math.max(0, cipher.gather_end - Date.now()) * plan.want[type] / short;
}

function cipher_spot_finish(plan, stock) {
	const type = plan.order[plan.index];
	const gained = stock[type] - plan.base;
	const minutes = Math.round((Date.now() - plan.spot_started) / 6000) / 10;
	log_msg("event", `🧪 Cipher gathering: ${gained} ${type} at ${CIPHER_SPOTS[type]} in ${minutes} min`);
	errlog_sample("cipher_gather", { round: plan.round, spot: CIPHER_SPOTS[type], type, gained, quota: plan.quota[type], minutes });
	plan.index++;
	plan.done = plan.index >= plan.order.length;
}

function cipher_gather_owner_tick(cipher) {
	const stock = cipher_account_stock();
	const plan = storage_read(CIPHER_GATHER_KEY);
	if (!plan || plan.round !== cipher.id) return void storage_write(CIPHER_GATHER_KEY, cipher_plan_new(cipher, stock));
	if (plan.done || plan.index === plan.order.length - 1) return;

	const type = plan.order[plan.index];
	if (stock[type] - plan.base < plan.quota[type] && Date.now() - plan.spot_started < plan.budget_ms) return;
	cipher_spot_finish(plan, stock);
	cipher_spot_begin(plan, cipher, stock);
	storage_write(CIPHER_GATHER_KEY, plan);
}

function cipher_plan_close() {
	const plan = storage_read(CIPHER_GATHER_KEY);
	if (!plan || plan.done) return;
	cipher_spot_finish(plan, cipher_account_stock());
	plan.done = true;
	storage_write(CIPHER_GATHER_KEY, plan);
}

function cipher_gather_spot(cipher) {
	const plan = storage_read(CIPHER_GATHER_KEY);
	if (!plan || plan.round !== cipher.id || plan.done) return null;
	return CIPHER_SPOTS[plan.order[plan.index]];
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// TICK — every fighter farms the plan's spot while the window is open, and its own farm target again once it closes
// --------------------------------------------------------------------------------------------------------------------------------- //

function cipher_gather_tick() {
	const cipher = cipher_gathering_round();
	const allowed = !!cipher && cipher_gather_allowed();
	if (allowed && character.name === CIPHER_GATHER_OWNER) cipher_gather_owner_tick(cipher);

	const spot = allowed ? cipher_gather_spot(cipher) : null;
	if (spot && spot !== home) switch_home(spot);
	if (!spot && _cipher_gathering) {
		if (character.name === CIPHER_GATHER_OWNER) cipher_plan_close();
		switch_home(farm_target_for(character.name));
	}
	_cipher_gathering = !!spot;
}

function cipher_gather_start() {
	every("cipher_gather_tick", { ms: CIPHER_GATHER_TICK_MS, kind: "automation", fixed: true }, cipher_gather_tick);
}

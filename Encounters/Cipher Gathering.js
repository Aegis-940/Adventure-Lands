// --------------------------------------------------------------------------------------------------------------------------------- //
// CIPHER GATHERING — the first 20 minutes of a Witch's Cipher round: the fighters leave their farm for the spot of the ingredient the
// account holds least of and farm it until the window closes; the ingredients reach Riff with the rest of their loot. Myras owns the plan
// --------------------------------------------------------------------------------------------------------------------------------- //

const CIPHER_SPOTS = { verdantspore: "spider", frostscale: "wolfie", embercoal: "plantoid", gloomfeather: "ghost" };
const CIPHER_GATHER_KEY = "AL_cipher_gather";
const CIPHER_GATHER_OWNER = MOVEMENT_LEADER;
const CIPHER_GATHERERS = ["Ulric", "Myras", "Riva"];
const CIPHER_HOLDERS = ["Ulric", "Myras", "Riva", "Riff"];
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
// THE PLAN — one per round: the spot of the ingredient the account holds least of (every bag and the bank), for the whole window
// --------------------------------------------------------------------------------------------------------------------------------- //

function cipher_plan_new(cipher, stock) {
	const type = cipher_ingredients().reduce((a, b) => (stock[b] < stock[a] ? b : a));
	log_msg("event", `🧪 Cipher gathering: ${CIPHER_SPOTS[type]} for the window (${cipher_ingredients().map(t => `${stock[t]} ${t}`).join(", ")})`);
	return { round: cipher.id, type, base: stock[type], started: Date.now(), done: false };
}

function cipher_gather_owner_tick(cipher) {
	const plan = storage_read(CIPHER_GATHER_KEY);
	if (plan && plan.round === cipher.id) return;
	storage_write(CIPHER_GATHER_KEY, cipher_plan_new(cipher, cipher_account_stock()));
}

function cipher_plan_close() {
	const plan = storage_read(CIPHER_GATHER_KEY);
	if (!plan || plan.done) return;
	const gained = cipher_account_stock()[plan.type] - plan.base;
	const minutes = Math.round((Date.now() - plan.started) / 6000) / 10;
	log_msg("event", `🧪 Cipher gathering: ${gained} ${plan.type} at ${CIPHER_SPOTS[plan.type]} in ${minutes} min`);
	errlog_sample("cipher_gather", { round: plan.round, spot: CIPHER_SPOTS[plan.type], type: plan.type, gained, minutes });
	plan.done = true;
	storage_write(CIPHER_GATHER_KEY, plan);
}

function cipher_gather_spot(cipher) {
	const plan = storage_read(CIPHER_GATHER_KEY);
	if (!plan || plan.round !== cipher.id || plan.done) return null;
	return CIPHER_SPOTS[plan.type];
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

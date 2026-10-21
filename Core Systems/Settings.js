// --------------------------------------------------------------------------------------------------------------------------------- //
// SETTINGS — every choice the ⚙️ window makes: its storage key, its default, and the one reader
// --------------------------------------------------------------------------------------------------------------------------------- //

const SETTING_KEY_PREFIX = "AL_setting_";

const EXCHANGE_DEFAULTS = ["anniversarygift", "gift0", "seashell", "brownenvelope", "goldenegg", "basketofeggs",
	"gem0", "gem1", "armorbox", "weaponbox", "candy1"];

let _settings = null;
let _settings_index = null;

function settings_registry() {
	return [
		{ section: "Farm targets (on reload)", name: "farm_Ulric", key: farm_target_key("Ulric"), label: "Warrior (Ulric)", type: "select", options: monster_options, default: DEFAULT_FARM_TARGET },
		{ section: "Farm targets (on reload)", name: "farm_Myras", key: farm_target_key("Myras"), label: "Healer (Myras)",  type: "select", options: monster_options, default: DEFAULT_FARM_TARGET },
		{ section: "Farm targets (on reload)", name: "farm_Riva",  key: farm_target_key("Riva"),  label: "Ranger (Riva)",   type: "select", options: monster_options, default: DEFAULT_FARM_TARGET },

		...EVENT_LOCATIONS.map(e => ({
			section: "Bosses & events", name: "boss_" + e.name, key: SETTING_KEY_PREFIX + "boss_" + e.name,
			label: e.mtypes ? G.events[e.name].name : G.monsters[e.name].name, type: "checkbox", default: true,
		})),
		{ section: "Bosses & events", name: "cipher_gathering", key: SETTING_KEY_PREFIX + "cipher_gathering", label: "Witch's Cipher gathering (the fighters)", type: "checkbox", default: true },
		{ section: "Bosses & events", name: "trick_or_treat", key: SETTING_KEY_PREFIX + "trick_or_treat", label: "Trick or Treat (Riff, and Riva after an event)", type: "checkbox", default: true },

		{ section: "Dungeons", name: "dungeon", label: "Dungeon", type: "select", options: dungeon_options, default: "",
			read: () => dungeon_choice() || "", write: value => choose_dungeon(value || null), only: DUNGEON_PARTY },
		{ section: "Dungeons", name: "dreams_daily", key: SETTING_KEY_PREFIX + "dreams_daily", label: "Daily Cave of Many Dreams", type: "checkbox", default: true },

		{ section: "Merchant", name: "merchant_upgrading", key: "AL_merchant_enabled_upgrading", label: "Upgrading", type: "checkbox", default: true },
		{ section: "Merchant", name: "upgrade_target", key: "AL_merchant_upgrade_target", label: "Target item",  type: "select", options: upgrade_target_options, default: "", indent: true },
		{ section: "Merchant", name: "upgrade_level",  key: "AL_merchant_upgrade_level",  label: "Target level", type: "number", min: 1, max: 12,  default: 10, indent: true },
		{ section: "Merchant", name: "upgrade_count",  key: "AL_merchant_upgrade_count",  label: "Target count", type: "number", min: 1, max: 999, default: 1,  indent: true },
		{ section: "Merchant", name: "merchant_crafting", key: "AL_merchant_enabled_crafting", label: "Crafting", type: "checkbox", default: true },
		{ section: "Merchant", name: "craft_target", key: "AL_merchant_craft_target", label: "Craft target", type: "select", options: craft_target_options, default: "", indent: true },
		{ section: "Merchant", name: "merchant_exchanging", key: "AL_merchant_enabled_exchanging", label: "Exchanging", type: "checkbox", default: true },
		{ section: "Merchant", name: "merchant_cipher", key: "AL_merchant_enabled_cipher", label: "Witch's Cipher", type: "checkbox", default: true },
		{ section: "Merchant", name: "merchant_fishing", key: "AL_merchant_enabled_fishing", label: "Fishing", type: "checkbox", default: false },
		{ section: "Merchant", name: "merchant_mining",  key: "AL_merchant_enabled_mining",  label: "Mining",  type: "checkbox", default: false },

		...exchangeables().map(name => ({
			section: "Exchange", name: "exchange_" + name, key: SETTING_KEY_PREFIX + "exchange_" + name,
			label: G.items[name].name, type: "checkbox", default: EXCHANGE_DEFAULTS.includes(name),
		})),
	];
}

function settings_list() {
	if (!_settings) _settings = settings_registry();
	return _settings;
}

function settings_index() {
	if (!_settings_index) {
		_settings_index = {};
		for (const s of settings_list()) _settings_index[s.name] = s;
	}
	return _settings_index;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// READ AND WRITE — a stored value that no longer fits its setting reads as the default
// --------------------------------------------------------------------------------------------------------------------------------- //

function setting(name) {
	const s = settings_index()[name];
	return s.read ? s.read() : setting_value(s, storage_raw_read(s.key));
}

function setting_value(s, raw) {
	if (raw === null) return s.default;
	if (s.type === "checkbox") return raw === "true";
	if (s.type === "number") {
		const n = Number(raw);
		return Number.isFinite(n) && n >= s.min && n <= s.max ? n : s.default;
	}
	return setting_options(s).some(o => o.value === raw) ? raw : s.default;
}

function setting_options(s) {
	if (!s._options) s._options = s.options();
	return s._options;
}

function save_setting(name, value) {
	const s = settings_index()[name];
	if (value === setting(name)) return false;
	if (s.write) s.write(value);
	else storage_raw_write(s.key, value);
	return true;
}

function setting_shown(s) {
	return !s.only || s.only.includes(character.name);
}

function settings_stamp() {
	const out = [];
	for (const s of settings_list()) {
		const value = setting(s.name);
		if (value === s.default) continue;
		out.push(s.name + "=" + (typeof value === "boolean" ? Number(value) : value));
	}
	return out.join(",");
}

function al_settings() {
	const out = {};
	for (const s of settings_list()) {
		const value = setting(s.name);
		out[s.name] = value === s.default ? value : value + " (default " + s.default + ")";
	}
	return out;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// OPTIONS
// --------------------------------------------------------------------------------------------------------------------------------- //

function monster_options() {
	return [{ value: SURVEY_FARM_TARGET, text: SURVEY_FARM_TARGET }]
		.concat(Object.keys(LOCATIONS).sort().map(name => ({ value: name, text: name })));
}

function item_options(names) {
	const options = names
		.map(name => ({ value: name, text: `${G.items[name].name} (${name})` }))
		.sort((a, b) => a.text.localeCompare(b.text));
	return [{ value: "", text: "(none)" }].concat(options);
}

function upgrade_target_options() {
	return item_options(Object.keys(G.items).filter(name => G.items[name].upgrade));
}

function craft_target_options() {
	return item_options(Object.keys(G.craft).filter(name => G.items[name]));
}

function dungeon_options() {
	return [{ value: "", text: "(none)" }].concat(Object.keys(DUNGEONS)
		.filter(key => key !== "dreams")
		.map(key => ({ value: key, text: DUNGEONS[key].name })));
}

function exchangeables() {
	return EXCHANGE_DEFAULTS.concat(Object.keys(G.items)
		.filter(name => G.items[name].e && !EXCHANGE_DEFAULTS.includes(name))
		.sort());
}

console_api({
	al_settings: "every ⚙️ setting and its value, with the default beside any that differ",
});

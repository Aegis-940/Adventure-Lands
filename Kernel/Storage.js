// --------------------------------------------------------------------------------------------------------------------------------- //
// STORAGE — the only code that touches localStorage, and the register of every key the bot keeps there
// --------------------------------------------------------------------------------------------------------------------------------- //

const STORAGE_KEYS = [
	{ key: "AL_automation_paused_", kind: "raw", owner: "Global Config" },
	{ key: "AL_target_", kind: "raw", owner: "Global Config" },
	{ key: "AL_char_state_", kind: "json", owner: "Character Messaging" },
	{ key: "AL_errors_", kind: "json", owner: "Error Log" },
	{ key: "AL_set_profile2_", kind: "json", owner: "Equipment Valuation" },
	{ key: "AL_farm_focus", kind: "json", owner: "Targeting" },
	{ key: "AL_survey", kind: "json", owner: "Farm Survey" },
	{ key: "AL_tracker_at_", kind: "json", owner: "Farm Ledger" },
	{ key: "AL_dungeon_mode", kind: "raw", owner: "Dungeon Runner" },
	{ key: "AL_dungeon_runs", kind: "raw", owner: "Dungeon Collection" },
	{ key: "AL_upgrade_slot_rolls", kind: "json", owner: "Lucky Slot Tracker" },
	{ key: "AL_lolipop_push", kind: "json", owner: "Merchant Upgrading" },
	{ key: "AL_merchant_enabled_", kind: "raw", owner: "Merchant Config" },
	{ key: "AL_merchant_craft_target", kind: "raw", owner: "Merchant Config" },
	{ key: "AL_merchant_upgrade_target", kind: "raw", owner: "Merchant Config" },
	{ key: "AL_merchant_upgrade_level", kind: "raw", owner: "Merchant Config" },
	{ key: "AL_merchant_upgrade_count", kind: "raw", owner: "Merchant Config" },
];

function storage_read(key) {
	try {
		const raw = localStorage.getItem(key);
		return raw ? JSON.parse(raw) : null;
	} catch (e) {
		return null;
	}
}

function storage_write(key, value) {
	try {
		localStorage.setItem(key, JSON.stringify(value));
		return true;
	} catch (e) {
		return false;
	}
}

function storage_raw_read(key) {
	try {
		return localStorage.getItem(key);
	} catch (e) {
		return null;
	}
}

function storage_raw_write(key, value) {
	try {
		localStorage.setItem(key, String(value));
		return true;
	} catch (e) {
		return false;
	}
}

function storage_remove(key) {
	try {
		localStorage.removeItem(key);
		return true;
	} catch (e) {
		return false;
	}
}

function storage_keys() {
	try {
		const keys = [];
		for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
		return keys.filter(Boolean);
	} catch (e) {
		return [];
	}
}

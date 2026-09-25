// -------------------------------------------------------------------- //
// BOOTSTRAPPER (reload-safe, commit-specific, debug-enabled)           //
// -------------------------------------------------------------------- //

(function(){
	game_log("🔧 Bootstrap starting for " + character.name + "...");

	const p$ = window.$ || window.jQuery || parent.$;
	if (!p$) {
		return void game_log("❌ [Bootstrapper99] jQuery not found!");
	}

	let CACHE_OK = false;

	const first_script = "Core Systems/Global Config.js";

	const scripts = [
		"Core Systems/Movement Manager.js",
		"Core Systems/Bscorpion Camp.js",
		"Core Systems/Combat Utilities.js",
		"Core Systems/Combat Formulas.js",
		"Core Systems/Combat Sampling.js",
		"Core Systems/Movement Positioning.js",
		"Core Systems/Targeting.js",
		"Core Systems/Porcupine Guard.js",
		"Core Systems/World Events.js",
		"Core Systems/Server Watch.js",
		"Core Systems/Character Messaging.js",
		"Core Systems/Equipment Manager.js",
		"Core Systems/Equipment Valuation.js",
		"Core Systems/Party Management.js",
		"Core Systems/Loot Management.js",
		"Core Systems/Maintenance.js",
		"Core Systems/Party Cohesion.js",
		"Core Systems/Character Runner.js",
		"Core Systems/Error Handling.js",
		"Core Systems/Error Log.js",
		"Dungeons/Dungeon Runner.js",
		"Dungeons/Spider Dungeon.js",
		"Dungeons/Crypt Dungeon.js",
		"Dungeons/Dungeon Progress.js",
		"Dungeons/Dungeon Escape.js",
		"Dungeons/Dungeon Telemetry.js",
		"Dungeons/Dungeon Collection.js",
		"Dungeons/Crypt Route.js",
		"Dungeons/Dungeon Mode.js",
		"Interface/Bank Sort Order.js",
		"Interface/Widget Helpers.js",
		"Interface/Game Log.js",
		"Interface/XP Meter.js",
		"Interface/Gold Meter.js",
		"Interface/DPS Meter.js",
		"Interface/Bank Viewer.js",
		"Interface/Party Frames.js",
		"Interface/CC Meter.js",
		"Interface/Stats Window.js",
		"Interface/Settings Window.js",
		"Interface/Pause Button.js"
	];

	const role_scripts = {
		"Ulric": ["Character Managers/Warrior Manager/Warrior Config.js",
		"Character Managers/Warrior Manager/Warrior Combat.js",
		"Character Managers/Warrior Manager/Warrior Skills.js",
		"Character Managers/Warrior Manager/Warrior Equipment.js",
		"Character Managers/Warrior Manager/Warrior Movement.js",
		"Character Managers/Warrior Manager/Warrior.js"],

		"Myras": ["Character Managers/Healer Manager/Healer Config.js",
		"Character Managers/Healer Manager/Healer Combat.js",
		"Character Managers/Healer Manager/Healer Skills.js",
		"Character Managers/Healer Manager/Healer Equipment.js",
		"Character Managers/Healer Manager/Healer Movement.js",
		"Character Managers/Healer Manager/Healer.js"],

		"Riva": ["Character Managers/Ranger Manager/Ranger Config.js",
		"Character Managers/Ranger Manager/Ranger Combat.js",
		"Character Managers/Ranger Manager/Ranger Skills.js",
		"Character Managers/Ranger Manager/Ranger Equipment.js",
		"Character Managers/Ranger Manager/Ranger Movement.js",
		"Character Managers/Ranger Manager/Ranger.js"],

		"Riff": ["Character Managers/Merchant Manager/Merchant Upgrading.js",
		"Character Managers/Merchant Manager/Merchant Crafting.js",
		"Character Managers/Merchant Manager/Merchant Config.js",
		"Character Managers/Merchant Manager/Merchant Stand.js",
		"Character Managers/Merchant Manager/Merchant Inventory.js",
		"Character Managers/Merchant Manager/Merchant Exchange.js",
		"Character Managers/Merchant Manager/Merchant Gear.js",
		"Character Managers/Merchant Manager/Merchant Gathering.js",
		"Character Managers/Merchant Manager/Merchant Party.js",
		"Character Managers/Merchant Manager/Merchant Upkeep.js",
		"Character Managers/Merchant Manager/Merchant Task Loop.js",
		"Character Managers/Merchant Manager/Merchant.js"]
	};
	const role_file = role_scripts[character.name] || [];
	if (!role_scripts[character.name]) {
		game_log("⚠️ No role script for " + character.name);
	}

	const MAX_RETRIES = 3;

	const CRITICAL_SCRIPTS = [
		"Core Systems/Global Config.js",
		"Core Systems/Movement Manager.js",
		"Core Systems/Bscorpion Camp.js",
		"Core Systems/Combat Utilities.js",
		"Core Systems/Combat Formulas.js",
		"Core Systems/Combat Sampling.js",
		"Core Systems/Movement Positioning.js",
		"Core Systems/Targeting.js",
		"Core Systems/World Events.js",
		"Core Systems/Server Watch.js",
		"Core Systems/Character Messaging.js",
		"Core Systems/Equipment Manager.js",
		"Core Systems/Equipment Valuation.js",
		"Core Systems/Party Management.js",
		"Core Systems/Loot Management.js",
		"Core Systems/Maintenance.js",
		"Core Systems/Party Cohesion.js",
		"Core Systems/Character Runner.js",
		"Core Systems/Error Handling.js",
		"Dungeons/Dungeon Runner.js",
		"Dungeons/Dungeon Escape.js",
		"Interface/Game Log.js",
		"Interface/Widget Helpers.js",
		"Interface/Bank Viewer.js",
	];

	// -------------------------------------------------------------------- //
	// SKIP LIST — localStorage-driven, for bisecting load cost             //
	// -------------------------------------------------------------------- //

	const SKIP_KEY = "AL_skip";

	const SKIP_GROUPS = {
		ui: [
			"Interface/XP Meter.js",
			"Interface/Gold Meter.js",
			"Interface/DPS Meter.js",
			"Interface/Party Frames.js",
			"Interface/CC Meter.js",
			"Interface/Stats Window.js",
			"Interface/Settings Window.js",
			"Interface/Pause Button.js",
			"Interface/Bank Sort Order.js"
		],
		dungeon: [
			"Dungeons/Spider Dungeon.js",
			"Dungeons/Crypt Dungeon.js",
			"Dungeons/Crypt Route.js",
			"Dungeons/Dungeon Progress.js",
			"Dungeons/Dungeon Telemetry.js",
			"Dungeons/Dungeon Collection.js",
			"Dungeons/Dungeon Mode.js"
		],
		telemetry: [
			"Core Systems/Error Log.js",
			"Core Systems/Porcupine Guard.js"
		]
	};

	const DEFAULT_SKIP = [].concat(SKIP_GROUPS.ui);

	function requested_skips() {
		try {
			const raw = localStorage.getItem(SKIP_KEY);
			if (raw) {
				const list = JSON.parse(raw);
				if (Array.isArray(list)) return { src: "localStorage", list: list.filter(n => typeof n === "string") };
			}
		} catch (e) { }
		return { src: "build", list: DEFAULT_SKIP };
	}

	const skip_src = requested_skips();
	const requested = skip_src.list;
	const refused = requested.filter(n => CRITICAL_SCRIPTS.includes(n));
	const skip_list = requested.filter(n => !CRITICAL_SCRIPTS.includes(n));
	const active_scripts = scripts.filter(n => !skip_list.includes(n));

	if (refused.length) {
		game_log("🛡️ Refusing to skip critical: " + refused.join(", "), "#FF6666");
	}
	if (skip_list.length) {
		game_log("⏭️ Skipping " + skip_list.length + " of " + scripts.length + " [" + skip_src.src + "]: " + skip_list.join(", "), "#FFA500");
	}

	window.al_skip = function (...names) {
		const flat = (names.length === 1 && Array.isArray(names[0])) ? names[0] : names;
		localStorage.setItem(SKIP_KEY, JSON.stringify(flat));
		game_log("⏭️ AL_skip set (" + flat.length + ") — reload all characters to apply", "#FFA500");
		return flat;
	};

	window.al_skip_group = function (...groups) {
		const flat = [];
		groups.forEach(g => (SKIP_GROUPS[g] || []).forEach(n => flat.push(n)));
		return window.al_skip(flat);
	};

	window.al_skip_clear = function () {
		localStorage.removeItem(SKIP_KEY);
		game_log("⏭️ override removed — reverting to build default (" + DEFAULT_SKIP.length + " skipped); al_skip([]) forces none", "#FFA500");
	};

	window.al_skip_show = function () {
		game_log("⏭️ skip [" + skip_src.src + "] (" + requested.length + "): " + (requested.join(", ") || "none"));
		return { source: skip_src.src, requested: requested, active: active_scripts.length, total: scripts.length };
	};

	function load_one(base, name) {
		const url = base + encodeURI(name);
		return new Promise(resolve => {
			function attempt(retries) {
				p$.ajax({ url: url, dataType: "script", cache: CACHE_OK })
					.done(() => resolve(true))
					.fail((_, s, e) => {
						if (retries < MAX_RETRIES) {
							game_log(`🔄 Retrying to load ${name} (${retries + 1}/${MAX_RETRIES})...`);
							setTimeout(() => attempt(retries + 1), 500 + 500 * retries);
						} else {
							game_log("❌ Failed to load " + name + ": " + s);
							console.error("URL:", url, "err:", e);
							resolve(false);
						}
					});
			}
			attempt(0);
		});
	}

	function fetch_role_file(base, name) {
		const url = base + encodeURI(name);
		return new Promise(resolve => {
			function attempt(retries) {
				p$.ajax({ url: url, dataType: "text", cache: CACHE_OK })
					.done(text => resolve(text))
					.fail((_, s, e) => {
						if (retries < MAX_RETRIES) {
							game_log(`🔄 Retrying to load ${name} (${retries + 1}/${MAX_RETRIES})...`);
							setTimeout(() => attempt(retries + 1), 500 + 500 * retries);
						} else {
							game_log("❌ Failed to fetch " + name + ": " + s);
							console.error("URL:", url, "err:", e);
							resolve(null);
						}
					});
			}
			attempt(0);
		});
	}

	function eval_role_file(name, text) {
		if (text === null) return;
		if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
		text = text.replace(new RegExp("[\\u200B-\\u200D\\uFEFF]", "g"), "");
		try {
			(0, eval)(text);
		} catch (e) {
			game_log("❌ " + name + " eval error: " + e.message);
			console.error(e);
		}
	}

	function start_loading(base) {
		const role_texts = Promise.all(role_file.map(name => fetch_role_file(base, name)));
		load_one(base, first_script)
			.then(ok => {
				if (!ok) {
					game_log("🛑 CRITICAL: failed to load " + first_script + " after retries — aborting, bot cannot function. Reload to retry.");
					console.error("[BS] Critical script failed to load, aborting:", first_script);
					return null;
				}
				return Promise.all(active_scripts.map(name => load_one(base, name).then(ok2 => ({ name, ok: ok2 }))));
			})
			.then(results => {
				if (!results) return;
				const failed_critical = results.filter(r => !r.ok && CRITICAL_SCRIPTS.includes(r.name));
				if (failed_critical.length > 0) {
					const names = failed_critical.map(r => r.name).join(", ");
					game_log("🛑 CRITICAL: failed to load " + names + " after retries — aborting, bot cannot function. Reload to retry.");
					console.error("[BS] Critical script(s) failed to load, aborting role-file load:", names);
					return;
				}
				return role_texts
					.then(texts => {
						role_file.forEach((name, i) => eval_role_file(name, texts[i]));
						game_log("✅ All scripts loaded.");
					});
			});
	}

	const MAX_BASE_AGE_MS = 10 * 60 * 1000;

	function resolve_and_load() {
		p$.getJSON("https://api.github.com/repos/Aegis-940/Adventure-Lands/commits/main?_=" + Date.now())
			.done(repo_data => {
				const base = "https://cdn.jsdelivr.net/gh/Aegis-940/Adventure-Lands@" + repo_data.sha + "/";
				window.__AL_BASE__ = base;
				window.__AL_BASE_SET_AT__ = Date.now();
				CACHE_OK = true;
				game_log("📦 Loading commit " + repo_data.sha.slice(0, 7));
				start_loading(base);
			})
			.fail(() => {
				CACHE_OK = false;
				game_log("⚠️ Couldn't fetch SHA (GitHub rate limit?) — falling back to @main, which jsDelivr caches for 12h", "#FFA500");
				start_loading("https://cdn.jsdelivr.net/gh/Aegis-940/Adventure-Lands@main/");
			});
	}

	if (window.__AL_BASE__ && window.__AL_BASE_SET_AT__ && (Date.now() - window.__AL_BASE_SET_AT__) < MAX_BASE_AGE_MS) {
		CACHE_OK = true;
		start_loading(window.__AL_BASE__);
	} else {
		resolve_and_load();
	}
})();

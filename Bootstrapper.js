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

	const kernel_scripts = [
		"Kernel/Kernel.js",
		"Kernel/Scheduler.js",
		"Kernel/Events.js",
		"Kernel/Storage.js",
	];

	const first_scripts = [
		"Core Systems/Global Config.js",
		"Interface/Widget Helpers.js",
		"Interface/Game Log.js",
		"Encounters/Encounter Registry.js",
	];

	const scripts = [
		"Core Systems/Error Log.js",
		"Core Systems/Movement Manager.js",
		"Encounters/Bscorpion.js",
		"Encounters/Rime Djinn.js",
		"Core Systems/Combat Utilities.js",
		"Core Systems/Combat Formulas.js",
		"Core Systems/Combat Sampling.js",
		"Core Systems/Boss Profiler.js",
		"Core Systems/Movement Positioning.js",
		"Core Systems/Targeting.js",
		"Encounters/Porcupine.js",
		"Encounters/Monster Rules.js",
		"Encounters/Mummy.js",
		"Encounters/Halloween Bosses.js",
		"Encounters/Crabxx.js",
		"Encounters/Targetron-Sparkbot.js",
		"Encounters/Dryad.js",
		"Encounters/Fireroamer.js",
		"Core Systems/World Events.js",
		"Core Systems/Character Messaging.js",
		"Core Systems/Equipment Manager.js",
		"Core Systems/Equipment Valuation.js",
		"Core Systems/Party Management.js",
		"Core Systems/Loot Management.js",
		"Core Systems/Maintenance.js",
		"Core Systems/Party Cohesion.js",
		"Core Systems/Character Runner.js",
		"Core Systems/Skill Runner.js",
		"Core Systems/Farm Ledger.js",
		"Core Systems/Farm Survey.js",
		"Core Systems/Danger Log.js",
		"Core Systems/Error Handling.js",
		"Dungeons/Dungeon Runner.js",
		"Dungeons/Spider Dungeon.js",
		"Dungeons/Crypt Dungeon.js",
		"Dungeons/Dungeon Progress.js",
		"Dungeons/Dungeon Escape.js",
		"Dungeons/Dungeon Telemetry.js",
		"Dungeons/Dungeon Collection.js",
		"Dungeons/Crypt Route.js",
		"Dungeons/Dreams Cave.js",
		"Dungeons/Dungeon Mode.js",
		"Interface/Bank Sort Order.js",
		"Interface/XP Meter.js",
		"Interface/Gold Meter.js",
		"Interface/DPS Meter.js",
		"Interface/Boss Contribution.js",
		"Interface/Kill Tracker.js",
		"Interface/Lucky Slot Tracker.js",
		"Interface/Metrics Graphs.js",
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
	const REQUEST_TIMEOUT_MS = 10000;

	const OPTIONAL_SCRIPTS = new Set([
		"Encounters/Porcupine.js",
		"Encounters/Monster Rules.js",
		"Encounters/Mummy.js",
		"Encounters/Halloween Bosses.js",
		"Encounters/Crabxx.js",
		"Encounters/Targetron-Sparkbot.js",
		"Encounters/Dryad.js",
		"Encounters/Fireroamer.js",
		"Core Systems/Boss Profiler.js",
		"Core Systems/Error Log.js",
		"Dungeons/Spider Dungeon.js",
		"Dungeons/Crypt Dungeon.js",
		"Dungeons/Dungeon Collection.js",
		"Dungeons/Crypt Route.js",
		"Dungeons/Dungeon Mode.js",
		"Interface/Bank Sort Order.js",
		"Interface/XP Meter.js",
		"Interface/Gold Meter.js",
		"Interface/DPS Meter.js",
		"Interface/Boss Contribution.js",
		"Interface/Kill Tracker.js",
		"Interface/Lucky Slot Tracker.js",
		"Interface/Metrics Graphs.js",
		"Interface/Party Frames.js",
		"Interface/CC Meter.js",
		"Interface/Stats Window.js",
		"Interface/Settings Window.js",
		"Interface/Pause Button.js",
	]);

	function load_one(base, name) {
		const url = base + encodeURI(name);
		return new Promise(resolve => {
			function attempt(retries) {
				p$.ajax({ url: url, dataType: "script", cache: CACHE_OK, timeout: REQUEST_TIMEOUT_MS })
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

	function load_stage(base, names) {
		return Promise.all(names.map(name => load_one(base, name).then(ok => ({ name, ok }))))
			.then(results => {
				const failed = results.filter(r => !r.ok).map(r => r.name);
				if (!failed.length) return true;
				game_log("🛑 CRITICAL: failed to load " + failed.join(", ") + " after retries — aborting, bot cannot function. Reload to retry.");
				console.error("[BS] Critical script failed to load, aborting:", failed);
				return false;
			});
	}

	function fetch_role_file(base, name) {
		const url = base + encodeURI(name);
		return new Promise(resolve => {
			function attempt(retries) {
				p$.ajax({ url: url, dataType: "text", cache: CACHE_OK, timeout: REQUEST_TIMEOUT_MS })
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
		if (text === null) return false;
		if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
		text = text.replace(new RegExp("[\\u200B-\\u200D\\uFEFF]", "g"), "");
		try {
			(0, eval)(text);
			return true;
		} catch (e) {
			game_log("❌ " + name + " eval error: " + e.message);
			console.error(e);
			return false;
		}
	}

	function base_name(name) {
		return name.split("/").pop().replace(/\.js$/, "");
	}

	function boot(results, role_results) {
		const all = [...kernel_scripts, ...first_scripts, ...scripts, ...role_file];
		const ok = new Set(kernel_scripts.concat(first_scripts)
			.concat(results.filter(r => r.ok).map(r => r.name))
			.concat(role_results.filter(r => r.ok).map(r => r.name)));
		kernel_boot({
			order: all.map(base_name),
			loaded: all.filter(n => ok.has(n)).map(base_name),
			optional: [...OPTIONAL_SCRIPTS].map(base_name),
			entry: role_file.length ? base_name(role_file[role_file.length - 1]) : null,
		});
	}

	function start_loading(base) {
		const role_texts = Promise.all(role_file.map(name => fetch_role_file(base, name)));
		load_stage(base, kernel_scripts)
			.then(ok => ok && load_stage(base, first_scripts))
			.then(ok => ok ? Promise.all(scripts.map(name => load_one(base, name).then(ok2 => ({ name, ok: ok2 })))) : null)
			.then(results => {
				if (!results) return;
				const failed_critical = results.filter(r => !r.ok && !OPTIONAL_SCRIPTS.has(r.name));
				if (failed_critical.length > 0) {
					const names = failed_critical.map(r => r.name).join(", ");
					game_log("🛑 CRITICAL: failed to load " + names + " after retries — aborting, bot cannot function. Reload to retry.");
					console.error("[BS] Critical script(s) failed to load, aborting role-file load:", names);
					return;
				}
				return role_texts
					.then(texts => {
						const role_results = role_file.map((name, i) => ({ name, ok: eval_role_file(name, texts[i]) }));
						game_log("✅ All scripts loaded.");
						boot(results, role_results);
					});
			});
	}

	const MAX_BASE_AGE_MS = 10 * 60 * 1000;

	function resolve_and_load() {
		p$.ajax({ url: "https://api.github.com/repos/Aegis-940/Adventure-Lands/commits/main?_=" + Date.now(), dataType: "json", timeout: REQUEST_TIMEOUT_MS })
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

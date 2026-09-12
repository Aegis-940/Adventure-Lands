// -------------------------------------------------------------------- //
// BOOTSTRAPPER (reload-safe, commit-specific, debug-enabled)           //
// -------------------------------------------------------------------- //

window._cmListeners = window._cmListeners || [];

(function(){
	game_log("🔧 Bootstrap starting for " + character.name + "...");

	const p$ = window.$ || window.jQuery || parent.$;
	if (!p$) {
		return void game_log("❌ [Bootstrapper99] jQuery not found!");
	}
	p$.ajaxSetup({ cache: false });

	const first_script = "Shared/Game_Config.js";

	const scripts = [
		"Shared/Movement.js",
		"Shared/Bscorpion_Farm.js",
		"Shared/Combat_Utilities.js",
		"Shared/Targeting.js",
		"Shared/Events.js",
		"Shared/Messaging.js",
		"Shared/Equipment.js",
		"Shared/Party_Management.js",
		"Shared/Loot_Management.js",
		"Shared/Maintenance.js",
		"Shared/Cohesion.js",
		"Shared/Character_Runner.js",
		"Shared/Error_Handling.js",
		"Shared/Error_Log.js",
		"UI/Custom_Log.js",
		"UI/Bank_Sorter.js",
		"Shared/Widgets.js",
		"UI/Game_Log.js",
		"UI/XP_Meter.js",
		"UI/Gold_Meter.js",
		"UI/DPS_Meter.js",
		"UI/Remote_Bank_Viewer.js",
		"UI/Party_Frames.js",
		"UI/CC_Meter.js",
		"UI/Stats_Window.js",
		"UI/Settings_Window.js",
		"UI/Pause_Button.js"
	];

	const role_scripts = {
		"Ulric": ["Character_Functions/Warrior/Warrior_Config.js",
		"Character_Functions/Warrior/Warrior_Combat.js",
		"Character_Functions/Warrior/Warrior_Skills.js",
		"Character_Functions/Warrior/Warrior_Equipment.js",
		"Character_Functions/Warrior/Warrior_Movement.js",
		"Character_Functions/Warrior/Warrior_Bscorpion.js",
		"Character_Functions/Warrior/Warrior.js"],

		"Myras": ["Character_Functions/Healer/Healer_Config.js",
		"Character_Functions/Healer/Healer_Combat.js",
		"Character_Functions/Healer/Healer_Skills.js",
		"Character_Functions/Healer/Healer_Equipment.js",
		"Character_Functions/Healer/Healer_Movement.js",
		"Character_Functions/Healer/Healer_Dungeon.js",
		"Character_Functions/Healer/Healer.js"],

		"Riva": ["Character_Functions/Ranger/Ranger_Config.js",
		"Character_Functions/Ranger/Ranger_Combat.js",
		"Character_Functions/Ranger/Ranger_Skills.js",
		"Character_Functions/Ranger/Ranger_Equipment.js",
		"Character_Functions/Ranger/Ranger_Movement.js",
		"Character_Functions/Ranger/Ranger_Looting.js",
		"Character_Functions/Ranger/Ranger.js"],

		"Riff": ["Merchant_Systems/Auto_Upgrade.js",
		"Merchant_Systems/Auto_Craft.js",
		"Character_Functions/Merchant/Merchant_Config.js",
		"Character_Functions/Merchant/Merchant_Stand.js",
		"Character_Functions/Merchant/Merchant_Inventory.js",
		"Character_Functions/Merchant/Merchant_Exchange.js",
		"Character_Functions/Merchant/Merchant_Gear.js",
		"Character_Functions/Merchant/Merchant_Gathering.js",
		"Character_Functions/Merchant/Merchant_Party.js",
		"Character_Functions/Merchant/Merchant_Opportunistic.js",
		"Character_Functions/Merchant/Merchant_Tasks.js",
		"Character_Functions/Merchant/Merchant.js"]
	};
	const role_file = role_scripts[character.name] || [];
	if (!role_scripts[character.name]) {
		game_log("⚠️ No role script for " + character.name);
	}

	const MAX_RETRIES = 3;

	let FILE_SUFFIX = "";

	const CRITICAL_SCRIPTS = [
		"Shared/Game_Config.js",
		"Shared/Movement.js",
		"Shared/Bscorpion_Farm.js",
		"Shared/Combat_Utilities.js",
		"Shared/Targeting.js",
		"Shared/Events.js",
		"Shared/Messaging.js",
		"Shared/Equipment.js",
		"Shared/Party_Management.js",
		"Shared/Loot_Management.js",
		"Shared/Maintenance.js",
		"Shared/Cohesion.js",
		"Shared/Character_Runner.js",
		"Shared/Error_Handling.js",
	];

	function load_one(base, name) {
		const url = base + encodeURI(name) + FILE_SUFFIX;
		return new Promise(resolve => {
			function attempt(retries) {
				p$.getScript(url)
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

	function count_braces_excluding_literals(text) {
		const stripped = text
			.replace(/\/\*[\s\S]*?\*\//g, "")
			.replace(/\/\/[^\n]*/g, "")
			.replace(/`(?:\\.|[^`\\])*`/g, "")
			.replace(/"(?:\\.|[^"\\])*"/g, "")
			.replace(/'(?:\\.|[^'\\])*'/g, "");
		return {
			opens: (stripped.match(/{/g) || []).length,
			closes: (stripped.match(/}/g) || []).length
		};
	}

	function load_role_file(base, name) {
		const url = base + encodeURI(name) + FILE_SUFFIX;
		return new Promise(resolve => {
			function attempt(retries) {
				p$.get(url, function(text) {
					console.log("[BS] Fetched", name, "length=", text.length);
					console.log("[BS] Start of", name, ":\n", text.slice(0, 200));
					console.log("[BS] End of",   name, ":\n", text.slice(-200));
					const { opens, closes } = count_braces_excluding_literals(text);
					console.log("[BS] brace counts { } →", opens, closes);
					if (opens !== closes) {
						console.warn("[BS] Brace mismatch detected in", name);
					}
					if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
					text = text.replace(new RegExp("[\\u200B-\\u200D\\uFEFF]", "g"), "");
					try {
						(0, eval)(text);
					} catch (e) {
						game_log("❌ " + name + " eval error: " + e.message);
						console.error(e);
					}
					resolve();
				}).fail((_, s, e) => {
					if (retries < MAX_RETRIES) {
						game_log(`🔄 Retrying to load ${name} (${retries + 1}/${MAX_RETRIES})...`);
						setTimeout(() => attempt(retries + 1), 500 + 500 * retries);
					} else {
						game_log("❌ Failed to fetch " + name + ": " + s);
						console.error("URL:", url, "err:", e);
						resolve();
					}
				});
			}
			attempt(0);
		});
	}

	function load_sequential(names, loader) {
		return names.reduce((chain, name) => chain.then(() => loader(name)), Promise.resolve());
	}

	function start_loading(base) {
		load_one(base, first_script)
			.then(ok => {
				if (!ok) {
					game_log("🛑 CRITICAL: failed to load " + first_script + " after retries — aborting, bot cannot function. Reload to retry.");
					console.error("[BS] Critical script failed to load, aborting:", first_script);
					return null;
				}
				return Promise.all(scripts.map(name => load_one(base, name).then(ok2 => ({ name, ok: ok2 }))));
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
				return load_sequential(role_file, name => load_role_file(base, name))
					.then(() => game_log("✅ All scripts loaded."));
			});
	}

	const MAX_BASE_AGE_MS = 10 * 60 * 1000;

	function resolve_and_load() {
		p$.getJSON("https://api.github.com/repos/Aegis-940/Adventure-Lands/commits/main?_=" + Date.now())
			.done(repo_data => {
				const base = "https://cdn.jsdelivr.net/gh/Aegis-940/Adventure-Lands@" + repo_data.sha + "/";
				FILE_SUFFIX = "";
				window.__AL_BASE__ = base;
				window.__AL_BASE_SET_AT__ = Date.now();
				game_log("📦 Loading commit " + repo_data.sha.slice(0, 7));
				start_loading(base);
			})
			.fail(() => {
				FILE_SUFFIX = "?_=" + Date.now();
				game_log("⚠️ Couldn't fetch SHA (GitHub rate limit?) — falling back to @main, cache-busted", "#FFA500");
				start_loading("https://cdn.jsdelivr.net/gh/Aegis-940/Adventure-Lands@main/");
			});
	}

	if (window.__AL_BASE__ && window.__AL_BASE_SET_AT__ && (Date.now() - window.__AL_BASE_SET_AT__) < MAX_BASE_AGE_MS) {
		start_loading(window.__AL_BASE__);
	} else {
		resolve_and_load();
	}
})();

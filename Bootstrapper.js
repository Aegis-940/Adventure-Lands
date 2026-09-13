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

	const first_script = "Core Systems/Global Config.js";

	const scripts = [
		"Core Systems/Movement.js",
		"Core Systems/Bscorpion Camp.js",
		"Core Systems/Combat Utilities.js",
		"Core Systems/Targeting.js",
		"Core Systems/World Events.js",
		"Core Systems/Character Messaging.js",
		"Core Systems/Equipment.js",
		"Core Systems/Party Management.js",
		"Core Systems/Loot Management.js",
		"Core Systems/Maintenance.js",
		"Core Systems/Party Cohesion.js",
		"Core Systems/Character Runner.js",
		"Core Systems/Error Handling.js",
		"Core Systems/Error Log.js",
		"Interface/Custom Log.js",
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
		"Character Managers/Warrior Manager/Warrior Bscorpion.js",
		"Character Managers/Warrior Manager/Warrior.js"],

		"Myras": ["Character Managers/Healer Manager/Healer Config.js",
		"Character Managers/Healer Manager/Healer Combat.js",
		"Character Managers/Healer Manager/Healer Skills.js",
		"Character Managers/Healer Manager/Healer Equipment.js",
		"Character Managers/Healer Manager/Healer Movement.js",
		"Character Managers/Healer Manager/Healer Dungeon.js",
		"Character Managers/Healer Manager/Healer.js"],

		"Riva": ["Character Managers/Ranger Manager/Ranger Config.js",
		"Character Managers/Ranger Manager/Ranger Combat.js",
		"Character Managers/Ranger Manager/Ranger Skills.js",
		"Character Managers/Ranger Manager/Ranger Equipment.js",
		"Character Managers/Ranger Manager/Ranger Movement.js",
		"Character Managers/Ranger Manager/Ranger Looting.js",
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

	let FILE_SUFFIX = "";

	const CRITICAL_SCRIPTS = [
		"Core Systems/Global Config.js",
		"Core Systems/Movement.js",
		"Core Systems/Bscorpion Camp.js",
		"Core Systems/Combat Utilities.js",
		"Core Systems/Targeting.js",
		"Core Systems/World Events.js",
		"Core Systems/Character Messaging.js",
		"Core Systems/Equipment.js",
		"Core Systems/Party Management.js",
		"Core Systems/Loot Management.js",
		"Core Systems/Maintenance.js",
		"Core Systems/Party Cohesion.js",
		"Core Systems/Character Runner.js",
		"Core Systems/Error Handling.js",
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

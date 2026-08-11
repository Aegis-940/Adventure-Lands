// -------------------------------------------------------------------- //
// BOOTSTRAPPER (reload-safe, commit-specific, debug-enabled)           //
// -------------------------------------------------------------------- //

// Seed CM listeners up‐front
window._cmListeners = window._cmListeners || [];

(function(){
	game_log("🔧 Bootstrap starting for " + character.name + "...");

	const p$ = window.$ || window.jQuery || parent.$;
	if (!p$) {
		return void game_log("❌ [Bootstrapper99] jQuery not found!");
	}
	p$.ajaxSetup({ cache: false });

	// None of these reference each other at load time — every cross-file call
	// (make_draggable, smarter_move, etc.) happens inside a function or event
	// handler, invoked well after boot finishes — so they load in parallel.
	const scripts = [
		"Shared/Common Functions.js",
		"UI/Custom_Log.js",
		"UI/Bank_Sorter.js",
		"Shared/Buttons.js",
		"Shared/Windows.js",
		"UI/Game_Log.js",
		"UI/XP_Meter.js",
		"UI/Gold_Meter.js",
		"UI/DPS_Meter.js",
		"UI/Remote_Bank_Viewer.js",
		"UI/Party_Frames.js",
		"UI/CC_Meter.js",
		"UI/Stats_Window.js"
	];

	const roleScripts = {
		"Ulric": ["Character Functions/Warrior Functions.js",
		"Characters/Tank.js"],

		"Myras": ["Character Functions/Healer Functions.js",
		"Characters/Healer.js"],

		"Riva": ["Character Functions/Ranger Functions.js",
		"Characters/Ranger.js"],

		"Riff": ["Merchant Systems/Auto Upgrade.js",
		"Character Functions/Merchant Functions.js",
		"Characters/Merchant.js"]
	};
	const roleFile = roleScripts[character.name] || [];
	if (!roleScripts[character.name]) {
		game_log("⚠️ No role script for " + character.name);
	}

	const MAX_RETRIES = 3;

	// Loads one shared/UI script via getScript() (real <script> tag — always
	// global scope). Always resolves, even on final failure, so one bad file
	// can't block the rest of the batch — matches the prior best-effort behavior.
	function loadOne(base, name) {
		const url = base + encodeURI(name);
		return new Promise(resolve => {
			function attempt(retries) {
				p$.getScript(url)
					.done(() => resolve())
					.fail((_, s, e) => {
						if (retries < MAX_RETRIES) {
							game_log(`🔄 Retrying to load ${name} (${retries + 1}/${MAX_RETRIES})...`);
							setTimeout(() => attempt(retries + 1), 500 + 500 * retries);
						} else {
							game_log("❌ Failed to load " + name + ": " + s);
							console.error("URL:", url, "err:", e);
							resolve();
						}
					});
			}
			attempt(0);
		});
	}

	// Loads a role file via fetch+eval with brace-count diagnostics — kept
	// exactly as before, just wrapped in a Promise. Always resolves.
	function loadRoleFile(base, name) {
		const url = base + encodeURI(name);
		return new Promise(resolve => {
			function attempt(retries) {
				p$.get(url, function(text) {
					console.log("[BS] Fetched", name, "length=", text.length);
					console.log("[BS] Start of", name, ":\n", text.slice(0, 200));
					console.log("[BS] End of",   name, ":\n", text.slice(-200));
					const opens  = (text.match(/{/g) || []).length;
					const closes = (text.match(/}/g) || []).length;
					console.log("[BS] brace counts { } →", opens, closes);
					if (opens !== closes) {
						console.warn("[BS] Brace mismatch detected in", name);
					}
					if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
					text = text.replace(new RegExp("[\\u200B-\\u200D\\uFEFF]", "g"), "");
					try {
						// Indirect eval — runs in global scope, same as getScript() above.
						// A direct eval() here would trap this file's top-level
						// declarations inside this callback's closure.
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

	// Role files still load strictly in order (each may depend on the previous).
	function loadSequential(names, loader) {
		return names.reduce((chain, name) => chain.then(() => loader(name)), Promise.resolve());
	}

	function startLoading(base) {
		Promise.all(scripts.map(name => loadOne(base, name)))
			.then(() => loadSequential(roleFile, name => loadRoleFile(base, name)))
			.then(() => game_log("✅ All scripts loaded."));
	}

	// The loader snippet that evals this file may already have resolved the
	// commit SHA to fetch it — reuse that instead of hitting the GitHub API
	// again for the same information.
	if (window.__AL_BASE__) {
		startLoading(window.__AL_BASE__);
	} else {
		p$.getJSON("https://api.github.com/repos/Aegis-940/Adventure-Lands/commits/main")
			.done(repoData => {
				startLoading("https://cdn.jsdelivr.net/gh/Aegis-940/Adventure-Lands@" + repoData.sha + "/");
			})
			.fail(() => {
				game_log("⚠️ Couldn't fetch SHA; falling back to main");
				startLoading("https://cdn.jsdelivr.net/gh/Aegis-940/Adventure-Lands@main/");
			});
	}
})();

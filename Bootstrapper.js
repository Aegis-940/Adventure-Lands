// -------------------------------------------------------------------- //
// BOOTSTRAPPER (reload-safe, commit-specific, debug-enabled)           //
// -------------------------------------------------------------------- //

/* NOT CURRENTLY USED

// Seed CM listeners up‐front
window._cmListeners = window._cmListeners || [];

(function(){
	game_log("🔧 Bootstrap starting for " + character.name + "...");

	const p$ = window.$ || window.jQuery || parent.$;
	if (!p$) {
		return void game_log("❌ [Bootstrapper99] jQuery not found!");
	}
	p$.ajaxSetup({ cache: false });

	const scripts = [
		"Common Functions.js",
		"UI/Custom_Log.js",
		"Bank_Sorter.js",
		"Buttons.js",
		"Windows.js",
		"CC_Manager.js",
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
		
		"Riff": ["Auto Upgrade.js",
		"Character Functions/Merchant Functions.js",
		"Characters/Merchant.js"]
	};
	const roleFile = roleScripts[character.name];
	if (roleFile) {
		if (Array.isArray(roleFile)) {
			scripts.push(...roleFile); // spread into flat list
		} else {
			scripts.push(roleFile);
		}
	} else {
		game_log("⚠️ No role script for " + character.name);
	}

	// get commit SHA
	p$.getJSON("https://api.github.com/repos/Aegis-940/Adventure-Lands/commits/main")
		.done(repoData => {
			const base = "https://cdn.jsdelivr.net/gh/Aegis-940/Adventure-Lands@" + repoData.sha + "/";
			startLoading(base);
		})
		.fail(() => {
			game_log("⚠️ Couldn't fetch SHA; falling back to main");
			startLoading("https://cdn.jsdelivr.net/gh/Aegis-940/Adventure-Lands@main/");
		});

	function startLoading(base) {
		let i = 0;
		const maxRetries = 3;
		function loadNext(retries = 0) {
			if (i >= scripts.length) {
				return void game_log("✅ All scripts loaded.");
			}
			const name = scripts[i++];
			const url = base + encodeURI(name);

			function retryOrFail(msg, err) {
				if (retries < maxRetries) {
					game_log(`🔄 Retrying to load ${name} (${retries + 1}/${maxRetries})...`);
					i--; // step back so we retry the same script
					setTimeout(() => loadNext(retries + 1), 500 + 500 * retries); // exponential backoff
				} else {
					game_log(msg);
					if (err) console.error("URL:", url, "err:", err);
					loadNext();
				}
			}

			if (name === roleFile) {
				// —— DEBUG FETCH ——
				p$.get(url, function(text) {
					console.log("[BS] Fetched", name, "length=", text.length);
					console.log("[BS] Start of", name, ":\n", text.slice(0,200));
					console.log("[BS] End of",   name, ":\n", text.slice(-200));
					const opens  = (text.match(/{/g)||[]).length;
					const closes = (text.match(/}/g)||[]).length;
					console.log("[BS] brace counts { } →", opens, closes);
					if (opens !== closes) {
						console.warn("[BS] Brace mismatch detected in", name);
					}
					// —— CLEAN & EVAL ——
					if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
					text = text.replace(/[\u200B-\u200D\uFEFF]/g, "");
					try {
						eval(text);
					} catch(e) {
						game_log("❌ " + name + " eval error: " + e.message);
						console.error(e);
					}
					loadNext();
				}).fail((_, s, e) => {
					retryOrFail("❌ Failed to fetch " + name + ": " + s, e);
				});
			} else {
				// normal scripts
				p$.getScript(url)
				 .done(() => {
					 loadNext();
				 })
				 .fail((_, s, e) => {
					 retryOrFail("❌ Failed to load " + name + ": " + s, e);
				 });
			}
		}
		loadNext();
	}
})();

*/
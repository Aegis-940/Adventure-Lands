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

	// Cross-file calls happen inside functions/handlers invoked after boot, so these load in parallel.
	const scripts = [
		"Shared/Game_Config.js",
		"Shared/Movement.js",
		"Shared/Combat_Utilities.js",
		"Shared/Messaging.js",
		"Shared/Party_And_Loot.js",
		"Shared/Error_Handling.js",
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
		"UI/Settings_Window.js"
	];

	const role_scripts = {
		"Ulric": ["Character_Functions/Warrior_Functions.js",
		"Character_Functions/Warrior_Skills.js",
		"Characters/Tank.js"],

		"Myras": ["Character_Functions/Healer_Functions.js",
		"Character_Functions/Healer_Skills.js",
		"Characters/Healer.js"],

		"Riva": ["Character_Functions/Ranger_Functions.js",
		"Characters/Ranger.js"],

		"Riff": ["Merchant_Systems/Auto_Upgrade.js",
		"Merchant_Systems/Auto_Craft.js",
		"Character_Functions/Merchant_Functions.js",
		"Characters/Merchant.js"]
	};
	const role_file = role_scripts[character.name] || [];
	if (!role_scripts[character.name]) {
		game_log("⚠️ No role script for " + character.name);
	}

	const MAX_RETRIES = 3;

	// Window in which a second bootstrap counts as a duplicate rather than a deliberate restart.
	// The reload button does a full page reload, which clears window, so real restarts are unaffected.
	const DUPLICATE_START_MS = 20000;

	// Appended to every file URL. Stays "" for an immutable @<sha> base (safe to cache
	// forever). Set to a timestamp for the @main fallback, which jsDelivr caches for ~12h --
	// without this, reloads keep replaying whatever @main looked like when it was first
	// cached, so pushed fixes silently never arrive.
	let FILE_SUFFIX = "";

	// Role files depend on globals these define — abort loudly instead of failing on undefined functions.
	const CRITICAL_SCRIPTS = [
		"Shared/Game_Config.js",
		"Shared/Movement.js",
		"Shared/Combat_Utilities.js",
		"Shared/Messaging.js",
		"Shared/Party_And_Loot.js",
		"Shared/Error_Handling.js",
	];

	// Always resolves (success: true/false) so one bad file can't block the rest of the batch.
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

	// Strips comments/strings first so braces inside them don't cause false mismatch warnings.
	// Not a full tokenizer — a brace inside a regex literal can still slip through.
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

	// Loads a role file via fetch+eval with brace-count diagnostics. Resolves true only if the
	// file both fetched and eval'd cleanly — a partial role load is not survivable (see
	// load_sequential), so the caller has to be able to tell.
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
						// Indirect eval — runs in global scope; direct eval() would trap declarations in this closure.
						(0, eval)(text);
					} catch (e) {
						game_log("❌ " + name + " eval error: " + e.message);
						console.error(e);
						return resolve(false);
					}
					resolve(true);
				}).fail((_, s, e) => {
					if (retries < MAX_RETRIES) {
						game_log(`🔄 Retrying to load ${name} (${retries + 1}/${MAX_RETRIES})...`);
						setTimeout(() => attempt(retries + 1), 500 + 500 * retries);
					} else {
						game_log("❌ Failed to fetch " + name + ": " + s);
						console.error("URL:", url, "err:", e);
						resolve(false);
					}
				});
			}
			attempt(0);
		});
	}

	// Role files load strictly in order (each may depend on the previous), and the chain STOPS at
	// the first failure. Continuing was actively harmful: on a code-only restart the previous
	// load's function/var declarations are still on the global object, so a file that failed to
	// fetch or threw on eval leaves its OLD version in scope while the rest of the batch loads
	// new — a character silently running half of one build and half of another.
	function load_sequential(names, loader) {
		return names.reduce(
			(chain, name) => chain.then(ok => ok ? loader(name) : false),
			Promise.resolve(true)
		);
	}

	function start_loading(base) {
		// Bumped before anything loads. Every loop scheduled by the previous load compares against
		// this and stops rescheduling — see the loop generation guard in Shared/Game_Config.js.
		window.__AL_GEN__ = (window.__AL_GEN__ || 0) + 1;

		Promise.all(scripts.map(name => load_one(base, name).then(ok => ({ name, ok }))))
			.then(results => {
				const failed_critical = results.filter(r => !r.ok && CRITICAL_SCRIPTS.includes(r.name));
				if (failed_critical.length > 0) {
					const names = failed_critical.map(r => r.name).join(", ");
					game_log("🛑 CRITICAL: failed to load " + names + " after retries — aborting, bot cannot function. Reload to retry.");
					console.error("[BS] Critical script(s) failed to load, aborting role-file load:", names);
					return;
				}
				return load_sequential(role_file, name => load_role_file(base, name))
					.then(ok => {
						if (ok) return game_log("✅ All scripts loaded.");
						game_log("🛑 CRITICAL: a role script failed — this character is running a PARTIAL build "
							+ "(the previous load's globals are still in scope). Reload to retry.", "#FF4444");
					});
			});
	}

	// Reuse the already-resolved commit SHA if fresh, otherwise re-resolve (avoid building on a stale SHA).
	const MAX_BASE_AGE_MS = 10 * 60 * 1000; // 10 minutes

	function base_for(sha) {
		return "https://cdn.jsdelivr.net/gh/Aegis-940/Adventure-Lands@" + sha + "/";
	}

	// The resolved SHA is shared across all four characters through localStorage: they run in
	// same-origin iframes, so one resolve serves the whole party. Two reasons this matters more
	// than the staleness it risks:
	//   1. api.github.com allows 60 unauthenticated requests/hour. Four characters each spending
	//      their own request per reload is what produces the 403s.
	//   2. The CM protocol (panic broadcasts, instance handshakes) is only coherent within ONE
	//      build. A party split across commits is a worse failure than a party a few minutes old.
	// Wrapped in try/catch throughout: storage access can be blocked outright (the client's
	// "Tracking Prevention blocked access to storage" console spam is exactly that).
	const SHA_KEY = "AL_bootstrap_sha";
	const SHA_AT_KEY = "AL_bootstrap_sha_at";

	function read_shared_sha() {
		try {
			const sha = localStorage.getItem(SHA_KEY);
			const at = parseInt(localStorage.getItem(SHA_AT_KEY), 10);
			return (sha && at) ? { sha, at } : null;
		} catch (e) {
			return null;
		}
	}

	function write_shared_sha(sha) {
		try {
			localStorage.setItem(SHA_KEY, sha);
			localStorage.setItem(SHA_AT_KEY, String(Date.now()));
		} catch (e) {
			// Storage blocked — per-window reuse below still works, just not across characters.
		}
	}

	function load_sha(sha, note) {
		FILE_SUFFIX = ""; // @<sha> is immutable — caching it is correct
		window.__AL_BASE__ = base_for(sha);
		window.__AL_BASE_SET_AT__ = Date.now();
		game_log("📦 Loading commit " + sha.slice(0, 7) + (note || ""));
		start_loading(window.__AL_BASE__);
	}

	function resolve_and_load() {
		// Cache-busted: without this, the browser can serve a stale cached response for
		// this exact URL even on an explicit reload, pinning the whole session to an old SHA.
		p$.getJSON("https://api.github.com/repos/Aegis-940/Adventure-Lands/commits/main?_=" + Date.now())
			.done(repo_data => {
				write_shared_sha(repo_data.sha);
				load_sha(repo_data.sha);
			})
			.fail(xhr => {
				const status = (xhr && xhr.status) || "?";
				const stored = read_shared_sha();
				if (stored) {
					// Prefer a known commit another character already resolved, however old, over
					// @main. jsDelivr caches branch URLs for ~12h, and a ?_= query does NOT purge
					// that (only purge.jsdelivr.net does) — the previous "cache-busted" comment
					// here was wrong. So @main can hand different characters different snapshots,
					// which is precisely the mixed-build party this is trying to avoid.
					const age_min = Math.round((Date.now() - stored.at) / 60000);
					game_log("⚠️ SHA fetch failed (HTTP " + status + ") — reusing the party's commit ("
						+ age_min + "m old)", "#FFA500");
					load_sha(stored.sha);
					return;
				}
				// Nothing known at all. raw.githubusercontent serves the real branch tip on a
				// short cache rather than jsDelivr's 12h branch snapshot.
				FILE_SUFFIX = "?_=" + Date.now();
				game_log("⚠️ SHA fetch failed (HTTP " + status + ") and no known party commit — falling back "
					+ "to raw @main. This build may not match the rest of the party.", "#FF4444");
				start_loading("https://raw.githubusercontent.com/Aegis-940/Adventure-Lands/main/");
			});
	}

	// Skip, don't just warn. Re-running in the same window re-evaluates every Shared/*.js, whose
	// top-level `const`s cannot be re-declared — the file throws at instantiation and none of its
	// statements run, so Game_Config.js takes al_timeout()/al_interval() down with it and
	// Messaging.js takes every CM handler. The loop generation guard handles duplicate CHAINS;
	// it cannot help with a file that never re-evaluated.
	const started = window.__AL_BOOTSTRAP_STARTED__ || 0;
	if (Date.now() - started < DUPLICATE_START_MS) {
		game_log("⏭️ Bootstrapper: a load started " + (Date.now() - started)
			+ "ms ago — skipping this duplicate run.", "#FFA500");
		return;
	}
	window.__AL_BOOTSTRAP_STARTED__ = Date.now();

	const stored_sha = read_shared_sha();
	if (window.__AL_BASE__ && window.__AL_BASE_SET_AT__ && (Date.now() - window.__AL_BASE_SET_AT__) < MAX_BASE_AGE_MS) {
		game_log("📦 Reusing " + window.__AL_BASE__);
		start_loading(window.__AL_BASE__);
	} else if (stored_sha && Date.now() - stored_sha.at < MAX_BASE_AGE_MS) {
		// Another character resolved this recently — no API request needed.
		load_sha(stored_sha.sha, " (shared)");
	} else {
		resolve_and_load();
	}
})();

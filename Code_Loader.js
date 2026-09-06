// --------------------------------------------------------------------------------------------------------------------------------- //
// CODE LOADER — the ONLY file that lives in the game's code slots. Everything else is fetched
// from GitHub by Bootstrapper.js, which this file fetches and evals.
//
// Kept in the repo (even though the repo can't load it) so it stops silently drifting per
// character: a slot holding an older copy of this file is invisible in-game and produced a
// party split across builds.
//
// Paste into ONE slot and point all four characters at it.
// --------------------------------------------------------------------------------------------------------------------------------- //

(function load_bootstrapper() {
	const REPO = "Aegis-940/Adventure-Lands";
	const MAX_RETRIES = 2;
	const TIMEOUT_MS = 8000;
	const MAX_SHA_AGE_MS = 10 * 60 * 1000;
	const DUPLICATE_START_MS = 20000;

	// A second start in the same window re-evaluates every Shared/*.js. Those are real script
	// tags, so their top-level `const`s live in the global lexical scope and cannot be
	// re-declared: the file throws "Identifier 'X' has already been declared" at instantiation
	// and NONE of its statements run, silently leaving the previous load's definitions in place.
	// Game_Config.js failing that way takes al_timeout()/al_interval() with it; Messaging.js
	// failing takes every CM handler. Guarding the entry is far safer than trying to make ~120
	// declarations idempotent, and a double load is not something to survive gracefully anyway —
	// it also double-dispatches CM messages and duplicates every UI widget.
	//
	// The reload button does a full page reload, which clears window, so a legitimate restart is
	// never blocked by this.
	const now = Date.now();
	if (window.__AL_LOAD_STARTED__ && now - window.__AL_LOAD_STARTED__ < DUPLICATE_START_MS) {
		game_log("⏭️ Code Loader: a load started " + (now - window.__AL_LOAD_STARTED__)
			+ "ms ago — skipping this duplicate start.", "#FFA500");
		return;
	}
	window.__AL_LOAD_STARTED__ = now;

	// Same keys Bootstrapper.js reads. Four characters in same-origin iframes share one resolved
	// SHA, so a full party reload costs ONE api.github.com request instead of eight.
	const SHA_KEY = "AL_bootstrap_sha";
	const SHA_AT_KEY = "AL_bootstrap_sha_at";

	function fetch_with_timeout(url, options) {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
		return fetch(url, Object.assign({}, options, { signal: controller.signal }))
			.finally(() => clearTimeout(timer));
	}

	// Storage can be blocked outright (the client's "Tracking Prevention blocked access to
	// storage" spam) — every access is guarded so a block degrades to the old behaviour.
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
			// Blocked — each character just resolves its own SHA, as before.
		}
	}

	function base_for(sha) {
		return "https://cdn.jsdelivr.net/gh/" + REPO + "@" + sha + "/";
	}

	function resolve_base(attempt) {
		attempt = attempt || 0;

		const stored = read_shared_sha();
		if (stored && Date.now() - stored.at < MAX_SHA_AGE_MS) {
			return Promise.resolve(base_for(stored.sha));
		}

		return fetch_with_timeout("https://api.github.com/repos/" + REPO + "/commits/main", { cache: "no-store" })
			.then(res => {
				if (!res.ok) {
					const err = new Error("HTTP " + res.status);
					err.status = res.status;
					throw err;
				}
				return res.json();
			})
			.then(data => {
				write_shared_sha(data.sha);
				return base_for(data.sha);
			})
			.catch(e => {
				// Retry only transient failures. A 403 is the 60-req/hour rate limit and a 4xx
				// generally won't change on an immediate retry — the old loader retried anyway
				// and spent three requests per character making the limit harder to get under.
				const transient = !e.status || e.status >= 500;
				if (transient && attempt < MAX_RETRIES) return resolve_base(attempt + 1);

				const known = read_shared_sha();
				if (known) {
					// A known commit, however old, beats @main: jsDelivr caches branch URLs for
					// ~12h and a query string does not purge that, so @main can hand different
					// characters different snapshots.
					const age_min = Math.round((Date.now() - known.at) / 60000);
					game_log("⚠️ SHA fetch failed (" + e.message + ") — reusing the party's commit ("
						+ age_min + "m old)", "#FFA500");
					return base_for(known.sha);
				}

				game_log("⚠️ SHA fetch failed (" + e.message + ") and no known party commit — falling back "
					+ "to raw @main. This build may not match the rest of the party.", "#FF4444");
				return "https://raw.githubusercontent.com/" + REPO + "/main/";
			});
	}

	function load_bootstrapper_file(base, attempt) {
		attempt = attempt || 0;
		return fetch_with_timeout(base + "Bootstrapper.js", { cache: "no-store" })
			.then(res => {
				if (!res.ok) throw new Error("HTTP " + res.status);
				return res.text();
			})
			.catch(e => {
				// Retry covers the FETCH only. It deliberately stops before the eval below,
				// because that eval starts loading every other file — retrying it would not
				// recover, it would double-load.
				if (attempt < MAX_RETRIES) return load_bootstrapper_file(base, attempt + 1);
				game_log("❌ Bootstrapper fetch failed: " + e.message, "#FF4444");
				return null;
			})
			.then(text => {
				if (!text) return; // already fetched-and-eval'd by a retry, or gave up
				// Both globals, not just the base: Bootstrapper.js gates its reuse on
				// __AL_BASE_SET_AT__ as well, so setting only __AL_BASE__ made it re-resolve the
				// SHA itself — a second api.github.com request per character, and a chance of
				// loading the files from a different commit than this Bootstrapper.js came from.
				window.__AL_BASE__ = base;
				window.__AL_BASE_SET_AT__ = Date.now();
				try {
					(0, eval)(text); // indirect eval — runs in global scope
				} catch (e) {
					game_log("❌ Bootstrapper eval failed: " + e.message, "#FF4444");
					console.error(e);
				}
			});
	}

	resolve_base().then(base => load_bootstrapper_file(base));
})();

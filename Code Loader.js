// --------------------------------------------------------------------------------------------------------------------------------- //
// CODE LOADER — the only file that lives in a game code slot
// --------------------------------------------------------------------------------------------------------------------------------- //

(function () {
	const REPO = "Aegis-940/Adventure-Lands";
	const MAIN_BASE = `https://cdn.jsdelivr.net/gh/${REPO}@main/`;
	const SHA_URL = `https://api.github.com/repos/${REPO}/commits/main`;
	const TIMEOUT_MS = 8000;
	const RETRIES = 2;

	const ROOT = typeof globalThis !== "undefined" ? globalThis : this;

	const SINK_URL = "http://127.0.0.1:8787/errors";

	function beacon(msg) {
		try {
			navigator.sendBeacon(SINK_URL, JSON.stringify({
				character: (typeof character === "object" && character && character.name) || "unknown",
				build: "loader",
				lifecycle: { t: Date.now(), msg: "loader " + msg }
			}));
		} catch (e) {}
	}

	function say(msg) {
		beacon(msg);
		try { if (typeof game_log === "function") return game_log(msg); } catch (e) {}
		try { console.log(msg); } catch (e) {}
	}

	const guard = (function () {
		try { if (typeof parent === "object" && parent) return parent; } catch (e) {}
		return ROOT;
	})();
	if (guard.__AL_LOAD_STARTED__) return say("[AL] already loaded in this tab — reload the tab to restart");
	guard.__AL_LOAD_STARTED__ = Date.now();
	beacon("started");

	if (typeof document === "undefined") {
		const t = n => { try { return eval("typeof " + n); } catch (e) { return "err"; } };
		const p = n => { try { return typeof parent[n]; } catch (e) { return "err"; } };
		say("[AL] headless globals — " + ["fetch", "XMLHttpRequest", "require", "process", "eval",
			"$", "localStorage", "character", "G", "S", "game_log", "setTimeout", "Promise"]
			.map(n => n + "=" + t(n)).join(" "));
		say("[AL] parent.* — " + ["socket", "entities", "character", "G", "S", "$", "push_deferred",
			"open_chest", "window", "location"].map(n => n + "=" + p(n)).join(" "));
		say("[AL] api — " + ["attack", "use_skill", "heal", "smart_move", "move", "get_party",
			"get_player", "is_disabled", "can_use", "is_on_cooldown", "equip", "buy", "use",
			"quantity", "locate_item", "send_cm", "on_cm", "get_chests", "respawn", "load_code"]
			.map(n => n + "=" + t(n)).join(" "));
		try { say("[AL] parent keys = " + Object.keys(parent).length); } catch (e) {}
		return;
	}

	function get(url, mode, tries) {
		tries = tries || 0;
		return Promise.race([
			fetch(url, { cache: mode || "no-store" }),
			new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), TIMEOUT_MS))
		])
			.then(res => {
				if (!res.ok) throw new Error("HTTP " + res.status);
				return res.text();
			})
			.catch(e => {
				if (tries < RETRIES) return get(url, mode, tries + 1);
				throw e;
			});
	}

	let pinned = false;

	function resolve_base() {
		return get(SHA_URL + "?_=" + Date.now())
			.then(text => {
				const sha = JSON.parse(text).sha;
				if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error("bad sha");
				window.__AL_BASE__ = `https://cdn.jsdelivr.net/gh/${REPO}@${sha}/`;
				window.__AL_BASE_SET_AT__ = Date.now();
				pinned = true;
				say("[AL] pinned to " + sha.slice(0, 7));
				return window.__AL_BASE__;
			})
			.catch(e => {
				say("⚠️ [AL] couldn't resolve the commit (" + e.message + ") — Bootstrapper from @main, which jsDelivr caches for 12h");
				return MAIN_BASE;
			});
	}

	const RETRY_STEP_MS = 5000;
	const RETRY_MAX_MS = 60000;

	function boot(attempt) {
		resolve_base()
			.then(base => get(base + "Bootstrapper.js", pinned ? "default" : "no-store"))
			.then(
				text => {
					beacon("bootstrapper fetched on attempt " + attempt + ", evaluating");
					try {
						(0, eval)(text);
						beacon("bootstrapper evaluated");
					} catch (e) {
						say("❌ Bootstrapper threw while evaluating: " + e.message);
					}
				},
				e => {
					const wait = Math.min(RETRY_MAX_MS, RETRY_STEP_MS * attempt);
					say("❌ Bootstrapper fetch failed on attempt " + attempt + " (" + e.message
						+ ") — retrying in " + Math.round(wait / 1000) + "s");
					setTimeout(() => boot(attempt + 1), wait);
				}
			);
	}

	boot(1);
})();

// --------------------------------------------------------------------------------------------------------------------------------- //
// CODE LOADER — the only file that lives in a game code slot
// --------------------------------------------------------------------------------------------------------------------------------- //

(function () {
	const CODE = "http://127.0.0.1:8787/code/";
	const SINK_URL = "http://127.0.0.1:8787/errors";
	const TIMEOUT_MS = 5000;
	const RETRY_MS = 5000;

	const ROOT = typeof globalThis !== "undefined" ? globalThis : this;

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

	function get(url) {
		return Promise.race([
			fetch(url, { cache: "no-store" }),
			new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), TIMEOUT_MS))
		]).then(res => {
			if (!res.ok) throw new Error("HTTP " + res.status);
			return res.text();
		});
	}

	function boot(attempt) {
		get(CODE + "main")
			.then(sha => {
				const base = CODE + sha.trim() + "/";
				return get(base + "Bootstrapper.js").then(text => ({ sha: sha.trim(), base, text }));
			})
			.then(
				({ sha, base, text }) => {
					window.__AL_BASE__ = base;
					window.__AL_BASE_SET_AT__ = Date.now();
					say("[AL] loading " + sha.slice(0, 7) + " from this PC");
					beacon("bootstrapper fetched on attempt " + attempt + ", evaluating");
					try {
						(0, eval)(text);
						beacon("bootstrapper evaluated");
					} catch (e) {
						say("❌ Bootstrapper threw while evaluating: " + e.message);
					}
				},
				e => {
					say("❌ The local code server isn't answering (" + e.message + ") — is the error sink running? Retrying in "
						+ Math.round(RETRY_MS / 1000) + "s (attempt " + attempt + ")");
					setTimeout(() => boot(attempt + 1), RETRY_MS);
				}
			);
	}

	boot(1);
})();

// --------------------------------------------------------------------------------------------------------------------------------- //
// CODE LOADER — the only file that lives in a game code slot. Fetches Bootstrapper.js, which does
// everything else. Kept in the repo (which cannot load it) so it stops drifting per character.
//
// PASTE ONCE, replacing the slot's entire contents. Two copies in one slot both run.
// --------------------------------------------------------------------------------------------------------------------------------- //

(function () {
	const REPO = "Aegis-940/Adventure-Lands";
	const BASE = `https://cdn.jsdelivr.net/gh/${REPO}@main/`;
	const TIMEOUT_MS = 8000;
	const RETRIES = 2;
	const GUARD_MS = 15000;

	const ROOT = typeof globalThis !== "undefined" ? globalThis : this;

	function say(msg) {
		try { if (typeof game_log === "function") return game_log(msg); } catch (e) {}
		try { console.log(msg); } catch (e) {}
	}

	// A slot holding two copies loads everything twice. Every Shared/*.js is then re-evaluated,
	// their top-level consts throw "already declared", and those files define nothing at all.
	const guard = (function () {
		try { if (typeof parent === "object" && parent) return parent; } catch (e) {}
		return ROOT;
	})();
	if (Date.now() - (guard.__AL_LOAD_STARTED__ || 0) < GUARD_MS) return say("[AL] duplicate start ignored");
	guard.__AL_LOAD_STARTED__ = Date.now();

	// Mainframe runs this in a node:vm sandbox — no document, no jQuery, no AbortController.
	// Bootstrapper.js loads every other file with jQuery getScript, so it cannot run here; stop
	// cleanly rather than crash-looping the Worker, and report what this runtime does provide.
	if (typeof document === "undefined") {
		const probe = ["fetch", "XMLHttpRequest", "require", "parent", "$", "localStorage",
			"character", "G", "socket", "game_log", "setTimeout"]
			.map(n => { try { return n + "=" + eval("typeof " + n); } catch (e) { return n + "=err"; } });
		say("[AL] headless — " + probe.join(" "));
		return;
	}

	function get(url, tries) {
		tries = tries || 0;
		return Promise.race([
			fetch(url, { cache: "no-store" }),
			new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), TIMEOUT_MS))
		])
			.then(res => {
				if (!res.ok) throw new Error("HTTP " + res.status);
				return res.text();
			})
			.catch(e => {
				if (tries < RETRIES) return get(url, tries + 1);
				throw e;
			});
	}

	// No commit-SHA resolution here on purpose: Bootstrapper.js already resolves one for every file
	// it loads. Doing it in both places spent two api.github.com requests per character against a
	// 60/hour limit, which is what produced the 403s and the fallback to a stale @main.
	get(BASE + "Bootstrapper.js")
		.then(text => (0, eval)(text))
		.catch(e => say("❌ Bootstrapper load failed: " + e.message));
})();

// --------------------------------------------------------------------------------------------------------------------------------- //
// CODE LOADER — the only file that lives in a game code slot
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

	const guard = (function () {
		try { if (typeof parent === "object" && parent) return parent; } catch (e) {}
		return ROOT;
	})();
	if (Date.now() - (guard.__AL_LOAD_STARTED__ || 0) < GUARD_MS) return say("[AL] duplicate start ignored");
	guard.__AL_LOAD_STARTED__ = Date.now();

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

	get(BASE + "Bootstrapper.js")
		.then(text => (0, eval)(text))
		.catch(e => say("❌ Bootstrapper load failed: " + e.message));
})();

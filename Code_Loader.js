// --------------------------------------------------------------------------------------------------------------------------------- //
// CODE LOADER — the ONLY file that belongs in a game code slot. Paste into slot 1 and point all
// four characters at it. Everything else is fetched from GitHub by Bootstrapper.js.
//
// PASTE IT ONCE. Replace the slot's entire contents — do not append. A slot holding two copies
// runs both IIFEs, which loads everything twice; see the guard below for what that costs.
//
// Kept in the repo (which cannot load it) purely so it stops drifting per character.
// --------------------------------------------------------------------------------------------------------------------------------- //

(function loadBootstrapper() {
    const REPO = "Aegis-940/Adventure-Lands";
    const MAX_RETRIES = 2;
    const TIMEOUT_MS = 8000;
    const GUARD_MS = 15000;

    // Guards against this file being present TWICE in one code slot — which happened by pasting an
    // update instead of replacing, and cost hours. Both copies run, so everything loads twice:
    // every Shared/*.js is re-evaluated, and those are real script tags whose top-level consts
    // cannot be re-declared, so each file throws at instantiation and not one of its statements
    // runs. Half the bot is then undefined while the first copy's loops keep running against a
    // character object that no longer updates — every action they attempt is rejected by the
    // server as "disabled", forever, at 40ms. It also doubles the api.github.com requests, which
    // is enough on its own to hit the 60/hour limit and start serving 403s.
    //
    // Keyed on `parent` (the game window this codebase already uses for all persistent state:
    // parent.character, parent.socket, parent.entities) rather than `window`, so it holds whether
    // the duplicate is a second copy in the same slot or a genuine second start. A full page
    // reload reloads `parent`, so deliberate restarts are unaffected.
    const guard = (function () {
        try { if (parent && typeof parent === "object") return parent; } catch (e) {}
        return window;
    })();
    const since = Date.now() - (Number(guard.__AL_LOAD_STARTED__) || 0);
    if (since < GUARD_MS) {
        game_log("⏭️ Duplicate code start ignored (" + since + "ms after the first)", "#FFA500");
        return;
    }
    guard.__AL_LOAD_STARTED__ = Date.now();

    function fetchWithTimeout(url, options) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
        return fetch(url, Object.assign({}, options, { signal: controller.signal }))
            .finally(() => clearTimeout(timer));
    }

    function resolveBase(attempt) {
        attempt = attempt || 0;
        return fetchWithTimeout(`https://api.github.com/repos/${REPO}/commits/main`, { cache: "no-store" })
            .then(res => {
                if (!res.ok) throw new Error("HTTP " + res.status);
                return res.json();
            })
            .then(data => `https://cdn.jsdelivr.net/gh/${REPO}@${data.sha}/`)
            .catch(e => {
                if (attempt < MAX_RETRIES) return resolveBase(attempt + 1);
                game_log("⚠️ Couldn't resolve commit SHA (" + e.message + "); falling back to @main");
                return `https://cdn.jsdelivr.net/gh/${REPO}@main/`;
            });
    }

    function loadBootstrapperFile(base, attempt) {
        attempt = attempt || 0;
        return fetchWithTimeout(base + "Bootstrapper.js", { cache: "no-store" })
            .then(res => {
                if (!res.ok) throw new Error("HTTP " + res.status);
                return res.text();
            })
            .then(text => {
                // Bootstrapper.js reads this to skip re-resolving the same commit SHA.
                window.__AL_BASE__ = base;
                (0, eval)(text); // indirect eval — runs in global scope
            })
            .catch(e => {
                if (attempt < MAX_RETRIES) return loadBootstrapperFile(base, attempt + 1);
                game_log("❌ Bootstrapper fetch/eval failed: " + e.message);
            });
    }

    resolveBase().then(base => loadBootstrapperFile(base));
})();
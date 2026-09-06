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

    // This file runs in two very different runtimes: the browser client (iframe, DOM, jQuery) and
    // Mainframe's headless worker, which is a node:vm sandbox with no window, no document and no
    // AbortController. Every global reference below is therefore typeof-guarded — a bare
    // ReferenceError here is reported as code_start_failed and Mainframe just retries forever.
    const ROOT = (typeof globalThis !== "undefined") ? globalThis
               : (typeof window !== "undefined") ? window
               : this;
    const HEADLESS = (typeof document === "undefined");

    function has(name) {
        try { return eval("typeof " + name); } catch (e) { return "err"; }
    }

    function say(msg, color) {
        try { if (typeof game_log === "function") return game_log(msg, color); } catch (e) {}
        try { console.log(msg); } catch (e) {}
    }

    const guard = (function () {
        try { if (typeof parent !== "undefined" && parent && typeof parent === "object") return parent; } catch (e) {}
        return ROOT;
    })();
    const since = Date.now() - (Number(guard.__AL_LOAD_STARTED__) || 0);
    if (since < GUARD_MS) {
        say("⏭️ Duplicate code start ignored (" + since + "ms after the first)", "#FFA500");
        return;
    }
    guard.__AL_LOAD_STARTED__ = Date.now();

    // Headless stops here, on purpose. Bootstrapper.js loads every other file with jQuery
    // getScript, which appends <script> tags to a document — there is no document here, so
    // evaluating it would only fail at `window.$` and crash-loop the Worker. Report what this
    // sandbox actually provides instead, so the headless loader can be written against facts.
    if (HEADLESS) {
        say("[AL] headless runtime detected — browser Bootstrapper not loaded.");
        say("[AL] PROBE"
            + " fetch=" + has("fetch")
            + " XMLHttpRequest=" + has("XMLHttpRequest")
            + " AbortController=" + has("AbortController")
            + " require=" + has("require")
            + " process=" + has("process")
            + " window=" + has("window")
            + " document=" + has("document")
            + " parent=" + has("parent")
            + " $=" + has("$")
            + " localStorage=" + has("localStorage")
            + " character=" + has("character")
            + " game_log=" + has("game_log")
            + " socket=" + has("socket")
            + " G=" + has("G")
            + " smart_move=" + has("smart_move")
            + " setTimeout=" + has("setTimeout"));
        return;
    }

    // AbortController is a web API and Mainframe's node:vm sandbox does not expose it — that bare
    // `new AbortController()` was the ReferenceError behind every code_start_failed, on both the
    // current loader and the original. Where it is missing, race a timer instead: the request is
    // not actually cancelled, but we stop waiting on it, which is all the timeout was for.
    function fetchWithTimeout(url, options) {
        if (typeof fetch !== "function") return Promise.reject(new Error("no fetch in this runtime"));

        if (typeof AbortController === "function") {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
            return fetch(url, Object.assign({}, options, { signal: controller.signal }))
                .finally(() => clearTimeout(timer));
        }

        return Promise.race([
            fetch(url, options),
            new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS))
        ]);
    }

    function resolveBase(attempt) {
        attempt = attempt || 0;
        return fetchWithTimeout(`https://api.github.com/repos/${REPO}/commits/main`, { cache: "no-store" })
            .then(res => {
                if (!res.ok) {
                    const err = new Error("HTTP " + res.status);
                    err.status = res.status;
                    throw err;
                }
                return res.json();
            })
            .then(data => `https://cdn.jsdelivr.net/gh/${REPO}@${data.sha}/`)
            .catch(e => {
                // Retry network/timeout failures only. api.github.com allows 60 unauthenticated
                // requests an hour; a 403 is that limit and will not clear on an immediate retry,
                // so retrying it just spent three requests instead of one and made the limit
                // harder to get back under.
                if (!e.status && attempt < MAX_RETRIES) return resolveBase(attempt + 1);

                // Must stay on jsDelivr. raw.githubusercontent serves text/plain with
                // X-Content-Type-Options: nosniff, so the browser refuses to execute it via a
                // <script> tag — Bootstrapper.js loads every other file with jQuery getScript, so
                // a raw base fails all 18 of them even though this file's own fetch+eval of
                // Bootstrapper.js succeeds. Tried it; every script 404'd into CRITICAL abort.
                //
                // The cost is that jsDelivr caches @main for around 12h and a query string does
                // not purge it (only purge.jsdelivr.net does), so this path can run stale code.
                // That is why the request budget above matters: staying under the rate limit keeps
                // us on the @<sha> path, where this never comes up.
                say("⚠️ Couldn't resolve commit SHA (" + e.message + "); falling back to @main "
                    + "— may be up to ~12h stale", "#FFA500");
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
                // BOTH, not just the base: Bootstrapper.js gates its reuse on __AL_BASE_SET_AT__
                // as well, so setting only __AL_BASE__ made it resolve the SHA a second time — a
                // second api.github.com request per character on top of this one, which is half
                // the reason four characters blow through the 60/hour limit. It also let the
                // Bootstrapper load the game files from a different commit than it came from.
                ROOT.__AL_BASE__ = base;
                ROOT.__AL_BASE_SET_AT__ = Date.now();
                (0, eval)(text); // indirect eval — runs in global scope
            })
            .catch(e => {
                if (attempt < MAX_RETRIES) return loadBootstrapperFile(base, attempt + 1);
                say("❌ Bootstrapper fetch/eval failed: " + e.message);
            });
    }

    resolveBase().then(base => loadBootstrapperFile(base));
})();
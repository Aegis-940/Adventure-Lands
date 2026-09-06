// --------------------------------------------------------------------------------------------------------------------------------- //
// CODE LOADER — the ONLY file that belongs in a game code slot. Paste into slot 1 and point all
// four characters at it. Everything else is fetched from GitHub by Bootstrapper.js.
//
// This is the ORIGINAL loader, restored verbatim after a rewrite of it (and of Bootstrapper.js)
// caused the code to load TWICE per start. That double load re-evaluated every Shared/*.js, whose
// top-level consts cannot re-declare, and left the previous start's loops running against a stale
// character object — every action then rejected with reason "disabled" forever.
//
// It is kept in the repo (the repo cannot load it) purely so it stops drifting per character.
// --------------------------------------------------------------------------------------------------------------------------------- //

(function loadBootstrapper() {
    const REPO = "Aegis-940/Adventure-Lands";
    const MAX_RETRIES = 2;
    const TIMEOUT_MS = 8000;

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
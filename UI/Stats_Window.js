function ui_window() {
    const doc = parent.document;
    let win = doc.getElementById("ui-statistics-window");
    if (win) {
        win.style.display = win.style.display === "none" ? "block" : "none";
        return;
    }

    // Create window
    win = doc.createElement("div");
    win.id = "ui-statistics-window";
    win.style.position = "absolute";
    win.style.top = "5px";
    win.style.left = "5px";
    win.style.width = "350px";
    win.style.height = "220px";
    win.style.border = "4px solid #888";
    win.style.background = "rgba(34,34,34,0.66)";
    win.style.color = "#fff";
    win.style.zIndex = 10000;
    win.style.fontFamily = "pixel";
    win.style.fontSize = "18px";
    win.style.display = "block";
    win.style.resize = "both";
    win.style.overflow = "auto";
    win.style.boxSizing = "border-box";
    win.style.userSelect = "none";

    // Title bar
    const titleBar = doc.createElement("div");
    titleBar.textContent = "Game Statistics";
    titleBar.style.background = "#444";
    titleBar.style.padding = "8px";
    titleBar.style.cursor = "move";
    titleBar.style.fontWeight = "bold";
    titleBar.style.fontSize = "24px";
    titleBar.style.borderBottom = "2px solid #888";
    win.appendChild(titleBar);

    // Drag logic
    let isDragging = false, dragOffsetX = 0, dragOffsetY = 0;
    titleBar.onmousedown = function (e) {
        isDragging = true;
        dragOffsetX = e.clientX - win.offsetLeft;
        dragOffsetY = e.clientY - win.offsetTop;
        doc.body.style.userSelect = "none";
    };
    doc.onmousemove = function (e) {
        if (isDragging) {
            win.style.left = (e.clientX - dragOffsetX) + "px";
            win.style.top = (e.clientY - dragOffsetY) + "px";
        }
    };
    doc.onmouseup = function () {
        isDragging = false;
        doc.body.style.userSelect = "";
    };

    // Toggle button
    const toggleBtn = doc.createElement("button");
    toggleBtn.textContent = "❌";
    toggleBtn.style.position = "absolute";
    toggleBtn.style.top = "5px";
    toggleBtn.style.right = "5px";
    toggleBtn.style.zIndex = 10001;
    toggleBtn.style.background = "#444";
    toggleBtn.style.color = "#fff";
    toggleBtn.style.border = "2px solid #888";
    toggleBtn.style.borderRadius = "4px";
    toggleBtn.style.cursor = "pointer";
    toggleBtn.onclick = () => {
        win.style.display = win.style.display === "none" ? "block" : "none";
    };
    win.appendChild(toggleBtn);

    // Content area
    const content = doc.createElement("div");
    content.id = "ui-statistics-content";
    content.style.padding = "12px";
    content.style.fontSize = "1em";
    win.appendChild(content);

    // --- CONTAINER FOR SIDE-BY-SIDE WINDOWS ---
    const statsRow = doc.createElement("div");
    statsRow.style.display = "flex";
    statsRow.style.flexDirection = "row";
    statsRow.style.alignItems = "flex-start";
    statsRow.style.gap = "4px";
    content.appendChild(statsRow);

    // --- LOOP TOGGLES/STATE SECTION ---
    const togglesSection = doc.createElement("div");
    togglesSection.id = "loop-toggles-section";
    togglesSection.style.background = "rgba(34,34,34,0.20)";
    togglesSection.style.border = "1px solid #555";
    togglesSection.style.borderRadius = "6px";
    togglesSection.style.margin = "8px 0 0 0";
    togglesSection.style.padding = "8px";
    togglesSection.style.fontFamily = "pixel";
    togglesSection.style.fontSize = "1.2em";
    togglesSection.style.userSelect = "none";
    togglesSection.style.width = "240px";
    togglesSection.style.minWidth = "240px";
    togglesSection.style.maxWidth = "240px";
    togglesSection.style.height = "auto";
    togglesSection.style.boxSizing = "border-box";
    statsRow.appendChild(togglesSection);

    // --- GOLD GRAPH WINDOW ---
    const goldSection = doc.createElement("div");
    goldSection.id = "gold-graph-section";
    goldSection.style.background = "rgba(34,34,34,0.20)";
    goldSection.style.border = "1px solid #555";
    goldSection.style.borderRadius = "6px";
    goldSection.style.margin = "8px 0 0 0";
    goldSection.style.padding = "8px";
    goldSection.style.fontFamily = "pixel";
    goldSection.style.fontSize = "1em";
    goldSection.style.userSelect = "none";
    goldSection.style.width = "340px";
    goldSection.style.minWidth = "340px";
    goldSection.style.maxWidth = "340px";
    goldSection.style.height = "auto";
    goldSection.style.boxSizing = "border-box";
    statsRow.appendChild(goldSection);

    // --- GOLD GRAPH TITLE ---
    const goldTitle = doc.createElement("div");
    goldTitle.textContent = "GOLD (30m avg)";
    goldTitle.style.fontWeight = "bold";
    goldTitle.style.fontSize = "1.2em";
    goldTitle.style.marginBottom = "4px";
    goldTitle.style.fontFamily = "pixel";
    goldSection.appendChild(goldTitle);

    // --- GOLD GRAPH CANVAS ---
    const goldCanvas = doc.createElement("canvas");
    goldCanvas.width = 320;
    goldCanvas.height = 120;
    goldCanvas.style.display = "block";
    goldCanvas.style.background = "rgba(0,0,0,0.15)";
    goldCanvas.style.borderRadius = "4px";
    goldCanvas.style.margin = "0 auto";
    goldSection.appendChild(goldCanvas);

    // --- GOLD DATA STORAGE ---
    let goldHistory = [];
    let lastGold = typeof character !== 'undefined' ? character.gold : 0;
    let lastTime = Date.now();

    function updateGoldHistory() {
        if (typeof character === 'undefined') return;
        const now = Date.now();
        const gold = character.gold;
        const dt = (now - lastTime) / 1000;
        if (dt < 1) return; // Only update once per second
        const earned = gold - lastGold;
        goldHistory.push({ time: now, gold: gold, earned: earned });
        lastGold = gold;
        lastTime = now;
        // Keep only last 30 minutes
        const cutoff = now - 30 * 60 * 1000;
        goldHistory = goldHistory.filter(e => e.time >= cutoff);
    }

    function getRollingAverage() {
        // Average gold earned per minute over last 30 minutes
        if (goldHistory.length < 2) return 0;
        let totalEarned = 0;
        for (let i = 1; i < goldHistory.length; ++i) {
            const diff = goldHistory[i].gold - goldHistory[i-1].gold;
            if (diff > 0) totalEarned += diff;
        }
        const minutes = 30;
        return totalEarned / minutes;
    }

    function drawGoldGraph() {
        const ctx = goldCanvas.getContext('2d');
        ctx.clearRect(0, 0, goldCanvas.width, goldCanvas.height);
        // Draw axes
        ctx.strokeStyle = '#888';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(30, 10);
        ctx.lineTo(30, 110);
        ctx.lineTo(310, 110);
        ctx.stroke();

        // Draw rolling average text
        ctx.font = '18px pixel, monospace';
        ctx.fillStyle = '#fff';
        ctx.fillText('Avg/min: ', 40, 30);
        ctx.fillStyle = '#0ff';
        ctx.fillText(getRollingAverage().toFixed(0), 110, 30);

        // Draw graph line
        if (goldHistory.length > 1) {
            // Find max/min for scaling
            let min = goldHistory[0].gold, max = goldHistory[0].gold;
            for (const e of goldHistory) {
                if (e.gold < min) min = e.gold;
                if (e.gold > max) max = e.gold;
            }
            const range = Math.max(1, max - min);
            ctx.strokeStyle = '#ffd700';
            ctx.lineWidth = 2;
            ctx.beginPath();
            for (let i = 0; i < goldHistory.length; ++i) {
                const x = 30 + (280 * (goldHistory[i].time - goldHistory[0].time) / (30*60*1000));
                const y = 110 - 90 * (goldHistory[i].gold - min) / range;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
        }
    }

    setInterval(() => {
        updateGoldHistory();
        drawGoldGraph();
    }, 1000);

    // Title
    const title = doc.createElement("div");
    title.textContent = "LOOP TOGGLES";
    title.style.fontWeight = "bold";
    title.style.fontSize = "1.2em";
    title.style.marginBottom = "4px";
    title.style.fontFamily = "pixel";
    togglesSection.appendChild(title);

    // Preformatted block for state and toggles
    const togglesPre = doc.createElement("pre");
    togglesPre.id = "loop-toggles-pre";
    togglesPre.style.fontFamily = "pixel, monospace";
    togglesPre.style.fontSize = "1.5em";
    togglesPre.style.margin = "0";
    togglesPre.style.padding = "0";
    togglesPre.style.background = "none";
    togglesPre.style.border = "none";
    togglesPre.style.color = "#fff";
    togglesSection.appendChild(togglesPre);

    // Helper to get toggles
    function getLoopToggles() {
        // Pad all names to the same width for alignment (max 7 chars)
        function padName(name, width = 7) {
            return name.padEnd(width, ' ');
        }
        return [
            [padName("ATTACK"), typeof ATTACK_LOOP_ENABLED !== "undefined" ? ATTACK_LOOP_ENABLED : "?"],
            [padName("HEAL"), typeof HEAL_LOOP_ENABLED !== "undefined" ? HEAL_LOOP_ENABLED : "?"],
            [padName("MOVE"), typeof MOVE_LOOP_ENABLED !== "undefined" ? MOVE_LOOP_ENABLED : "?"],
            [padName("SKILL"), typeof SKILL_LOOP_ENABLED !== "undefined" ? SKILL_LOOP_ENABLED : "?"],
            [padName("PANIC"), typeof PANIC_LOOP_ENABLED !== "undefined" ? PANIC_LOOP_ENABLED : "?"],
            [padName("BOSS"), typeof BOSS_LOOP_ENABLED !== "undefined" ? BOSS_LOOP_ENABLED : "?"],
            [padName("ORBIT"), typeof ORBIT_LOOP_ENABLED !== "undefined" ? ORBIT_LOOP_ENABLED : "?"],
            [padName("POTION"), typeof POTION_LOOP_ENABLED !== "undefined" ? POTION_LOOP_ENABLED : "?"],
            [padName("LOOT"), typeof LOOT_LOOP_ENABLED !== "undefined" ? LOOT_LOOP_ENABLED : "?"],
            [padName("STATUS"), typeof STATUS_CACHE_LOOP_ENABLED !== "undefined" ? STATUS_CACHE_LOOP_ENABLED : "?"],
        ];
    }

    function getCurrentState() {
        if (typeof get_character_state === "function") {
            try {
                return get_character_state();
            } catch (e) { return "?"; }
        }
        return "?";
    }

    function updateTable() {
        // Update state and toggles in a single preformatted block with color
        const state = getCurrentState();
        let html = `Current State:\t<span style='color:#0ff;'>${state}</span>\n`;
        for (const [name, val] of getLoopToggles()) {
            let color = val === true ? "#0f0" : val === false ? "#f44" : "#ff0";
            html += `${name}:\t<span style='color:${color};'>${val}</span>\n`;
        }
        togglesPre.innerHTML = html.trim().replace(/\n/g, "<br>");
    }

    updateTable();
    setInterval(updateTable, 500);

    // (togglesSection is now added to statsRow above)

    doc.body.appendChild(win);
}


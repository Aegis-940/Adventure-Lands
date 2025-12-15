    // Font size variables
    const TITLE_FONT_SIZE = "1.5em";
    const TEXT_FONT_SIZE = "1.2em";
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

    // --- COMBINED STATS WINDOW (TOGGLES + GOLD GRAPH) ---
    const statsSection = doc.createElement("div");
    statsSection.id = "stats-combined-section";
    statsSection.style.background = "rgba(34,34,34,0.20)";
    statsSection.style.border = "2px solid #555";
    statsSection.style.borderRadius = "8px";
    statsSection.style.padding = "8px";
    statsSection.style.fontFamily = "pixel";
    statsSection.style.fontSize = TEXT_FONT_SIZE;
    statsSection.style.userSelect = "none";
    statsSection.style.width = "500px";
    statsSection.style.minWidth = "500px";
    statsSection.style.maxWidth = "500px";
    statsSection.style.height = "auto";
    statsSection.style.boxSizing = "border-box";
    statsSection.style.position = "absolute";
    statsSection.style.left = "12px";
    statsSection.style.top = "60px";
    content.appendChild(statsSection);

    // Preformatted block for state and toggles
    const togglesPre = doc.createElement("pre");
    togglesPre.id = "loop-toggles-pre";
    togglesPre.style.fontFamily = "pixel, monospace";
    togglesPre.style.fontSize = "1.2em";
    togglesPre.style.margin = "0 0 8px 0";
    togglesPre.style.padding = "0";
    togglesPre.style.background = "none";
    togglesPre.style.border = "none";
    togglesPre.style.color = "#fff";
    statsSection.appendChild(togglesPre);

    // Gold Graph Canvas (fills the window width)
    const goldCanvas = doc.createElement("canvas");
    goldCanvas.width = 480;
    goldCanvas.height = 100;
    goldCanvas.style.display = "block";
    goldCanvas.style.background = "rgba(0,0,0,0.15)";
    goldCanvas.style.borderRadius = "4px";
    goldCanvas.style.margin = "0 auto";
    goldCanvas.style.width = "100%";
    goldCanvas.style.height = "100px";
    statsSection.appendChild(goldCanvas);

    // Gold Graph Data: Use goldEvents and calculateAverageGold from Gold_Meter.js
    function getGoldGraphData() {
        if (typeof goldEvents === 'undefined' || !Array.isArray(goldEvents) || goldEvents.length < 2) return [];
        // Only use events from the last 30 minutes
        const now = Date.now();
        const cutoff = now - 30 * 60 * 1000;
        return goldEvents.filter(e => e.t >= cutoff);
    }

    function drawGoldGraph() {
        const ctx = goldCanvas.getContext('2d');
        ctx.clearRect(0, 0, goldCanvas.width, goldCanvas.height);
        // Draw axes
        ctx.strokeStyle = '#888';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(25, 10);
        ctx.lineTo(25, 90);
        ctx.lineTo(goldCanvas.width - 5, 90);
        ctx.stroke();

        // Draw gold data as line
        const data = getGoldGraphData();
        if (data.length > 1) {
            const minGold = Math.min(...data.map(d => d.amount));
            const maxGold = Math.max(...data.map(d => d.amount));
            const range = Math.max(1, maxGold - minGold);
            ctx.strokeStyle = '#FFD700';
            ctx.lineWidth = 2;
            ctx.beginPath();
            const t0 = data[0].t;
            const t1 = data[data.length - 1].t;
            data.forEach((d, i) => {
                const x = 25 + ((goldCanvas.width - 35) * (d.t - t0)) / ((t1 - t0) || 1);
                const y = 90 - 70 * (d.amount - minGold) / range;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.stroke();
        }

        // Draw current gold/hour at bottom right using calculateAverageGold()
        let goldPerHour = 0;
        if (typeof calculateAverageGold === 'function') {
            goldPerHour = calculateAverageGold();
        }
        ctx.font = `bold 1em pixel, monospace`;
        ctx.fillStyle = '#0ff';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`${Math.round(goldPerHour).toLocaleString()} g/hr`, goldCanvas.width - 6, goldCanvas.height - 6);
    }

    // Update gold graph every 0.5 seconds
    setInterval(drawGoldGraph, 500);
    // Initial draw
    drawGoldGraph();

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
    togglesPre.style.fontSize = "1.2em";
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

    content.appendChild(togglesSection);

    doc.body.appendChild(win);
}


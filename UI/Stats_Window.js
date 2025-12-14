    // Font size variables
    const TITLE_FONT_SIZE = "1.5em";
    const TEXT_FONT_SIZE = "1em";
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

    // --- LOOP TOGGLES/STATE SUB-WINDOW ---
    const togglesSection = doc.createElement("div");
    togglesSection.id = "loop-toggles-section";
    togglesSection.style.background = "rgba(34,34,34,0.20)";
    togglesSection.style.border = "2px solid #555";
    togglesSection.style.borderRadius = "8px";
    togglesSection.style.padding = "8px";
    togglesSection.style.fontFamily = "pixel";
    togglesSection.style.fontSize = TEXT_FONT_SIZE;
    togglesSection.style.userSelect = "none";
    togglesSection.style.width = "240px";
    togglesSection.style.minWidth = "240px";
    togglesSection.style.maxWidth = "240px";
    togglesSection.style.height = "auto";
    togglesSection.style.boxSizing = "border-box";
    togglesSection.style.position = "absolute";
    togglesSection.style.left = "12px";
    togglesSection.style.top = "60px";
    content.appendChild(togglesSection);

    // --- GOLD GRAPH SUB-WINDOW ---
    const goldSection = doc.createElement("div");
    goldSection.id = "gold-graph-section";
    goldSection.style.background = "rgba(34,34,34,0.20)";
    goldSection.style.border = "2px solid #555";
    goldSection.style.borderRadius = "8px";
    goldSection.style.padding = "8px";
    goldSection.style.fontFamily = "pixel";
    goldSection.style.fontSize = TEXT_FONT_SIZE;
    goldSection.style.userSelect = "none";
    goldSection.style.width = "500px";
    goldSection.style.minWidth = "500px";
    goldSection.style.maxWidth = "500px";
    goldSection.style.height = "auto";
    goldSection.style.boxSizing = "border-box";
    goldSection.style.position = "absolute";
    goldSection.style.left = "194px";
    goldSection.style.top = "60px";
    content.appendChild(goldSection);

    // Gold Graph Title
    const goldTitle = doc.createElement("div");
    goldTitle.textContent = "GOLD/HOUR";
    goldTitle.style.fontWeight = "bold";
    goldTitle.style.fontSize = TITLE_FONT_SIZE;
    goldTitle.style.marginBottom = "4px";
    goldTitle.style.fontFamily = "pixel";
    goldSection.appendChild(goldTitle);

    // Gold Graph Canvas
    const goldCanvas = doc.createElement("canvas");
    goldCanvas.width = 150;
    goldCanvas.height = 80;
    goldCanvas.style.display = "block";
    goldCanvas.style.background = "rgba(0,0,0,0.15)";
    goldCanvas.style.borderRadius = "4px";
    goldCanvas.style.margin = "0 auto";
    goldSection.appendChild(goldCanvas);

    // Gold Graph Data
    let goldHistory = [];
    let lastGold = (typeof character !== 'undefined' && character.gold) ? character.gold : 0;
    let lastTime = Date.now();

    function updateGoldHistory() {
        if (typeof character === 'undefined') return;
        const now = Date.now();
        const gold = character.gold;
        goldHistory.push({ time: now, gold });
        // Remove data older than 30 minutes
        const cutoff = now - 30 * 60 * 1000;
        goldHistory = goldHistory.filter(d => d.time >= cutoff);
        lastGold = gold;
        lastTime = now;
    }

    function getGoldPerHour() {
        if (goldHistory.length < 2) return 0;
        const first = goldHistory[0];
        const last = goldHistory[goldHistory.length - 1];
        const goldDelta = last.gold - first.gold;
        const timeDelta = (last.time - first.time) / 1000 / 60 / 60; // hours
        if (timeDelta === 0) return 0;
        return goldDelta / timeDelta;
    }

    function drawGoldGraph() {
        const ctx = goldCanvas.getContext('2d');
        ctx.clearRect(0, 0, goldCanvas.width, goldCanvas.height);
        // Draw axes
        ctx.strokeStyle = '#888';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(25, 10);
        ctx.lineTo(25, 70);
        ctx.lineTo(145, 70);
        ctx.stroke();

        // Draw gold data as line
        if (goldHistory.length > 1) {
            const minGold = Math.min(...goldHistory.map(d => d.gold));
            const maxGold = Math.max(...goldHistory.map(d => d.gold));
            const range = Math.max(1, maxGold - minGold);
            ctx.strokeStyle = '#FFD700';
            ctx.lineWidth = 2;
            ctx.beginPath();
            goldHistory.forEach((d, i) => {
                const x = 25 + ((goldCanvas.width - 35) * (d.time - goldHistory[0].time)) / (goldHistory[goldHistory.length - 1].time - goldHistory[0].time || 1);
                const y = 70 - 60 * (d.gold - minGold) / range;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.stroke();
        }

        // Draw current gold/hour
        ctx.font = `bold ${TEXT_FONT_SIZE} pixel, monospace`;
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'left';
        ctx.fillText('Avg:', 28, 18);
        ctx.fillStyle = '#0ff';
        ctx.textAlign = 'right';
        ctx.fillText(`${Math.round(getGoldPerHour()).toLocaleString()} g/hr`, 145, 18);
    }

    // Update gold graph every 5 seconds
    setInterval(() => {
        updateGoldHistory();
        drawGoldGraph();
    }, 5000);
    // Initial draw
    updateGoldHistory();
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

    content.appendChild(togglesSection);

    doc.body.appendChild(win);
}


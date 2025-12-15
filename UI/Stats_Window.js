// Font size variables
const TITLE_FONT_SIZE = "1.5em";
const TEXT_FONT_SIZE = "1.4em";

// Build and attach the gold graph sub-window
function add_gold_graph(doc, content) {
    const gold_canvas = doc.createElement("canvas");
    gold_canvas.id = "gold-graph-canvas";
    gold_canvas.width = 500;
    gold_canvas.height = 120;
    gold_canvas.style.display = "block";
    gold_canvas.style.background = "rgba(34,34,34,0.20)";
    gold_canvas.style.border = "2px solid #555";
    gold_canvas.style.borderRadius = "8px";
    gold_canvas.style.fontFamily = "pixel";
    gold_canvas.style.fontSize = TEXT_FONT_SIZE;
    gold_canvas.style.userSelect = "none";
    gold_canvas.style.width = "500px";
    gold_canvas.style.minWidth = "500px";
    gold_canvas.style.maxWidth = "500px";
    gold_canvas.style.height = "240px";
    gold_canvas.style.boxSizing = "border-box";
    gold_canvas.style.position = "absolute";
    gold_canvas.style.left = "252px";
    gold_canvas.style.top = "60px";
    content.appendChild(gold_canvas);

    // Gold Graph Data: Maintain our own sampled array
    const GOLD_GRAPH_WINDOW_MS = 30 * 60 * 1000; // 30 minutes
    const GOLD_GRAPH_INTERVAL_MS = 500;
    const GOLD_GRAPH_POINTS = Math.floor(GOLD_GRAPH_WINDOW_MS / GOLD_GRAPH_INTERVAL_MS);
    let gold_graph_samples = [];

    function add_gold_graph_sample() {
        let value = 0;
        if (typeof calculateAverageGold === "function") {
            value = calculateAverageGold();
        }
        gold_graph_samples.push({ t: Date.now(), amount: value });
        // Keep only the last N samples (30 minutes)
        if (gold_graph_samples.length > GOLD_GRAPH_POINTS) {
            gold_graph_samples = gold_graph_samples.slice(-GOLD_GRAPH_POINTS);
        }
    }

    function get_gold_graph_data() {
        // Return a copy of the samples array
        return gold_graph_samples.slice();
    }

    function draw_gold_graph() {
        const ctx = gold_canvas.getContext("2d");
        ctx.clearRect(0, 0, gold_canvas.width, gold_canvas.height);
        // Draw axes
        ctx.strokeStyle = "#888";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(25, 10);
        ctx.lineTo(25, 90);
        ctx.lineTo(gold_canvas.width - 5, 90);
        ctx.stroke();

        // Draw gold data as line using sampled points
        const data = get_gold_graph_data();
        const N = data.length;
        if (N > 1) {
            const min_gold = Math.min(...data.map(d => d.amount));
            const max_gold = Math.max(...data.map(d => d.amount));
            const range = Math.max(1, max_gold - min_gold);
            ctx.strokeStyle = "#FFD700";
            ctx.lineWidth = 2;
            ctx.beginPath();
            data.forEach((d, i) => {
                const x = 25 + ((gold_canvas.width - 35) * i) / (N - 1);
                const y = 90 - 70 * (d.amount - min_gold) / range;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.stroke();

            // Y-axis min/max labels
            ctx.font = "12px pixel, monospace";
            ctx.fillStyle = "#fff";
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";
            // Min label near bottom of axis
            ctx.fillText(`${Math.round(min_gold).toLocaleString()}`, 28, 90);
            // Max label near top of axis
            ctx.fillText(`${Math.round(max_gold).toLocaleString()}`, 28, 20);
        }

        // Draw current gold/hour at bottom right using calculateAverageGold()
        let goldPerHour = 0;
        if (typeof calculateAverageGold === "function") {
            goldPerHour = calculateAverageGold();
        }
        ctx.font = "12px pixel";
        ctx.fillStyle = "#0ff";
        ctx.textAlign = "right";
        ctx.textBaseline = "bottom";
        ctx.fillText(`${Math.round(goldPerHour).toLocaleString()} g/hr`, gold_canvas.width - 6, gold_canvas.height - 6);
    }

    // Start gold graph sampling and drawing
    add_gold_graph_sample();
    draw_gold_graph();
    setInterval(() => {
        add_gold_graph_sample();
        draw_gold_graph();
    }, GOLD_GRAPH_INTERVAL_MS);

    return gold_canvas;
}

// Build and attach the loop toggles/state sub-window
function add_loop_toggles(doc, content) {
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

    const title = doc.createElement("div");
    title.textContent = "LOOP TOGGLES";
    title.style.fontWeight = "bold";
    title.style.fontSize = "1.2em";
    title.style.marginBottom = "4px";
    title.style.fontFamily = "pixel";
    togglesSection.appendChild(title);

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

    function getLoopToggles() {
        function padName(name, width = 7) {
            return name.padEnd(width, " ");
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
        const state = getCurrentState();
        let html = `Current State:\t<span style='color:#0ff;'>${state}</span>\n`;
        for (const [name, val] of getLoopToggles()) {
            const color = val === true ? "#0f0" : val === false ? "#f44" : "#ff0";
            html += `${name}:\t<span style='color:${color};'>${val}</span>\n`;
        }
        togglesPre.innerHTML = html.trim().replace(/\n/g, "<br>");
    }

    updateTable();
    setInterval(updateTable, 500);

    return togglesSection;
}

function ui_window() {
    const doc = parent.document;
    let win_el = doc.getElementById("ui-statistics-window");
    if (win_el) {
        win_el.style.display = win_el.style.display === "none" ? "block" : "none";
        return;
    }

    // Create window
    win_el = doc.createElement("div");
    win_el.id = "ui-statistics-window";
    win_el.style.position = "absolute";
    win_el.style.top = "5px";
    win_el.style.left = "5px";
    win_el.style.width = "350px";
    win_el.style.height = "220px";
    win_el.style.border = "4px solid #888";
    win_el.style.background = "rgba(34,34,34,0.66)";
    win_el.style.color = "#fff";
    win_el.style.zIndex = 10000;
    win_el.style.fontFamily = "pixel";
    win_el.style.fontSize = "18px";
    win_el.style.display = "block";
    win_el.style.resize = "both";
    win_el.style.overflow = "auto";
    win_el.style.boxSizing = "border-box";
    win_el.style.userSelect = "none";

    // Title bar
    const title_bar = doc.createElement("div");
    title_bar.textContent = "Game Statistics";
    title_bar.style.background = "#444";
    title_bar.style.padding = "8px";
    title_bar.style.cursor = "move";
    title_bar.style.fontWeight = "bold";
    title_bar.style.fontSize = "24px";
    title_bar.style.borderBottom = "2px solid #888";
    win_el.appendChild(title_bar);

    // Drag logic
    let is_dragging = false, drag_offset_x = 0, drag_offset_y = 0;
    title_bar.onmousedown = function (e) {
        is_dragging = true;
        drag_offset_x = e.clientX - win_el.offsetLeft;
        drag_offset_y = e.clientY - win_el.offsetTop;
        doc.body.style.userSelect = "none";
    };
    doc.onmousemove = function (e) {
        if (is_dragging) {
            win_el.style.left = (e.clientX - drag_offset_x) + "px";
            win_el.style.top = (e.clientY - drag_offset_y) + "px";
        }
    };
    doc.onmouseup = function () {
        is_dragging = false;
        doc.body.style.userSelect = "";
    };

    // Toggle button
    const toggle_btn = doc.createElement("button");
    toggle_btn.textContent = "❌";
    toggle_btn.style.position = "absolute";
    toggle_btn.style.top = "5px";
    toggle_btn.style.right = "5px";
    toggle_btn.style.zIndex = 10001;
    toggle_btn.style.background = "#444";
    toggle_btn.style.color = "#fff";
    toggle_btn.style.border = "2px solid #888";
    toggle_btn.style.borderRadius = "4px";
    toggle_btn.style.cursor = "pointer";
    toggle_btn.onclick = () => {
        win_el.style.display = win_el.style.display === "none" ? "block" : "none";
    };
    win_el.appendChild(toggle_btn);

    // Content area
    const content = doc.createElement("div");
    content.id = "ui-statistics-content";
    content.style.padding = "12px";
    content.style.fontSize = "1em";
    win_el.appendChild(content);

    // Add sub-windows
    add_loop_toggles(doc, content);
    add_gold_graph(doc, content);

    doc.body.appendChild(win_el);
}


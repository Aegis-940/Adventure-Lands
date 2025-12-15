// Style + layout constants
const THEME = {
    bgPanel: "rgba(34,34,34,0.20)",
    bgWindow: "rgba(34,34,34,0.66)",
    bgTitle: "#444",
    border: "#555",
    borderStrong: "#888",
    text: "#fff",
    accentGood: "#0f0",
    accentWarn: "#ff0",
    accentBad: "#f44",
    accentCyan: "#0ff",
    gold: "#FFD700",
    axis: "#888",
    fontFamily: "pixel, monospace",
};

const METRICS = {
    window: { width: 350, height: 220, padding: 12 },
    title: { padding: 8, fontPx: 24 },
    textEm: { title: 1.5, body: 1.2 },
    panel: { borderPx: 2, radiusPx: 8 },
    canvas: { width: 500, height: 240, left: 252, top: 60 },
    toggles: { width: 240, left: 12, top: 60 },
    graph: { leftMargin: 50, bottomMargin: 60, rightMargin: 10, topMargin: 20, axisWidth: 1, lineWidth: 2 },
};

function set_label_font(ctx) {
    ctx.font = `16px ${THEME.fontFamily}`;
}

function set_value_font(ctx) {
    ctx.font = `18px ${THEME.fontFamily}`;
}

// Build and attach the gold graph sub-window
function add_gold_graph(doc, content) {
    const gold_canvas = doc.createElement("canvas");
    gold_canvas.id = "gold-graph-canvas";
    gold_canvas.width = METRICS.canvas.width;
    gold_canvas.height = METRICS.canvas.height;
    gold_canvas.style.display = "block";
    gold_canvas.style.background = THEME.bgPanel;
    gold_canvas.style.border = `${METRICS.panel.borderPx}px solid ${THEME.border}`;
    gold_canvas.style.borderRadius = `${METRICS.panel.radiusPx}px`;
    gold_canvas.style.fontFamily = THEME.fontFamily;
    gold_canvas.style.fontSize = `${METRICS.textEm.body}em`;
    gold_canvas.style.userSelect = "none";
    gold_canvas.style.width = `${METRICS.canvas.width}px`;
    gold_canvas.style.minWidth = `${METRICS.canvas.width}px`;
    gold_canvas.style.maxWidth = `${METRICS.canvas.width}px`;
    gold_canvas.style.height = `${METRICS.canvas.height}px`;
    gold_canvas.style.boxSizing = "border-box";
    gold_canvas.style.position = "absolute";
    gold_canvas.style.left = `${METRICS.canvas.left}px`;
    gold_canvas.style.top = `${METRICS.canvas.top}px`;
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
        ctx.strokeStyle = THEME.axis;
        ctx.lineWidth = METRICS.graph.axisWidth;
        ctx.beginPath();
        const left = METRICS.graph.leftMargin;
        const top = METRICS.graph.topMargin;
        const right = gold_canvas.width - METRICS.graph.rightMargin;
        const bottom = gold_canvas.height - METRICS.graph.bottomMargin;
        ctx.moveTo(left, top);
        ctx.lineTo(left, bottom);
        ctx.lineTo(right, bottom);
        ctx.stroke();

        // Draw gold data as line using sampled points
        const data = get_gold_graph_data();
        const N = data.length;
        if (N > 1) {
            const min_gold = Math.min(...data.map(d => d.amount));
            const max_gold = Math.max(...data.map(d => d.amount));
            const range = Math.max(1, max_gold - min_gold);
            ctx.strokeStyle = THEME.gold;
            ctx.lineWidth = METRICS.graph.lineWidth;
            ctx.beginPath();
            data.forEach((d, i) => {
                const x = left + ((right - left) * i) / (N - 1);
                const y = bottom - (bottom - top) * (d.amount - min_gold) / range;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.stroke();

            // Y-axis min/max labels
            set_label_font(ctx);
            ctx.fillStyle = THEME.text;
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";
            // Min label near bottom of axis
            ctx.fillText(`${Math.round(min_gold).toLocaleString()}`, left + 6, bottom);
            // Max label near top of axis
            ctx.fillText(`${Math.round(max_gold).toLocaleString()}`, left + 6, top + 20);
        }

        // Draw current gold/hour at bottom right using calculateAverageGold()
        let goldPerHour = 0;
        if (typeof calculateAverageGold === "function") {
            goldPerHour = calculateAverageGold();
        }
        set_value_font(ctx);
        ctx.fillStyle = THEME.accentCyan;
        ctx.textAlign = "right";
        ctx.textBaseline = "bottom";
        ctx.fillText(`${Math.round(goldPerHour).toLocaleString()} g/hr`, right, gold_canvas.height - 12);
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
    togglesSection.style.background = THEME.bgPanel;
    togglesSection.style.border = `${METRICS.panel.borderPx}px solid ${THEME.border}`;
    togglesSection.style.borderRadius = `${METRICS.panel.radiusPx}px`;
    togglesSection.style.padding = `${METRICS.title.padding}px`;
    togglesSection.style.fontFamily = THEME.fontFamily;
    togglesSection.style.fontSize = `${METRICS.textEm.body}em`;
    togglesSection.style.userSelect = "none";
    togglesSection.style.width = `${METRICS.toggles.width}px`;
    togglesSection.style.minWidth = `${METRICS.toggles.width}px`;
    togglesSection.style.maxWidth = `${METRICS.toggles.width}px`;
    togglesSection.style.height = "auto";
    togglesSection.style.boxSizing = "border-box";
    togglesSection.style.position = "absolute";
    togglesSection.style.left = `${METRICS.toggles.left}px`;
    togglesSection.style.top = `${METRICS.toggles.top}px`;
    content.appendChild(togglesSection);

    const title = doc.createElement("div");
    title.textContent = "LOOP TOGGLES";
    title.style.fontWeight = "bold";
    title.style.fontSize = `${METRICS.textEm.body}em`;
    title.style.marginBottom = "4px";
    title.style.fontFamily = THEME.fontFamily;
    togglesSection.appendChild(title);

    const togglesPre = doc.createElement("pre");
    togglesPre.id = "loop-toggles-pre";
    togglesPre.style.fontFamily = THEME.fontFamily;
    togglesPre.style.fontSize = `${METRICS.textEm.body}em`;
    togglesPre.style.margin = "0";
    togglesPre.style.padding = "0";
    togglesPre.style.background = "none";
    togglesPre.style.border = "none";
    togglesPre.style.color = THEME.text;
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
            const color = val === true ? THEME.accentGood : val === false ? THEME.accentBad : THEME.accentWarn;
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
    win_el.style.width = `${METRICS.window.width}px`;
    win_el.style.height = `${METRICS.window.height}px`;
    win_el.style.border = `4px solid ${THEME.borderStrong}`;
    win_el.style.background = THEME.bgWindow;
    win_el.style.color = THEME.text;
    win_el.style.zIndex = 10000;
    win_el.style.fontFamily = THEME.fontFamily;
    win_el.style.fontSize = "18px";
    win_el.style.display = "block";
    win_el.style.resize = "both";
    win_el.style.overflow = "auto";
    win_el.style.boxSizing = "border-box";
    win_el.style.userSelect = "none";

    // Title bar
    const title_bar = doc.createElement("div");
    title_bar.textContent = "Game Statistics";
    title_bar.style.background = THEME.bgTitle;
    title_bar.style.padding = `${METRICS.title.padding}px`;
    title_bar.style.cursor = "move";
    title_bar.style.fontWeight = "bold";
    title_bar.style.fontSize = `${METRICS.title.fontPx}px`;
    title_bar.style.borderBottom = `2px solid ${THEME.borderStrong}`;
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
    toggle_btn.style.background = THEME.bgTitle;
    toggle_btn.style.color = THEME.text;
    toggle_btn.style.border = `2px solid ${THEME.borderStrong}`;
    toggle_btn.style.borderRadius = "4px";
    toggle_btn.style.cursor = "pointer";
    toggle_btn.onclick = () => {
        win_el.style.display = win_el.style.display === "none" ? "block" : "none";
    };
    win_el.appendChild(toggle_btn);

    // Content area
    const content = doc.createElement("div");
    content.id = "ui-statistics-content";
    content.style.padding = `${METRICS.window.padding}px`;
    content.style.fontSize = "1em";
    win_el.appendChild(content);

    // Add sub-windows
    add_loop_toggles(doc, content);
    add_gold_graph(doc, content);

    doc.body.appendChild(win_el);
}


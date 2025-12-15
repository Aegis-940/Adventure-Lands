// ===== Utility Functions =====
// Apply multiple styles to an element at once
function apply_styles(element, styles) {
    Object.entries(styles).forEach(([key, value]) => {
        element.style[key] = value;
    });
    return element;
}

// Create element with ID, styles, and optional text/HTML
function create_element(doc, tag, options = {}) {
    const el = doc.createElement(tag);
    if (options.id) el.id = options.id;
    if (options.text) el.textContent = options.text;
    if (options.html) el.innerHTML = options.html;
    if (options.styles) apply_styles(el, options.styles);
    if (options.onclick) el.onclick = options.onclick;
    return el;
}

// Common style sets
const PANEL_STYLES = {
    background: "rgba(34,34,34,0.20)",
    border: "2px solid #555",
    borderRadius: "8px",
    boxSizing: "border-box",
    userSelect: "none",
};

const TEXT_STYLES = {
    fontFamily: "pixel, monospace",
    fontSize: "28px",
    color: "#fff",
};

// Build and attach the gold graph sub-window
function add_gold_graph(doc, content) {
    const gold_canvas = create_element(doc, "canvas", {
        id: "gold-graph-canvas",
        styles: {
            ...PANEL_STYLES,
            display: "block",
            width: "500px",
            height: "240px",
            position: "absolute",
            left: "252px",
            top: "60px",
        }
    });
    gold_canvas.width = 500;
    gold_canvas.height = 240;
    content.appendChild(gold_canvas);

    // Gold graph data: samples over 30-minute window
    const GOLD_GRAPH_WINDOW_MS = 30 * 60 * 1000; // 30 minutes
    const GOLD_GRAPH_CHECK_INTERVAL_MS = 500; // Check for changes every 500ms
    let gold_graph_samples = [];
    let last_gold_value = null;

    function check_and_add_sample() {
        let value = 0;
        if (typeof calculateAverageGold === "function") {
            value = calculateAverageGold();
        }
        
        // Only add a new sample if the value has changed AND is non-zero (or we already have data)
        if (value !== last_gold_value && (value > 0 || gold_graph_samples.length > 0)) {
            const now = Date.now();
            gold_graph_samples.push({ t: now, amount: value });
            last_gold_value = value;
            
            // Remove samples older than 30 minutes
            const cutoff = now - GOLD_GRAPH_WINDOW_MS;
            gold_graph_samples = gold_graph_samples.filter(s => s.t >= cutoff);
        }
    }

    function draw_gold_graph() {
        const ctx = gold_canvas.getContext("2d");
        ctx.clearRect(0, 0, gold_canvas.width, gold_canvas.height);

        const data = gold_graph_samples;
        const N = data.length;

        // Layout dimensions
        const left = 60;
        const right = gold_canvas.width - 10;
        const top = 20;
        const bottom = gold_canvas.height - 40;

        // Draw axes
        ctx.strokeStyle = "#888";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(left, top);
        ctx.lineTo(left, bottom);
        ctx.lineTo(right, bottom);
        ctx.stroke();

        // X-axis label
        ctx.font = "18px pixel, monospace";
        ctx.fillStyle = "#fff";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText("30 Minute Window", (left + right) / 2, bottom + 5);

        if (N > 1) {
            // Calculate min/max with ±10% padding
            const min_measured = Math.min(...data.map(d => d.amount));
            const max_measured = Math.max(...data.map(d => d.amount));
            const range_measured = max_measured - min_measured;
            const padding = range_measured * 0.1;
            
            const min_gold = min_measured - padding;
            const max_gold = max_measured + padding;
            const range = Math.max(1, max_gold - min_gold);

            // Draw gold line
            ctx.strokeStyle = "#FFD700";
            ctx.lineWidth = 2;
            ctx.beginPath();
            data.forEach((d, i) => {
                const x = left + ((right - left) * i) / (N - 1);
                const y = bottom - (bottom - top) * (d.amount - min_gold) / range;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.stroke();

            // Y-axis labels (min and max measured values only)
            ctx.font = "18px pixel, monospace";
            ctx.fillStyle = "#fff";
            ctx.textAlign = "right";
            ctx.textBaseline = "middle";
            
            // Max label at top
            const y_max = bottom - (bottom - top) * (max_measured - min_gold) / range;
            ctx.fillText(Math.round(max_measured).toLocaleString(), left - 5, y_max);
            
            // Min label at bottom
            const y_min = bottom - (bottom - top) * (min_measured - min_gold) / range;
            ctx.fillText(Math.round(min_measured).toLocaleString(), left - 5, y_min);
        }
    }

    // Start sampling and drawing (don't add initial zero sample)
    draw_gold_graph();
    setInterval(() => {
        check_and_add_sample();
        draw_gold_graph();
    }, GOLD_GRAPH_CHECK_INTERVAL_MS);

    return gold_canvas;
}

// Build and attach the loop toggles/state sub-window
function add_loop_toggles(doc, content) {
    const togglesSection = create_element(doc, "div", {
        id: "loop-toggles-section",
        styles: {
            ...PANEL_STYLES,
            padding: "8px",
            fontFamily: "pixel",
            fontSize: "28px",
            width: "240px",
            minWidth: "240px",
            maxWidth: "240px",
            height: "auto",
            position: "absolute",
            left: "12px",
            top: "48px",
        }
    });
    content.appendChild(togglesSection);

    const title = create_element(doc, "div", {
        text: "LOOP TOGGLES",
        styles: {
            fontWeight: "bold",
            fontSize: "28px",
            marginBottom: "4px",
            fontFamily: "pixel",
        }
    });
    togglesSection.appendChild(title);

    const togglesPre = create_element(doc, "pre", {
        id: "loop-toggles-pre",
        styles: {
            ...TEXT_STYLES,
            margin: "0",
            padding: "0",
            background: "none",
            border: "none",
        }
    });
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
    win_el = create_element(doc, "div", {
        id: "ui-statistics-window",
        styles: {
            position: "absolute",
            top: "5px",
            left: "5px",
            width: "350px",
            height: "220px",
            border: "4px solid #888",
            background: "rgba(34,34,34,0.66)",
            color: "#fff",
            zIndex: 10000,
            fontFamily: "pixel",
            fontSize: "18px",
            display: "block",
            resize: "both",
            overflow: "auto",
            boxSizing: "border-box",
            userSelect: "none",
        }
    });

    // Title bar
    const title_bar = create_element(doc, "div", {
        text: "Game Statistics",
        styles: {
            background: "#444",
            padding: "8px",
            cursor: "move",
            fontWeight: "bold",
            fontSize: "24px",
            borderBottom: "2px solid #888",
        }
    });

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
    const toggle_btn = create_element(doc, "button", {
        text: "❌",
        styles: {
            position: "absolute",
            top: "5px",
            right: "5px",
            zIndex: 10001,
            background: "#444",
            color: "#fff",
            border: "2px solid #888",
            borderRadius: "4px",
            cursor: "pointer",
        },
        onclick: () => {
            win_el.style.display = win_el.style.display === "none" ? "block" : "none";
        }
    });

    win_el.appendChild(toggle_btn);

    // Content area
    const content = create_element(doc, "div", {
        id: "ui-statistics-content",
        styles: {
            padding: "12px",
            fontSize: "16px",
        }
    });

    win_el.appendChild(content);

    // Add sub-windows
    add_loop_toggles(doc, content);
    add_gold_graph(doc, content);

    doc.body.appendChild(win_el);
}


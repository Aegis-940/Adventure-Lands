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
    fontSize: "24px",
    color: "#fff",
};

// Build and attach the gold graph sub-window
function add_gold_graph(doc, content) {
   
}

// Build and attach the loop toggles/state sub-window
function add_loop_toggles(doc, content) {
    const togglesSection = create_element(doc, "div", {
        id: "loop-toggles-section",
        styles: {
            ...PANEL_STYLES,
            padding: "8px",
            fontFamily: "pixel",
            fontSize: "24px",
            width: "240px",
            minWidth: "240px",
            maxWidth: "240px",
            height: "auto",
            position: "absolute",
            left: "12px",
            top: "12px",
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


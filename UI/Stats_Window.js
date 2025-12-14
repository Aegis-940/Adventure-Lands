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

    // --- LOOP TOGGLES/STATE SECTION ---
    const togglesSection = doc.createElement("div");
    togglesSection.id = "loop-toggles-section";
    togglesSection.style.background = "rgba(34,34,34,0.20)";
    togglesSection.style.border = "1px solid #555";
    togglesSection.style.borderRadius = "6px";
    togglesSection.style.margin = "8px 0 0 0";
    togglesSection.style.padding = "8px";
    togglesSection.style.fontFamily = "pixel";
    togglesSection.style.fontSize = "1em";
    togglesSection.style.userSelect = "none";

    // Title
    const title = doc.createElement("div");
    title.textContent = "LOOP TOGGLES";
    title.style.fontWeight = "bold";
    title.style.fontSize = "1.2em";
    title.style.marginBottom = "4px";
    togglesSection.appendChild(title);

    // State display
    const stateDiv = doc.createElement("div");
    stateDiv.id = "loop-toggles-state";
    stateDiv.style.fontSize = "1em";
    stateDiv.style.marginBottom = "8px";
    togglesSection.appendChild(stateDiv);

    // Table
    const table = doc.createElement("table");
    table.style.width = "100%";
    table.style.fontSize = "0.95em";
    togglesSection.appendChild(table);

    // Helper to get toggles
    function getLoopToggles() {
        return [
            ["ATTACK_LOOP_ENABLED", typeof ATTACK_LOOP_ENABLED !== "undefined" ? ATTACK_LOOP_ENABLED : "?"],
            ["HEAL_LOOP_ENABLED", typeof HEAL_LOOP_ENABLED !== "undefined" ? HEAL_LOOP_ENABLED : "?"],
            ["MOVE_LOOP_ENABLED", typeof MOVE_LOOP_ENABLED !== "undefined" ? MOVE_LOOP_ENABLED : "?"],
            ["SKILL_LOOP_ENABLED", typeof SKILL_LOOP_ENABLED !== "undefined" ? SKILL_LOOP_ENABLED : "?"],
            ["PANIC_LOOP_ENABLED", typeof PANIC_LOOP_ENABLED !== "undefined" ? PANIC_LOOP_ENABLED : "?"],
            ["BOSS_LOOP_ENABLED", typeof BOSS_LOOP_ENABLED !== "undefined" ? BOSS_LOOP_ENABLED : "?"],
            ["ORBIT_LOOP_ENABLED", typeof ORBIT_LOOP_ENABLED !== "undefined" ? ORBIT_LOOP_ENABLED : "?"],
            ["POTION_LOOP_ENABLED", typeof POTION_LOOP_ENABLED !== "undefined" ? POTION_LOOP_ENABLED : "?"],
            ["LOOT_LOOP_ENABLED", typeof LOOT_LOOP_ENABLED !== "undefined" ? LOOT_LOOP_ENABLED : "?"],
            ["STATUS_CACHE_LOOP_ENABLED", typeof STATUS_CACHE_LOOP_ENABLED !== "undefined" ? STATUS_CACHE_LOOP_ENABLED : "?"],
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
        // Update state
        const state = getCurrentState();
        stateDiv.innerHTML = `<b>Current State:</b> <span style='color:#0ff;'>${state}</span>`;
        // Update toggles
        table.innerHTML = "";
        for (const [name, val] of getLoopToggles()) {
            const row = doc.createElement("tr");
            // Name cell
            const nameCell = doc.createElement("td");
            nameCell.textContent = name;
            nameCell.style.fontFamily = "pixel";
            nameCell.style.fontSize = "1em";
            nameCell.style.color = "#fff";
            nameCell.style.paddingRight = "0.5em";
            nameCell.style.whiteSpace = "nowrap";
            // Dash cell
            const dashCell = doc.createElement("td");
            dashCell.textContent = "─────";
            dashCell.style.width = "100%";
            dashCell.style.color = "#888";
            dashCell.style.textAlign = "center";
            dashCell.style.fontFamily = "monospace";
            // Value cell
            const valCell = doc.createElement("td");
            valCell.textContent = String(val);
            valCell.style.textAlign = "right";
            valCell.style.fontFamily = "pixel";
            valCell.style.fontSize = "1em";
            valCell.style.color = val === true ? "#0f0" : val === false ? "#f44" : "#ff0";
            valCell.style.whiteSpace = "nowrap";
            row.appendChild(nameCell);
            row.appendChild(dashCell);
            row.appendChild(valCell);
            table.appendChild(row);
        }
    }

    updateTable();
    setInterval(updateTable, 500);

    content.appendChild(togglesSection);

    doc.body.appendChild(win);
}


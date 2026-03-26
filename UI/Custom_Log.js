// --------------------------------------------------------------------------------------------------------------------------------- //
// CUSTOM GAME LOG
// --------------------------------------------------------------------------------------------------------------------------------- //

function create_custom_log_window() {
    // Only create if it doesn't exist
    if (parent.document.getElementById("custom-log-window")) return;

    const doc = parent.document;

    // Create main window
    const div = doc.createElement("div");
    div.id = "custom-log-window";
    div.style.position = "absolute";
    div.style.bottom = "1px";
    div.style.right = "650px";
    div.style.width = "350px";
    div.style.height = "260px";
    div.style.background = "rgba(0,0,0,0.66)";
    div.style.color = "#fff";
    div.style.overflow = "hidden";
    div.style.zIndex = 9999;
    div.style.fontSize = "22px";
    div.style.fontFamily = "pixel";
    div.style.padding = "0";
    div.style.border = "4px solid #888";
    div.style.display = "flex";
    div.style.flexDirection = "column";
    div.style.cursor = "default";

    // --- Drag logic ---
    let isDragging = false, dragOffsetX = 0, dragOffsetY = 0;

    // Drag handle (top bar)
    const dragHandle = doc.createElement("div");
    dragHandle.style.height = "18px";
    dragHandle.style.background = "#444";
    dragHandle.style.cursor = "move";
    dragHandle.style.display = "flex";
    dragHandle.style.alignItems = "center";
    dragHandle.style.justifyContent = "flex-start";
    dragHandle.style.paddingLeft = "8px";
    dragHandle.style.fontSize = "16px";
    dragHandle.style.fontFamily = "pixel";
    dragHandle.style.color = "#fff";
    dragHandle.textContent = "Custom Log";

    dragHandle.onmousedown = function (e) {
        isDragging = true;
        dragOffsetX = e.clientX - div.offsetLeft;
        dragOffsetY = e.clientY - div.offsetTop;
        doc.body.style.userSelect = "none";
    };

    doc.onmousemove = function (e) {
        if (isDragging) {
            div.style.left = (e.clientX - dragOffsetX) + "px";
            div.style.top = (e.clientY - dragOffsetY) + "px";
            div.style.right = ""; // Unset right when dragging
            div.style.bottom = ""; // Unset bottom when dragging
        }
    };

    doc.onmouseup = function () {
        isDragging = false;
        doc.body.style.userSelect = "";
    };

    div.appendChild(dragHandle);

    // --- Tabs ---
    const tabBar = doc.createElement("div");
    tabBar.style.display = "flex";
    tabBar.style.background = "#222";
    tabBar.style.borderBottom = "2px solid #888";
    tabBar.style.height = "32px";
    tabBar.style.alignItems = "center";

    const tabs = [
        { name: "All", id: "tab-all" },
        { name: "General", id: "tab-general" },
        { name: "Alerts", id: "tab-alerts" },
        { name: "Errors", id: "tab-errors" }
    ];

    // Store current tab in window
    div._currentTab = "All";

    // --- Log containers for each tab ---
    const logContainers = {};
    const alertStates = {};
    // For checkboxes: which tabs are included in "All"
    const includeInAll = {
        "General": true,
        "Alerts": true,
        "Errors": true
    };

    // Store all log entries for each tab for dynamic All tab updates
    const logHistory = {
        "General": [],
        "Alerts": [],
        "Errors": []
    };

    for (const tab of tabs) {
        const tabDiv = doc.createElement("div");
        tabDiv.id = `custom-log-${tab.id}`;
        tabDiv.style.flex = "1";
        tabDiv.style.overflowY = "auto";
        tabDiv.style.display = tab.name === "All" ? "block" : "none";
        tabDiv.style.height = "100%";
        div.appendChild(tabDiv);
        logContainers[tab.name] = tabDiv;
        alertStates[tab.name] = false;
    }

    // --- Tab buttons with alert indicators and checkboxes ---
    for (const tab of tabs) {
        const btn = doc.createElement("button");
        btn.textContent = tab.name;
        btn.style.flex = "1";
        btn.style.height = "100%";
        btn.style.background = tab.name === "All" ? "#444" : "#222";
        btn.style.color = "#fff";
        btn.style.border = "none";
        btn.style.fontFamily = "pixel";
        btn.style.fontSize = "20px";
        btn.style.cursor = "pointer";
        btn.id = `btn-${tab.id}`;
        btn.style.display = "flex";
        btn.style.alignItems = "center";
        btn.style.justifyContent = "center";
        btn.style.position = "relative";

        // Alert indicator span
        const alertSpan = doc.createElement("span");
        alertSpan.textContent = "";
        alertSpan.style.color = "#fff";
        alertSpan.style.marginLeft = "8px";
        alertSpan.style.fontWeight = "bold";
        alertSpan.id = `alert-${tab.id}`;
        btn.appendChild(alertSpan);

        // Add checkbox for General, Alerts, and Errors tabs
        if (tab.name !== "All") {
            const checkbox = doc.createElement("input");
            checkbox.type = "checkbox";
            checkbox.checked = true;
            checkbox.style.marginLeft = "6px";
            checkbox.style.transform = "scale(1.2)";
            checkbox.title = `Include ${tab.name} messages in All tab`;
            checkbox.onclick = (e) => {
                includeInAll[tab.name] = checkbox.checked;
                updateAllTab(logContainers, logHistory, includeInAll);
            };
            btn.appendChild(checkbox);
        }

        btn.onclick = () => {
            // Switch tab
            div._currentTab = tab.name;
            for (const t of tabs) {
                logContainers[t.name].style.display = t.name === tab.name ? "block" : "none";
                tabBar.querySelector(`#btn-${t.id}`).style.background = t.name === tab.name ? "#444" : "#222";
                // Clear alert when tab is viewed
                const alertElem = tabBar.querySelector(`#alert-${t.id}`);
                if (alertElem) alertElem.textContent = "";
                alertStates[t.name] = false;
            }
        };
        tabBar.appendChild(btn);
    }

    div.appendChild(tabBar);

    // Move log containers after tab bar
    for (const tab of tabs) {
        div.appendChild(logContainers[tab.name]);
    }

    doc.body.appendChild(div);

    // Store containers, alert state, includeInAll, and logHistory globally for log() to use
    parent._custom_log_tabs = logContainers;
    parent._custom_log_window = div;
    parent._custom_log_alerts = alertStates;
    parent._custom_log_includeInAll = includeInAll;
    parent._custom_log_history = logHistory;
}

// Helper to update the All tab when checkboxes change
function updateAllTab(logContainers, logHistory, includeInAll) {
    const allDiv = logContainers["All"];
    allDiv.innerHTML = "";
    let allEntries = [];
    for (const tabName of ["General", "Alerts", "Errors"]) {
        if (includeInAll[tabName]) {
            allEntries = allEntries.concat(logHistory[tabName]);
        }
    }
    // Sort by timestamp (oldest first)
    allEntries.sort((a, b) => a.time - b.time);
    // Only keep the most recent 100
    allEntries = allEntries.slice(-100);
    for (const entry of allEntries) {
        const p = parent.document.createElement("div");
        p.textContent = entry.text;
        p.style.color = entry.color;
        p.style.padding = "2px";
        allDiv.appendChild(p);
    }
    allDiv.scrollTop = allDiv.scrollHeight;
}

// Modified log function to support All tab and checkboxes
function log(msg, color = "#fff", type = "General") {
    create_custom_log_window();
    const logContainers = parent._custom_log_tabs;
    const div = parent._custom_log_window;
    const alertStates = parent._custom_log_alerts;
    const includeInAll = parent._custom_log_includeInAll;
    const logHistory = parent._custom_log_history;

    // Support "General", "Alerts", "Errors" as valid types
    let tabName = "General";
    if (type === "Errors") tabName = "Errors";
    else if (type === "Alerts") tabName = "Alerts";

    const logDiv = logContainers[tabName];

    const time = Date.now();
    const text = `[${new Date(time).toLocaleTimeString()}] ${msg}`;

    // Store in history for this tab
    if (!logHistory[tabName]) logHistory[tabName] = [];
    logHistory[tabName].push({ text, color, time });
    // Keep only the most recent 100 messages per tab
    while (logHistory[tabName].length > 100) logHistory[tabName].shift();

    // Add to tab display
    const p = parent.document.createElement("div");
    p.textContent = text;
    p.style.color = color;
    p.style.padding = "2px";
    logDiv.appendChild(p);
    while (logDiv.children.length > 100) logDiv.removeChild(logDiv.firstChild);

    // If this tab is visible, scroll to bottom
    if (div._currentTab === tabName) {
        logDiv.scrollTop = logDiv.scrollHeight;
    } else {
        // Show alert (!) if new message arrives in a hidden tab
        if (!alertStates[tabName]) {
            const alertElem = parent.document.getElementById(`alert-tab-${tabName.toLowerCase()}`);
            if (alertElem) alertElem.textContent = "*";
            alertStates[tabName] = true;
        }
    }

    // Also log to All tab if enabled for this type
    if (tabName !== "All" && includeInAll[tabName]) {
        // Add to All history and update All tab
        if (!logHistory["All"]) logHistory["All"] = [];
        logHistory["All"].push({ text, color, time, source: tabName });
        // Only keep the most recent 100 in All history
        while (logHistory["All"].length > 100) logHistory["All"].shift();
        updateAllTab(logContainers, logHistory, includeInAll);
    }
}

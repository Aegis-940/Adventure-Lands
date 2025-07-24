
// ───────────────────────────────────────
// GENERIC WINDOW
// ───────────────────────────────────────

function createFloatingStatsWindow(
  id,
  { top = "20px", left = "20px", width = "150px", minHeight = "50px" } = {}
) {
  const old = window.top.document.getElementById(id);
  if (old) old.remove();

  const win = window.top.document.createElement("div");
  win.id = id;
  win.className = "floating-stats-window"; // ✅ So we can query it later

  Object.assign(win.style, {
    position: "fixed",
    top,
    left,
    width,
    minHeight,
    padding: "8px",
    background: "rgba(0,0,0,0.7)",
    color: "#fff",
    fontFamily: "sans-serif",
    fontSize: "14px",
    border: "1px solid #888",
    borderRadius: "4px",
    zIndex: "9999",
    overflow: "hidden",  
    cursor: "move"
  });

  // ✅ Required for dragging to work: must have pixel units
  win.style.top = parseInt(parseFloat(top)) + "px";
  win.style.left = parseInt(parseFloat(left)) + "px";

  makeDraggable(win);
  win.innerText = "Stats loading…";

  window.top.document.body.appendChild(win);
  return win;
}

function removeAllFloatingStatsWindows() {
  const wins = window.top.document.querySelectorAll(".floating-stats-window");
  wins.forEach(win => win.remove());
}

// ───────────────────────────────────────
// WINDOW DRAGGER
// ───────────────────────────────────────

function makeDraggable(el) {
  let isDragging = false, startX, startY, startTop, startLeft;

  el.addEventListener("mousedown", e => {
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    startTop  = parseInt(el.style.top);
    startLeft = parseInt(el.style.left);
    e.preventDefault();
  });

  window.top.addEventListener("mousemove", e => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    el.style.top  = `${startTop + dy}px`;
    el.style.left = `${startLeft + dx}px`;
  });

  window.top.addEventListener("mouseup", () => {
    isDragging = false;
  });
}

// ───────────────────────────────────────
// GLOBAL STATS WINDOW
// ───────────────────────────────────────

function createTeamStatsWindow() {
  const id = "teamStatsWindow";
  const doc = window.top.document;
  doc.getElementById(id)?.remove();

  const win = doc.createElement("div");
  win.id = id;
  win.className = "floating-stats-window";
  Object.assign(win.style, {
    position: "fixed", top: "160px", right: "2px",
    width: "300px", minHeight: "200px", padding: "8px",
    background: "rgba(0,0,0,0.5)", color: "#fff",
    fontFamily: "sans-serif", fontSize: "14px",
    border: "3px solid rgba(255,255,255,0.2)",
    borderRadius: "5px",
    backdropFilter: "blur(1px)",
    zIndex: "9999", overflow: "auto",
    whiteSpace: "pre-line", cursor: "move"
  });

  // Header
  win.innerText = "📊 Team Performance Summary\n────────────────────────────";

  // Placeholder for other stats
  const body = doc.createElement("div");
  body.id = "statsBody";
  win.appendChild(body);

  // —— NEW: DPS container —— 
  const dpsDiv = doc.createElement("div");
  dpsDiv.id = "teamDpsContainer";
  dpsDiv.style.marginTop = "8px";
  win.appendChild(dpsDiv);

  makeDraggable(win);
  doc.body.appendChild(win);
  window._teamStatsWin = win;
}

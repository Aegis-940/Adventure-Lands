// ───────────────────────────────────────
// GENERIC WINDOW
// ───────────────────────────────────────

function create_floating_stats_window(
  id,
  { top = "20px", left = "20px", width = "150px", minHeight = "50px" } = {}
) {
  const old = window.top.document.getElementById(id);
  if (old) old.remove();

  const win = window.top.document.createElement("div");
  win.id = id;
  win.className = "floating-stats-window";

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

  // pixel units required for dragging
  win.style.top  = parseInt(parseFloat(top)) + "px";
  win.style.left = parseInt(parseFloat(left)) + "px";

  make_draggable(win);
  win.innerText = "Stats loading…";

  window.top.document.body.appendChild(win);
  return win;
}

function remove_all_floating_stats_windows() {
  const wins = window.top.document.querySelectorAll(".floating-stats-window");
  wins.forEach(win => win.remove());
}

// ───────────────────────────────────────
// WINDOW DRAGGER
// ───────────────────────────────────────

function make_draggable(el) {
  let is_dragging = false,
      start_x, start_y,
      start_top, start_left;

  el.addEventListener("mousedown", e => {
    is_dragging = true;
    start_x      = e.clientX;
    start_y      = e.clientY;
    start_top    = parseInt(el.style.top);
    start_left   = parseInt(el.style.left);
    e.preventDefault();
  });

  window.top.addEventListener("mousemove", e => {
    if (!is_dragging) return;
    const dx = e.clientX - start_x;
    const dy = e.clientY - start_y;
    el.style.top  = `${start_top + dy}px`;
    el.style.left = `${start_left + dx}px`;
  });

  window.top.addEventListener("mouseup", () => {
    is_dragging = false;
  });
}

// ───────────────────────────────────────
// GLOBAL STATS WINDOW
// ───────────────────────────────────────

function create_team_stats_window() {
  const id = "teamStatsWindow";
  const doc = window.top.document;
  doc.getElementById(id)?.remove();

  const win = doc.createElement("div");
  win.id = id;
  win.className = "floating-stats-window";
  Object.assign(win.style, {
    position:       "fixed",
    top:            "160px",
    right:          "2px",
    width:          "300px",
    minHeight:      "200px",
    padding:        "8px",
    background:     "rgba(0,0,0,0.5)",
    color:          "#fff",
    fontFamily:     "sans-serif",
    fontSize:       "14px",
    border:         "3px solid rgba(255,255,255,0.2)",
    borderRadius:   "5px",
    backdropFilter: "blur(1px)",
    zIndex:         "9999",
    overflow:       "auto",
    whiteSpace:     "pre-line",
    cursor:         "move"
  });

  // Header
  win.innerText = "📊 Team Performance Summary\n────────────────────────────";

  // Stats body placeholder
  const body = doc.createElement("div");
  body.id = "statsBody";
  win.appendChild(body);

  // DPS container
  const dps_div = doc.createElement("div");
  dps_div.id = "teamDpsContainer";
  dps_div.style.marginTop = "8px";
  win.appendChild(dps_div);

  make_draggable(win);
  doc.body.appendChild(win);
  window._team_stats_win = win;
}

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

// Shared drag state — listeners are registered once on window.top, not per-element.
let _drag = null;

(function _init_drag_listeners() {
  window.top.addEventListener("mousemove", e => {
    if (!_drag) return;
    const dx = e.clientX - _drag.start_x;
    const dy = e.clientY - _drag.start_y;
    _drag.el.style.top  = `${_drag.start_top  + dy}px`;
    _drag.el.style.left = `${_drag.start_left + dx}px`;
  });
  window.top.addEventListener("mouseup", () => {
    _drag = null;
  });
})();

function make_draggable(el) {
  el.addEventListener("mousedown", e => {
    _drag = {
      el,
      start_x:    e.clientX,
      start_y:    e.clientY,
      start_top:  parseInt(el.style.top),
      start_left: parseInt(el.style.left),
    };
    e.preventDefault();
  });
}



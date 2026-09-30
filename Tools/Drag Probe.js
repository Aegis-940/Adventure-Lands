// --------------------------------------------------------------------------------------------------------------------------------- //
// DRAG PROBE — paste into a spare game code slot and run, then press on an inventory item and drag.
// Reports into the game log: the element stack under the cursor, whether anything cancelled the
// mousedown, and whether the game's own drag ever starts. Nothing here changes the bot.
// --------------------------------------------------------------------------------------------------------------------------------- //

(() => {
	const doc = parent.document;
	const log = (msg, colour) => game_log(msg, colour || "#66ccff");

	function describe(el) {
		if (!el) return "null";
		const id = el.id ? "#" + el.id : "";
		const cls = typeof el.className === "string" && el.className.trim()
			? "." + el.className.trim().split(/\s+/).join(".")
			: "";
		return el.tagName.toLowerCase() + id + cls;
	}

	function stack_at(e) {
		return doc.elementsFromPoint(e.clientX, e.clientY).slice(0, 4).map(describe).join("  <  ");
	}

	let moves = 0;
	let down_at = null;

	doc.addEventListener("mousedown", e => {
		down_at = { x: e.clientX, y: e.clientY };
		moves = 0;
		log(`[probe] DOWN ${stack_at(e)}`);
	}, true);

	doc.addEventListener("mousedown", e => {
		log(`[probe] DOWN cancelled=${e.defaultPrevented}`, e.defaultPrevented ? "#ff8844" : "#66ccff");
	}, false);

	doc.addEventListener("mousemove", e => {
		if (!down_at) return;
		if (moves++ % 20) return;
		const moved = Math.round(Math.hypot(e.clientX - down_at.x, e.clientY - down_at.y));
		log(`[probe] MOVE +${moved}px over ${stack_at(e)}`);
	}, true);

	doc.addEventListener("mouseup", e => {
		log(`[probe] UP ${stack_at(e)}`);
		down_at = null;
	}, true);

	for (const name of ["dragstart", "dragover", "drop", "dragend", "selectstart"]) {
		doc.addEventListener(name, e => log(`[probe] ${name} ${describe(e.target)}`, "#ffcc00"), true);
	}

	log("[probe] armed — press on an inventory item and drag it", "#00ff00");
})();

// Simple Party UI - displays all 4 party members with HP, MP, XP, centered and 150px from bottom

const PARTY_ORDER = ["Ulric", "Myras", "Riva", "Riff"];
const PARTY_FRAME_WIDTH = 100;
const BAR_HEIGHT = 18;

(function() {
	const css = `
	#simple-party-ui-container {
		position: fixed;
		left: 50%;
		bottom: 100px;
		transform: translateX(-50%);
		display: flex;
		flex-direction: row;
		gap: 12px;
		z-index: 1;
	}
	.simple-party-frame {
		width: ${PARTY_FRAME_WIDTH}px;
		background: rgba(34,34,34,0.75);
		border: 1px solid #444;
		padding: 6px 8px;
		font-family: "pixel", monospace;
		color: #fff;
	}
	.simple-party-bar {
		height: ${BAR_HEIGHT}px;
		margin: 2px 0 6px 0;
		position: relative;
		background: #000000ff;
		border: 1px solid #333;
		overflow: hidden;
	}
	.simple-party-bar-inner {
		height: 100%;
		position: absolute;
		left: 0; top: 0;
	}
	.bar-hp { background: #c33; }
	.bar-mp { background: #39f; }
	.bar-xp { background: #3c3; }
	.bar-label {
		position: absolute;
		width: 100%;
		text-align: center;
		font-size: 20px;
		top: 0; left: 0;
		color: #fff;
	}
	.simple-party-name {
		text-align: center;
		font-size: 22px;
		margin-bottom: 2px;
		letter-spacing: 1px;
	}
	`;
	if (!parent.document.getElementById("simple-party-ui-style")) {
		const style = parent.document.createElement("style");
		style.id = "simple-party-ui-style";
		style.textContent = css;
		parent.document.head.appendChild(style);
	}
})();

// Own character reads live values; others read Shared/Game_Config.js's localStorage-backed
// state cache (shared across tabs), which stays current regardless of party proximity unlike get_player().
function get_party_member_info(name) {
	if (name === character.name) {
		return {
			name: character.name,
			hp: character.hp,
			max_hp: character.max_hp,
			mp: character.mp,
			max_mp: character.max_mp,
			xp: character.xp,
			max_xp: character.max_xp,
		};
	}

	// typeof-guard: Messaging.js (defines read_state_cache) loads in parallel with no
	// ordering guarantee, so an early tick can land before it's defined.
	const cached = typeof read_state_cache === "function" ? read_state_cache(name) : null;
	if (cached) {
		return {
			name: cached.name,
			hp: cached.hp,
			max_hp: cached.max_hp,
			mp: cached.mp,
			max_mp: cached.max_mp,
			xp: cached.xp,
			max_xp: cached.max_xp,
		};
	}

	return { name };
}

function render_party_ui() {
	let container = parent.document.getElementById("simple-party-ui-container");
	if (!container) {
		container = parent.document.createElement("div");
		container.id = "simple-party-ui-container";
		parent.document.body.appendChild(container);
	}
	container.innerHTML = "";
	for (const name of PARTY_ORDER) {
		const info = get_party_member_info(name);
		const hp = info.hp ?? 0;
		const max_hp = info.max_hp ?? 1;
		const mp = info.mp ?? 0;
		const max_mp = info.max_mp ?? 1;
		const xp = info.xp ?? 0;
		const max_xp = info.max_xp ?? 1;
		const hp_pct = Math.max(0, Math.min(100, (hp / max_hp) * 100));
		const mp_pct = Math.max(0, Math.min(100, (mp / max_mp) * 100));
		const xp_pct = Math.max(0, Math.min(100, (xp / max_xp) * 100));
		const frame = parent.document.createElement("div");
		frame.className = "simple-party-frame";
		frame.innerHTML = `
			<div class="simple-party-name">${info.name ?? name}</div>
			<div class="simple-party-bar">
				<div class="simple-party-bar-inner bar-hp" style="width:${hp_pct}%;"></div>
				<div class="bar-label">HP: ${hp}</div>
			</div>
			<div class="simple-party-bar">
				<div class="simple-party-bar-inner bar-mp" style="width:${mp_pct}%;"></div>
				<div class="bar-label">MP: ${mp}</div>
			</div>
			<div class="simple-party-bar">
				<div class="simple-party-bar-inner bar-xp" style="width:${xp_pct}%;"></div>
				<div class="bar-label">XP: ${xp_pct.toFixed(1)}%</div>
			</div>
		`;
		container.appendChild(frame);
	}
}

// Matches state_cache_loop()'s 100ms write interval (Shared/Game_Config.js).
setInterval(render_party_ui, 100);

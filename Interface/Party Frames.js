
const PARTY_ORDER = ["Ulric", "Myras", "Riva", "Riff"];
const PARTY_FRAME_WIDTH = 124;
const BAR_HEIGHT = 18;

function inject_party_frames() {
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
		padding: 6px 8px;
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
	ui_style("simple-party-ui-style", css);
}

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

	const cached = read_state_cache(name);
	if (cached) {
		return {
			name,
			hp: cached.hp,
			max_hp: cached.max_hp,
			mp: cached.mp,
			max_mp: cached.max_mp,
			xp: cached.xp,
			max_xp: G.levels[cached.level],
		};
	}

	return { name };
}

let _party_frames_html = "";

function render_party_ui() {
	let container = parent.document.getElementById("simple-party-ui-container");
	if (!container) {
		container = parent.document.createElement("div");
		container.id = "simple-party-ui-container";
		parent.document.body.appendChild(container);
	}
	let html = "";
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
		html += `<div class="simple-party-frame al-panel">
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
		</div>`;
	}

	if (html === _party_frames_html) return;
	_party_frames_html = html;
	container.innerHTML = html;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// BOOT
// --------------------------------------------------------------------------------------------------------------------------------- //

on_boot("Party Frames", () => {
	inject_party_frames();
	every("party frames", { ms: 250, kind: "ui", fixed: true }, render_party_ui);
});

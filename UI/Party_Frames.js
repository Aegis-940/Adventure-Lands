
// Simple Party UI - displays all 4 party members with HP, MP, XP, centered and 150px from bottom

const PARTY_ORDER = ["Ulric", "Myras", "Riva", "Riff"];
const partyFrameWidth = 100;
const barHeight = 18;

// Inject CSS for positioning and style
(function() {
	const css = `
	#simple-party-ui-container {
		position: fixed;
		left: 50%;
		bottom: 150px;
		transform: translateX(-50%);
		display: flex;
		flex-direction: row;
		gap: 12px;
		z-index: 9999;
	}
	.simple-party-frame {
		width: ${partyFrameWidth}px;
		background: #181818;
		border: 1px solid #444;
		border-radius: 7px;
		padding: 6px 8px;
		font-family: 'pixel', monospace;
		color: #fff;
		box-shadow: 0 2px 8px #000a;
	}
	.simple-party-bar {
		height: ${barHeight}px;
		border-radius: 4px;
		margin: 2px 0 6px 0;
		position: relative;
		background: #222;
		border: 1px solid #333;
		overflow: hidden;
	}
	.simple-party-bar-inner {
		height: 100%;
		position: absolute;
		left: 0; top: 0;
		border-radius: 4px;
	}
	.bar-hp { background: #c33; }
	.bar-mp { background: #39f; }
	.bar-xp { background: #3c3; }
	.bar-label {
		position: absolute;
		width: 100%;
		text-align: center;
		font-size: 13px;
		top: 0; left: 0;
		color: #fff;
		text-shadow: 1px 1px 2px #000, 0 0 2px #000;
	}
	.simple-party-name {
		text-align: center;
		font-size: 16px;
		font-weight: bold;
		margin-bottom: 2px;
		letter-spacing: 1px;
	}
	`;
	if (!parent.document.getElementById('simple-party-ui-style')) {
		const style = parent.document.createElement('style');
		style.id = 'simple-party-ui-style';
		style.textContent = css;
		parent.document.head.appendChild(style);
	}
})();

function getPartyMemberInfo(name) {
	let info = get(name + '_newparty_info');
	if (!info || Date.now() - info.lastSeen > 1000) {
		let party_member = get_player(name);
		if (party_member) {
			info = Object.fromEntries(Object.entries(party_member).filter(current => [
				'name', 'hp', 'max_hp', 'mp', 'max_mp', 'xp', 'level'
			].includes(current[0])));
		} else {
			info = { name };
		}
	}
	return info;
}

function renderPartyUI() {
	let container = parent.document.getElementById('simple-party-ui-container');
	if (!container) {
		container = parent.document.createElement('div');
		container.id = 'simple-party-ui-container';
		parent.document.body.appendChild(container);
	}
	container.innerHTML = '';
	for (const name of PARTY_ORDER) {
		const info = getPartyMemberInfo(name);
		const hp = info.hp ?? 0;
		const max_hp = info.max_hp ?? 1;
		const mp = info.mp ?? 0;
		const max_mp = info.max_mp ?? 1;
		const xp = info.xp ?? 0;
		const level = info.level ?? 1;
		const max_xp = G.levels?.[level] ?? 1;
		const hpPct = Math.max(0, Math.min(100, (hp / max_hp) * 100));
		const mpPct = Math.max(0, Math.min(100, (mp / max_mp) * 100));
		const xpPct = Math.max(0, Math.min(100, (xp / max_xp) * 100));
		const frame = parent.document.createElement('div');
		frame.className = 'simple-party-frame';
		frame.innerHTML = `
			<div class="simple-party-name">${info.name ?? name}</div>
			<div class="simple-party-bar">
				<div class="simple-party-bar-inner bar-hp" style="width:${hpPct}%;"></div>
				<div class="bar-label">HP: ${hp} / ${max_hp}</div>
			</div>
			<div class="simple-party-bar">
				<div class="simple-party-bar-inner bar-mp" style="width:${mpPct}%;"></div>
				<div class="bar-label">MP: ${mp} / ${max_mp}</div>
			</div>
			<div class="simple-party-bar">
				<div class="simple-party-bar-inner bar-xp" style="width:${xpPct}%;"></div>
				<div class="bar-label">XP: ${xpPct.toFixed(1)}%</div>
			</div>
		`;
		container.appendChild(frame);
	}
}

setInterval(renderPartyUI, 300);

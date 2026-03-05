if (parent.party_style_prepared) parent.$('#style-party-frames').remove();

parent.$('head').append(`<style id="style-party-frames">
.party-container {position: absolute; top: 55px; left: -25%; width: 1000px; height: 300px; font-family: 'pixel';}
</style>`);
parent.party_style_prepared = true;

const DISPLAY_BARS = ['hp', 'mp', 'xp']; // <-- Add 'cc', 'ping', 'share' as needed
const FRAME_WIDTH = 80;
const INCLUDE = ['mp', 'max_mp', 'hp', 'max_hp', 'name', 'max_xp', 'xp', 'level', 'share', 'cc', 'max_cc'];
const SHOW_IMG = true;

const extractInfo = (char) => {
	const info = {};
	for (const key of INCLUDE) if (key in char) info[key] = char[key];
	for (const key of character.read_only) if (key in char) info[key] = char[key];
	return info;
};

setInterval(() => set(character.name + '_newparty_info', { ...extractInfo(character), lastSeen: Date.now() }), 200);

const getIFramedChar = (name) => {
	for (const iframe of top.$('iframe')) {
		const char = iframe.contentWindow.character;
		if (char?.name === name) return char;
	}
};

const barHTML = (text, val, width, color) =>
	`<div style="position:relative;width:100%;height:20px;text-align:center;margin-top:3px;">
<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-weight:bold;font-size:17px;z-index:1;white-space:nowrap;text-shadow:-1px 0 black,0 2px black,2px 0 black,0 -1px black;">${text}: ${val}</div>
<div style="position:absolute;top:0;left:0;right:0;bottom:0;background-color:${color};width:${width}%;height:20px;border:1px solid grey;"></div>
</div>`;

const barConfigs = {
	hp: { color: 'red', calc: (i) => ({ val: i.hp, width: i.hp / i.max_hp * 100 }) },
	mp: { color: 'blue', calc: (i) => ({ val: i.mp, width: i.mp / i.max_mp * 100 }) },
	xp: {color: 'green', calc: (i) => {
			const pct = i.xp / G.levels[i.level] * 100;
			return { val: pct.toFixed(2) + '%', width: pct };
		}
	},
	cc: { color: 'grey', calc: (i) => ({ val: i.cc?.toFixed(2) ?? i.cc, width: i.cc / (i.max_cc || 200) * 100 }) },
	ping: { color: 'black', calc: () => ({ val: character.ping?.toFixed(0) ?? '??', width: 0 }) },
	share: {color: 'teal', calc: (i, partyData) => {
			const share = partyData?.share;
			return share != null ? { val: (share * 100).toFixed(2) + '%', width: share * 300 } : { val: '??', width: 0 };
		}
	}
};

setInterval(() => {
	const partyFrame = parent.$('#newparty').addClass('party-container');
	if (!partyFrame.length) return;

	const members = Object.keys(parent.party);
	partyFrame.children().each((x, el) => {
		const name = members[x];
		let info = get(name + '_newparty_info');

		if (!info || Date.now() - info.lastSeen > 1000) {
			const iframed = getIFramedChar(name);
			info = iframed ? extractInfo(iframed) : (get_player(name) || { name });
		}

		const partyData = parent.party[name];
		let html = `<div style="width:${FRAME_WIDTH}px;height:20px;margin-top:3px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${info.name}</div>`;

		for (const key of DISPLAY_BARS) {
			const cfg = barConfigs[key];
			const { val, width } = cfg.calc(info, partyData);
			if (val !== undefined && val !== '??') {
				html += barHTML(key.toUpperCase(), val, width, cfg.color);
			}
		}

		parent.$(el).children().first().css('display', SHOW_IMG ? 'inherit' : 'none');
		parent.$(el).children().last().html(`<div style="font-size:22px;" onclick='pcs(event);party_click("${name}");'>${html}</div>`);
	});
}, 250);

parent.$('#party-props-toggles').remove();

// // Simple Party UI - displays all 4 party members with HP, MP, XP, centered and 150px from bottom

// const PARTY_ORDER = ["Ulric", "Myras", "Riva", "Riff"];
// const partyFrameWidth = 100;
// const barHeight = 18;

// // Inject CSS for positioning and style
// (function() {
// 	const css = `
// 	#simple-party-ui-container {
// 		position: fixed;
// 		left: 50%;
// 		bottom: 100px;
// 		transform: translateX(-50%);
// 		display: flex;
// 		flex-direction: row;
// 		gap: 12px;
// 		z-index: 1;
// 	}
// 	.simple-party-frame {
// 		width: ${partyFrameWidth}px;
// 		background: rgba(34,34,34,0.75);
// 		border: 1px solid #444;
// 		padding: 6px 8px;
// 		font-family: 'pixel', monospace;
// 		color: #fff;
// 	}
// 	.simple-party-bar {
// 		height: ${barHeight}px;
// 		margin: 2px 0 6px 0;
// 		position: relative;
// 		background: #000000ff;
// 		border: 1px solid #333;
// 		overflow: hidden;
// 	}
// 	.simple-party-bar-inner {
// 		height: 100%;
// 		position: absolute;
// 		left: 0; top: 0;
// 	}
// 	.bar-hp { background: #c33; }
// 	.bar-mp { background: #39f; }
// 	.bar-xp { background: #3c3; }
// 	.bar-label {
// 		position: absolute;
// 		width: 100%;
// 		text-align: center;
// 		font-size: 20px;
// 		top: 0; left: 0;
// 		color: #fff;
// 	}
// 	.simple-party-name {
// 		text-align: center;
// 		font-size: 22px;
// 		margin-bottom: 2px;
// 		letter-spacing: 1px;
// 	}
// 	`;
// 	if (!parent.document.getElementById('simple-party-ui-style')) {
// 		const style = parent.document.createElement('style');
// 		style.id = 'simple-party-ui-style';
// 		style.textContent = css;
// 		parent.document.head.appendChild(style);
// 	}
// })();

// function getPartyMemberInfo(name) {
// 	let info = get(name + '_newparty_info');
// 	if (!info || Date.now() - info.lastSeen > 1000) {
// 		let party_member = get_player(name);
// 		if (party_member) {
// 			info = Object.fromEntries(Object.entries(party_member).filter(current => [
// 				'name', 'hp', 'max_hp', 'mp', 'max_mp', 'xp', 'level'
// 			].includes(current[0])));
// 		} else {
// 			info = { name };
// 		}
// 	}
// 	return info;
// }

// function renderPartyUI() {
// 	parent.$('#newparty').hide();
// 	let container = parent.document.getElementById('simple-party-ui-container');
// 	if (!container) {
// 		container = parent.document.createElement('div');
// 		container.id = 'simple-party-ui-container';
// 		parent.document.body.appendChild(container);
// 	}
// 	container.innerHTML = '';
// 	for (const name of PARTY_ORDER) {
// 		const info = getPartyMemberInfo(name);
// 		const hp = info.hp ?? 0;
// 		const max_hp = info.max_hp ?? 1;
// 		const mp = info.mp ?? 0;
// 		const max_mp = info.max_mp ?? 1;
// 		const xp = info.xp ?? 0;
// 		const level = info.level ?? 1;
// 		const max_xp = G.levels?.[level] ?? 1;
// 		const hpPct = Math.max(0, Math.min(100, (hp / max_hp) * 100));
// 		const mpPct = Math.max(0, Math.min(100, (mp / max_mp) * 100));
// 		const xpPct = Math.max(0, Math.min(100, (xp / max_xp) * 100));
// 		const frame = parent.document.createElement('div');
// 		frame.className = 'simple-party-frame';
// 		frame.innerHTML = `
// 			<div class="simple-party-name">${info.name ?? name}</div>
// 			<div class="simple-party-bar">
// 				<div class="simple-party-bar-inner bar-hp" style="width:${hpPct}%;"></div>
// 				<div class="bar-label">HP: ${hp}</div>
// 			</div>
// 			<div class="simple-party-bar">
// 				<div class="simple-party-bar-inner bar-mp" style="width:${mpPct}%;"></div>
// 				<div class="bar-label">MP: ${mp}</div>
// 			</div>
// 			<div class="simple-party-bar">
// 				<div class="simple-party-bar-inner bar-xp" style="width:${xpPct}%;"></div>
// 				<div class="bar-label">XP: ${xpPct.toFixed(1)}%</div>
// 			</div>
// 		`;
// 		container.appendChild(frame);
// 	}
// }

// setInterval(renderPartyUI, 250);

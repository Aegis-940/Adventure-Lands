
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
		bottom: 100px;
		transform: translateX(-50%);
		display: flex;
		flex-direction: row;
		gap: 12px;
		z-index: 9999;
	}
	.simple-party-frame {
		width: ${partyFrameWidth}px;
		background: rgba(34,34,34,0.75);
		border: 1px solid #444;
		padding: 6px 8px;
		font-family: 'pixel', monospace;
		color: #fff;
	}
	.simple-party-bar {
		height: ${barHeight}px;
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
	parent.$('#party').hide();
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
				<div class="bar-label">HP: ${hp}</div>
			</div>
			<div class="simple-party-bar">
				<div class="simple-party-bar-inner bar-mp" style="width:${mpPct}%;"></div>
				<div class="bar-label">MP: ${mp}</div>
			</div>
			<div class="simple-party-bar">
				<div class="simple-party-bar-inner bar-xp" style="width:${xpPct}%;"></div>
				<div class="bar-label">XP: ${xpPct.toFixed(1)}%</div>
			</div>
		`;
		container.appendChild(frame);
	}
}

setInterval(renderPartyUI, 250);



// ----



// // Controls whether the custom party UI is visible
// let show_party_ui = false;

// if (parent.party_style_prepared) {
// 	parent.$('#style-party-frames').remove();
// }

// let css = `
// 	.party-container {
// 		position: fixed;
// 		left: 50%;
// 		bottom: 100px;
// 		transform: translateX(-50%);	
// 		width: 480px;
// 		height: auto;
// 		font-family: 'pixel';
// 		display: flex;
// 		flex-direction: row;
// 		justify-content: space-between;
// 	}
// `;

// parent.$('head').append(`<style id="style-party-frames">${css}</style>`);
// parent.party_style_prepared = true;

// const PARTY_ORDER = ["Ulric", "Myras", "Riva", "Riff"];
// const includeThese = ['mp', 'max_mp', 'hp', 'max_hp', 'name', 'max_xp', 'name', 'xp', 'level', 'share', 'cc'];
// const partyFrameWidth = 80;

// function updatePartyData() {
// 	let myInfo = Object.fromEntries(Object.entries(character).filter(current => { return character.read_only.includes(current[0]) || includeThese.includes(current[0]); }));
// 	myInfo.lastSeen = Date.now();
// 	set(character.name + '_newparty_info', myInfo);
// }

// setInterval(updatePartyData, 200);

// function getIFramedCharacter(name) {
// 	for (const iframe of top.$('iframe')) {
// 		const char = iframe.contentWindow.character;
// 		if (!char) continue;
// 		if (char.name == name) return char;
// 	}
// 	return null;
// }

// let show_party_frame_property = {
// 	img: true,
// 	hp: true,
// 	mp: true,
// 	xp: true,
// 	cc: true,
// 	ping: true,
// 	share: true
// };

// function get_toggle_text(key) {
// 	return key.toUpperCase() + (show_party_frame_property[key] ? '✔️' : '❌');
// }

// function update_toggle_text(key) {
// 	const toggle = parent.document.getElementById('party-props-toggles-' + key);
// 	toggle.textContent = get_toggle_text(key);
// }

// function addPartyFramePropertiesToggles() {
// 	if (parent.document.getElementById('party-props-toggles')) {
// 		return;
// 	}

// 	const toggles = parent.document.createElement('div');
// 	toggles.id = 'party-props-toggles';
// 	toggles.classList.add('hidden');
// 	toggles.style = `
// 	display: flex; 
// 	flex-wrap: wrap;
// 	width: 100%;
// 	max-width: 480px;
// 	background-color: black;
// 	margin-top: 2px;
// `;

// 	function create_toggle(key) {
// 		const toggle = parent.document.createElement('button');
// 		toggle.id = 'party-props-toggles-' + key;
// 		toggle.setAttribute('data-key', key);
// 		toggle.style = `
// 		border: 1px #ccc solid; 
// 		background-color: #000; 
// 		color: #ccc;
// 		width: 20%;
// 		margin: 0px;
// 		font-size: 9px;
// 		padding: 5px;
// 		cursor: pointer;
// 	`;
// 		toggle.setAttribute(
// 			'onclick',
// 			`parent.code_eval(show_party_frame_property['${key}'] = !show_party_frame_property['${key}']; update_toggle_text('${key}'));`
// 		);
// 		toggle.appendChild(parent.document.createTextNode(get_toggle_text(key)));
// 		return toggle;
// 	}

// 	for (let key of ['img', 'hp', 'mp', 'xp', 'cc']) {
// 		toggles.appendChild(create_toggle(key));
// 	}
// }

// function updatePartyFrames() {
// 	if (!show_party_ui) {
// 		const $ = parent.$;
// 		let partyFrame = $('#newparty');
// 		if (partyFrame && partyFrame.length) partyFrame.hide();
// 		return;
// 	}
// 	let $ = parent.$;
// 	let partyFrame = $('#newparty');
// 	partyFrame.addClass('party-container');

// 	if (partyFrame) {
// 		addPartyFramePropertiesToggles();

// 		for (let x = 0; x < PARTY_ORDER.length; x++) {
// 			let party_member_name = PARTY_ORDER[x];
// 			if (!parent.party[party_member_name]) continue;

// 			let info = get(party_member_name + '_newparty_info');
// 			if (!info || Date.now() - info.lastSeen > 1000) {
// 				let iframed_party_member = getIFramedCharacter(party_member_name);
// 				if (iframed_party_member) {
// 					info = Object.fromEntries(Object.entries(iframed_party_member).filter(current => { return character.read_only.includes(current[0]) || includeThese.includes(current[0]); }));
// 				} else {
// 					let party_member = get_player(party_member_name);
// 					if (party_member) {
// 						info = Object.fromEntries(Object.entries(party_member).filter(current => { return includeThese.includes(current[0]); }));
// 					} else {
// 						info = { name: party_member_name };
// 					}
// 				}
// 			}

// 			let infoHTML = `<div style="width: ${partyFrameWidth}px; height: 24px; margin-top: 3px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;">${info.name}</div>`;

// 			info.max_cc = 200;

// 			let hpWidth = 0;
// 			let mpWidth = 0;
// 			let hp = '??';
// 			let mp = '??';
// 			if (info.hp !== undefined) {
// 				hpWidth = info.hp / info.max_hp * 100;
// 				mpWidth = info.mp / info.max_mp * 100;
// 				hp = info.hp;
// 				mp = info.mp;
// 			}

// 			let xpWidth = 0;
// 			let xp = '??';
// 			if (info.xp !== undefined) {
// 				let lvl = info.level;
// 				let max_xp = G.levels[lvl];
// 				xpWidth = info.xp / max_xp * 100;
// 				xp = xpWidth.toFixed(2) + '%';
// 			}

// 			let ccWidth = 0;
// 			let cc = '??';
// 			if (info.cc !== undefined) {
// 				ccWidth = info.cc / info.max_cc * 100;
// 				cc = info.cc.toFixed(2);
// 			}

// 			let pingWidth = 0;
// 			let ping = '??';
// 			if (character.ping !== undefined) {
// 				pingWidth = -10;
// 				ping = character.ping.toFixed(0);
// 			}

// 			let shareWidth = 0;
// 			let share = '??';
// 			if (parent.party[party_member_name] && parent.party[party_member_name].share !== undefined) {
// 				shareWidth = parent.party[party_member_name].share * 100;
// 				share = (parent.party[party_member_name].share * 100).toFixed(2) + '%';
// 			}

// 			let data = {
// 				hp: hp,
// 				hpWidth: hpWidth,
// 				hpColor: 'red',
// 				mp: mp,
// 				mpWidth: mpWidth,
// 				mpColor: 'blue',
// 				xp: xp,
// 				xpWidth: xpWidth,
// 				xpColor: 'green',
// 				cc: cc,
// 				ccWidth: ccWidth,
// 				ccColor: 'grey',
// 				ping: ping,
// 				pingWidth: pingWidth,
// 				pingColor: 'black',
// 				share: share,
// 				shareWidth: shareWidth * 3,
// 				shareColor: 'teal',
// 			};

// 			for (let key of ['hp', 'mp', 'xp']) {
// 				const text = key.toUpperCase();
// 				const value = data[key];
// 				const width = data[key + 'Width'];
// 				const color = data[key + 'Color'];
// 				if (show_party_frame_property[key]) {
// 					infoHTML += `<div style=\"position: relative; width: 100%; height: 20px; text-align: center; margin-top: 3px;\">
//    <div style=\"position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 20px; z-index: 1; white-space: nowrap;\">${text}: ${value}</div>
//    <div style=\"position: absolute; top: 0; left: 0; right: 0; bottom: 0; background-color: ${color}; width: ${width}%; height: 20px; transform: translate(0, 0); border: 1px solid grey;\"></div>
// </div>`;
// 				}
// 			}

// 			let party_member_frame = partyFrame.find(partyFrame.children()[x]);
// 			party_member_frame.children().first().css('display', show_party_frame_property['img'] ? 'inherit' : 'none');
// 			party_member_frame.children().last().html(`<div style=\"font-size: 22px;\" onclick='pcs(event); party_click(\"${party_member_name}\\\");'>${infoHTML}</div>`);
// 		}
// 	}
// }

// parent.$('#party-props-toggles').remove();

// setInterval(updatePartyFrames, 250);


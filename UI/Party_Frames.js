if (parent.party_style_prepared) {
	parent.$('#style-party-frames').remove();
}

let css = `
	.party-container {
		position: absolute;
		top: 55px;
		right: 2px;
		width: 480px;
		height: auto;
		font-family: 'pixel';
		display: flex;
		flex-direction: row;
		justify-content: space-between;
	}
`;
parent.$('head').append(`<style id="style-party-frames">${css}</style>`);
parent.party_style_prepared = true;

const PARTY_ORDER = ["Ulric", "Myras", "Riva", "Riff"];
const includeThese = ['mp', 'max_mp', 'hp', 'max_hp', 'name', 'max_xp', 'xp', 'level', 'share', 'cc'];
const partyFrameWidth = 80;

function updatePartyData() {
	let myInfo = Object.fromEntries(Object.entries(character).filter(current => {
		return character.read_only.includes(current[0]) || includeThese.includes(current[0]);
	}));
	myInfo.lastSeen = Date.now();
	set(character.name + '_newparty_info', myInfo);
}

setInterval(updatePartyData, 200);

function getIFramedCharacter(name) {
	for (const iframe of top.$('iframe')) {
		const char = iframe.contentWindow.character;
		if (!char) continue;
		if (char.name === name) return char;
	}
	return null;
}

let show_party_frame_property = {
	img: true,
	hp: true,
	mp: true,
	xp: true,
	cc: true,
	ping: true,
	share: true
};

function updatePartyFrames() {
	let $ = parent.$;
	let partyFrame = $('#newparty');
	if (!partyFrame.length) return;

	partyFrame.empty(); // Clear previous frames
	partyFrame.addClass('party-container');

	for (let x = 0; x < PARTY_ORDER.length; x++) {
		let party_member_name = PARTY_ORDER[x];
		if (!parent.party[party_member_name]) continue;

		let info = get(party_member_name + '_newparty_info');
		if (!info || Date.now() - info.lastSeen > 1000) {
			let iframeChar = getIFramedCharacter(party_member_name);
			if (iframeChar) {
				info = Object.fromEntries(Object.entries(iframeChar).filter(current => {
					return character.read_only.includes(current[0]) || includeThese.includes(current[0]);
				}));
			} else {
				let partyChar = get_player(party_member_name);
				if (partyChar) {
					info = Object.fromEntries(Object.entries(partyChar).filter(current => {
						return includeThese.includes(current[0]);
					}));
				} else {
					info = { name: party_member_name };
				}
			}
		}

		info.max_cc = 200;

		let hp = info.hp ?? '??';
		let mp = info.mp ?? '??';
		let hpWidth = info.hp ? info.hp / info.max_hp * 100 : 0;
		let mpWidth = info.mp ? info.mp / info.max_mp * 100 : 0;

		let xp = '??';
		let xpWidth = 0;
		if (info.xp !== undefined) {
			let lvl = info.level;
			let max_xp = G.levels[lvl];
			xpWidth = info.xp / max_xp * 100;
			xp = xpWidth.toFixed(2) + '%';
		}

		let cc = '??', ccWidth = 0;
		if (info.cc !== undefined) {
			ccWidth = info.cc / info.max_cc * 100;
			cc = info.cc.toFixed(2);
		}

		let share = '??', shareWidth = 0;
		if (parent.party[party_member_name]?.share !== undefined) {
			shareWidth = parent.party[party_member_name].share * 100;
			share = (shareWidth).toFixed(2) + '%';
		}

		let data = {
			hp: hp,
			hpWidth: hpWidth,
			hpColor: 'red',
			mp: mp,
			mpWidth: mpWidth,
			mpColor: 'blue',
			xp: xp,
			xpWidth: xpWidth,
			xpColor: 'green',
			cc: cc,
			ccWidth: ccWidth,
			ccColor: 'grey',
			share: share,
			shareWidth: shareWidth * 3,
			shareColor: 'teal',
		};

		let infoHTML = `<div style="width: ${partyFrameWidth}px; height: 20px; margin-top: 3px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;">${info.name}</div>`;

		for (let key of ['hp', 'mp', 'xp']) {
			if (!show_party_frame_property[key]) continue;
			let text = key.toUpperCase();
			let value = data[key];
			let width = data[key + 'Width'];
			let color = data[key + 'Color'];

			infoHTML += `<div style="position: relative; width: 100%; height: 20px; text-align: center; margin-top: 3px;">
	<div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-weight: bold; font-size: 17px; z-index: 1; white-space: nowrap; text-shadow: -1px 0 black, 0 2px black, 2px 0 black, 0 -1px black;">${text}: ${value}</div>
	<div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background-color: ${color}; width: ${width}%; height: 20px; transform: translate(0, 0); border: 1px solid grey;"></div>
</div>`;
		}

		let baseIcon = `<img src="/images/characters/${info.name.toLowerCase()}.png" style="width: 32px; height: 32px;">`;
		let frame = $(`
			<div style="width: ${partyFrameWidth}px; cursor: pointer;" onclick='pcs(event); party_click("${party_member_name}");'>
				${show_party_frame_property.img ? baseIcon : ''}
				<div style="font-size: 22px;">${infoHTML}</div>
			</div>
		`);

		partyFrame.append(frame);
	}
}

setInterval(updatePartyFrames, 250);

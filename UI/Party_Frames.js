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
const includeThese = ['mp', 'max_mp', 'hp', 'max_hp', 'name', 'max_xp', 'name', 'xp', 'level', 'share', 'cc'];
const partyFrameWidth = 80;

function updatePartyData() {
	let myInfo = Object.fromEntries(
		Object.entries(character)
			.filter(current =>
				character.read_only.includes(current[0]) ||
				includeThese.includes(current[0])
			)
	);
	myInfo.lastSeen = Date.now();
	set(character.name + '_newparty_info', myInfo);
}

setInterval(updatePartyData, 200);

function getIFramedCharacter(name) {
	for (const iframe of top.$('iframe')) {
		const char = iframe.contentWindow.character;
		if (!char) continue;
		if (char.name == name) return char;
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

function addPartyFramePropertiesToggles() {
	if (parent.document.getElementById('party-props-toggles')) {
		return;
	}

	const toggles = parent.document.createElement('div');
	toggles.id = 'party-props-toggles';
	toggles.classList.add('hidden');
	toggles.style = `
		display: flex; 
		flex-wrap: wrap;
		width: 100%;
		max-width: 480px;
		background-color: black;
		margin-top: 2px;
	`;

	function create_toggle(key) {
		const toggle = parent.document.createElement('button');
		toggle.id = 'party-props-toggles-' + key;
		toggle.setAttribute('data-key', key);
		toggle.style = `
			border: 1px #ccc solid; 
			background-color: #000; 
			color: #ccc;
			width: 20%;
			margin: 0px;
			font-size: 9px;
			padding: 5px;
			cursor: pointer;
		`;
		toggle.setAttribute(
			'onclick',
			`parent.code_eval(show_party_frame_property['${key}'] = !show_party_frame_property['${key}']; document.getElementById('party-props-toggles-${key}').textContent = key.toUpperCase() + (show_party_frame_property['${key}'] ? '✔️' : '❌'));`
		);
		toggle.appendChild(
			parent.document.createTextNode(
				key.toUpperCase() + (show_party_frame_property[key] ? '✔️' : '❌')
			)
		);
		return toggle;
	}

	for (let key of ['img', 'hp', 'mp', 'xp', 'cc']) {
		toggles.appendChild(create_toggle(key));
	}

	// you can insert toggles into the UI if desired
}

function updatePartyFrames() {
	let $ = parent.$;
	let partyFrame = $('#newparty');
	partyFrame.addClass('party-container');

	if (!partyFrame.length) return;
	addPartyFramePropertiesToggles();

	// Build a map from character name → DOM element
	let frameMap = {};
	partyFrame.children().each((i, elem) => {
		let img = $(elem).find('img').first();
		if (!img.length) return;
		let src = img.attr('src') || '';
		let m = src.match(/\/([^\/]+)\.\w+$/);
		if (m) frameMap[m[1]] = elem;
	});

	// Update frames in specified order
	for (let name of PARTY_ORDER) {
		if (!parent.party[name]) continue;
		let elem = frameMap[name];
		if (!elem) continue;

		let party_member_frame = $(elem);

		// Fetch latest info
		let info = get(name + '_newparty_info');
		if (!info || Date.now() - info.lastSeen > 1000) {
			let iframed = getIFramedCharacter(name);
			if (iframed) {
				info = Object.fromEntries(
					Object.entries(iframed)
						.filter(current =>
							character.read_only.includes(current[0]) ||
							includeThese.includes(current[0])
						)
				);
			} else {
				let pm = get_player(name);
				if (pm) {
					info = Object.fromEntries(
						Object.entries(pm)
							.filter(current => includeThese.includes(current[0]))
					);
				} else {
					info = { name };
				}
			}
		}

		// Build inner HTML
		let infoHTML = `<div style="width: ${partyFrameWidth}px; height:20px; margin-top:3px; overflow:hidden; white-space:nowrap; text-overflow:ellipsis;">${info.name}</div>`;
		info.max_cc = 200;

		let hpWidth = 0, mpWidth = 0, hp = '??', mp = '??';
		if (info.hp !== undefined) {
			hpWidth = info.hp / info.max_hp * 100;
			mpWidth = info.mp / info.max_mp * 100;
			hp = info.hp; mp = info.mp;
		}

		let xpWidth = 0, xp = '??';
		if (info.xp !== undefined) {
			let lvl = info.level, max_xp = G.levels[lvl];
			xpWidth = info.xp / max_xp * 100;
			xp = xpWidth.toFixed(2) + '%';
		}

		let ccWidth = 0, cc = '??';
		if (info.cc !== undefined) {
			ccWidth = info.cc / info.max_cc * 100;
			cc = info.cc.toFixed(2);
		}

		let pingWidth = 0, ping = '??';
		if (character.ping !== undefined) {
			pingWidth = -10;
			ping = character.ping.toFixed(0);
		}

		let shareWidth = 0, share = '??';
		if (parent.party[name] && parent.party[name].share !== undefined) {
			shareWidth = parent.party[name].share * 100;
			share = (parent.party[name].share * 100).toFixed(2) + '%';
		}

		let data = {
			hp, hpWidth, hpColor:'red',
			mp, mpWidth, mpColor:'blue',
			xp, xpWidth, xpColor:'green',
			cc, ccWidth, ccColor:'grey',
			ping, pingWidth, pingColor:'black',
			share, shareWidth: shareWidth*3, shareColor:'teal'
		};

		for (let key of ['hp','mp','xp']) {
			if (!show_party_frame_property[key]) continue;
			let text = key.toUpperCase();
			let value = data[key];
			let width = data[key + 'Width'];
			let color = data[key + 'Color'];
			infoHTML += `
<div style="position:relative; width:100%; height:20px; text-align:center; margin-top:3px;">
	<div style="position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); font-weight:bold; font-size:17px; z-index:1; white-space:nowrap; text-shadow:-1px 0 black,0 2px black,2px 0 black,0 -1px black;">
		${text}: ${value}
	</div>
	<div style="position:absolute; top:0; left:0; right:0; bottom:0; background-color:${color}; width:${width}%; height:20px; border:1px solid grey;"></div>
</div>`;
		}

		party_member_frame.children().first().css('display', show_party_frame_property['img'] ? 'inherit' : 'none');
		party_member_frame.children().last().html(`<div style="font-size:22px;" onclick='pcs(event); party_click("${name}");'>${infoHTML}</div>`);
	}
}

parent.$('#party-props-toggles').remove();
setInterval(updatePartyFrames, 250);

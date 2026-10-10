// --------------------------------------------------------------------------------------------------------------------------------- //
// LUCKY SLOT TRACKER — per inventory slot, how many upgrade/compound rolls came up 00.00 and how many over 96.3
// --------------------------------------------------------------------------------------------------------------------------------- //

const SLOT_ROLL_KEY = "AL_slot_rolls";
const SLOT_ROLL_HIGH = 0.963;

const slot_roll_counted = {};

function slot_rolls() {
	const data = storage_read(SLOT_ROLL_KEY) || {};
	for (let i = 0; i < character.isize; i++) {
		if (!data[i]) data[i] = { zero: 0, high: 0 };
	}
	return data;
}

function record_slot_roll(event) {
	const nums = event.p.nums;
	const slot = event.num;

	if (nums.length < 4) {
		delete slot_roll_counted[slot];
		return;
	}

	const key = nums.join("");
	if (slot_roll_counted[slot] === key) return;
	slot_roll_counted[slot] = key;

	const rolled = (nums[3] * 1000 + nums[2] * 100 + nums[1] * 10 + nums[0]) / 10000;
	if (rolled > 0 && rolled <= SLOT_ROLL_HIGH) return;

	const data = slot_rolls();
	if (rolled === 0) data[slot].zero++;
	else data[slot].high++;
	storage_write(SLOT_ROLL_KEY, data);

	if (parent.$("#slot_luck_dashboard").is(":visible")) show_slot_luck();
}

if (parent.socket._slot_roll_handler) {
	parent.socket.off("q_data", parent.socket._slot_roll_handler);
}

parent.socket._slot_roll_handler = record_slot_roll;
parent.socket.on("q_data", parent.socket._slot_roll_handler);

// --------------------------------------------------------------------------------------------------------------------------------- //
// DASHBOARD
// --------------------------------------------------------------------------------------------------------------------------------- //

function ensure_slot_luck_styles() {
	const $ = parent.$;
	if ($("#slot_luck_styles").length) return;
	$("<style id='slot_luck_styles'>").text(`
		#slot_luck_dashboard *{box-sizing:border-box}
		#slot_luck_dashboard .sl-title{text-align:center;color:#f1c054;font-size:40px;margin-bottom:20px}
		#slot_luck_dashboard .sl-legend{display:flex;justify-content:center;gap:44px;padding-bottom:18px;margin-bottom:20px;border-bottom:2px solid gray}
		#slot_luck_dashboard .sl-legend b{display:inline-flex;align-items:center;justify-content:center;width:52px;height:38px;border:2px solid gray;font-size:22px!important;background:black}
		#slot_luck_dashboard .sl-badge-zero{color:#5DE376!important;border-color:#5DE376!important}
		#slot_luck_dashboard .sl-badge-high{color:#D95A55!important;border-color:#D95A55!important}
		#slot_luck_dashboard .sl-lucky{margin:0 auto 24px;padding:12px 24px;text-align:center;width:400px;border:2px solid #f1c054}
		#slot_luck_dashboard .sl-lucky-label{color:gray;font-size:20px}
		#slot_luck_dashboard .sl-lucky-slot{color:#f1c054;font-size:40px;font-weight:bold}
		#slot_luck_dashboard .sl-lucky-stats{color:#C3C3C3;font-size:24px}
		#slot_luck_dashboard .sl-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:10px}
		#slot_luck_dashboard .sl-slot{position:relative;width:82px;height:82px;background:black;border:2px solid gray;display:flex;align-items:center;justify-content:center}
		#slot_luck_dashboard .sl-slot.sl-lucky-tile{border-color:#f1c054;box-shadow:inset 0 0 0 1px rgba(241,192,84,.25),0 0 6px rgba(241,192,84,.4)}
		#slot_luck_dashboard .sl-slot-num{color:gray;font-size:22px}
		#slot_luck_dashboard .sl-corner{position:absolute;background:black;border:2px solid gray;font-size:20px;line-height:20px;padding:3px 6px;min-width:20px;text-align:center}
		#slot_luck_dashboard .sl-corner-zero{bottom:-2px;left:-2px;color:#5DE376;border-color:#5DE376}
		#slot_luck_dashboard .sl-corner-high{bottom:-2px;right:-2px;color:#D95A55;border-color:#D95A55}
	`).appendTo("head");
}

function lucky_slot(data) {
	let lucky = null;
	for (let i = 0; i < character.isize; i++) {
		const d = data[i];
		if (lucky === null || d.zero > data[lucky].zero || (d.zero === data[lucky].zero && d.high < data[lucky].high)) lucky = i;
	}
	return data[lucky].zero || data[lucky].high ? lucky : null;
}

function show_slot_luck() {
	ensure_slot_luck_styles();

	const data = slot_rolls();
	const lucky = lucky_slot(data);

	let grid = "";
	for (let i = 0; i < character.isize; i++) {
		grid += `<div class="sl-slot${i === lucky ? " sl-lucky-tile" : ""}">`
			+ `<div class="sl-slot-num">${i}</div>`
			+ `<div class="sl-corner sl-corner-zero">${data[i].zero}</div>`
			+ `<div class="sl-corner sl-corner-high">${data[i].high}</div>`
			+ `</div>`;
	}

	const lucky_text = lucky !== null
		? `<div class="sl-lucky-slot">SLOT ${lucky}</div><div class="sl-lucky-stats">${data[lucky].zero} × 00.00  •  ${data[lucky].high} × &gt;96.3</div>`
		: `<div class="sl-lucky-slot">--</div><div class="sl-lucky-stats">Waiting for rolls...</div>`;

	const html = `<div id="slot_luck_dashboard" style="border:5px solid gray;background:black;padding:24px;color:#E4E4E4;font-size:28px;line-height:30px;">
		<div class="sl-title cbold">Lucky Slots</div>
		<div class="sl-legend">
			<b class="sl-badge-zero">00</b>
			<b class="sl-badge-high">&gt;96</b>
		</div>
		<div class="sl-lucky">
			<div class="sl-lucky-label">POTENTIAL LUCKY SLOT</div>
			${lucky_text}
		</div>
		<div class="sl-grid">${grid}</div>
	</div>`;

	parent.hide_modal();
	parent.show_modal(html, { wrap: false, hideinbackground: true, title: "Lucky Slots" });
}

add_toprightcorner_button("slot_luck_button", "🍀", show_slot_luck);

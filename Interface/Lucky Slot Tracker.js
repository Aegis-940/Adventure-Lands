// --------------------------------------------------------------------------------------------------------------------------------- //
// LUCKY SLOT TRACKER — every scroll upgrade roll per inventory slot, and the odds that slot is this character's lucky slot
// --------------------------------------------------------------------------------------------------------------------------------- //

const SLOT_ROLL_KEY = "AL_upgrade_slot_rolls";
const SLOT_COUNT = 42;
const SLOT_ROLL_HIGH = 9630;
const LUCKY_SLOT_CONFIDENCE = 0.999;

const LUCKY_P_ZERO = 0.4 * 0.0001 + 0.6 * 0.0121 / 0.975;
const LUCKY_P_HIGH = 0.4 * 0.0369;
const SLOT_ROLL_LOG_ODDS = {
	zero: Math.log(LUCKY_P_ZERO / 0.0001),
	high: Math.log(LUCKY_P_HIGH / 0.0369),
	mid: Math.log((1 - LUCKY_P_ZERO - LUCKY_P_HIGH) / 0.963),
};

const slot_roll_counted = {};

function slot_rolls() {
	const data = storage_read(SLOT_ROLL_KEY) || {};
	for (let i = 0; i < SLOT_COUNT; i++) {
		if (!data[i]) data[i] = { n: 0, zero: 0, high: 0 };
	}
	return data;
}

function scroll_upgrade_roll(event) {
	const upgrade = event.q.upgrade;
	const scroll = event.p.scroll;
	return !!upgrade && upgrade.num === event.num && !!scroll && G.items[scroll].type === "uscroll";
}

function record_slot_roll(event) {
	if (!scroll_upgrade_roll(event)) return;

	const nums = event.p.nums;
	const slot = event.num;

	if (nums.length < 4) {
		delete slot_roll_counted[slot];
		return;
	}

	const key = nums.join("");
	if (slot_roll_counted[slot] === key) return;
	slot_roll_counted[slot] = key;

	const rolled = nums[3] * 1000 + nums[2] * 100 + nums[1] * 10 + nums[0];
	const data = slot_rolls();
	data[slot].n++;
	if (rolled === 0) data[slot].zero++;
	else if (rolled > SLOT_ROLL_HIGH) data[slot].high++;
	storage_write(SLOT_ROLL_KEY, data);

	if (parent.$("#slot_luck_dashboard").is(":visible")) show_slot_luck();
}

if (parent.socket._slot_roll_handler) {
	parent.socket.off("q_data", parent.socket._slot_roll_handler);
}

parent.socket._slot_roll_handler = record_slot_roll;
parent.socket.on("q_data", parent.socket._slot_roll_handler);

// --------------------------------------------------------------------------------------------------------------------------------- //
// ODDS
// --------------------------------------------------------------------------------------------------------------------------------- //

function slot_log_likelihood(d) {
	return d.zero * SLOT_ROLL_LOG_ODDS.zero
		+ d.high * SLOT_ROLL_LOG_ODDS.high
		+ (d.n - d.zero - d.high) * SLOT_ROLL_LOG_ODDS.mid;
}

function lucky_slot_odds(data) {
	const logs = [];
	for (let i = 0; i < SLOT_COUNT; i++) logs.push(slot_log_likelihood(data[i]));
	const top = Math.max(...logs);
	const weights = logs.map(l => Math.exp(l - top));
	const total = weights.reduce((sum, w) => sum + w, 0);
	return weights.map(w => w / total);
}

function likeliest_slot(odds) {
	return odds.indexOf(Math.max(...odds));
}

function upgrade_slot_for(slot) {
	const data = slot_rolls();
	const odds = lucky_slot_odds(data);
	const best = likeliest_slot(odds);
	if (odds[best] >= LUCKY_SLOT_CONFIDENCE) return best;

	let target = slot;
	for (let i = 0; i < SLOT_COUNT; i++) {
		if (data[i].n < data[target].n) target = i;
	}
	return target;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// DASHBOARD
// --------------------------------------------------------------------------------------------------------------------------------- //

function ensure_slot_luck_styles() {
	const $ = parent.$;
	$("#slot_luck_styles").remove();
	$("<style id='slot_luck_styles'>").text(`
		#slot_luck_dashboard *{box-sizing:border-box}
		#slot_luck_dashboard .sl-title{text-align:center;color:#f1c054;font-size:40px;margin-bottom:20px}
		#slot_luck_dashboard .sl-legend{display:flex;justify-content:center;gap:44px;padding-bottom:18px;margin-bottom:20px;border-bottom:2px solid gray}
		#slot_luck_dashboard .sl-legend b{display:inline-flex;align-items:center;justify-content:center;width:52px;height:38px;border:2px solid gray;font-size:22px!important;background:black}
		#slot_luck_dashboard .sl-badge-n{color:#C3C3C3!important}
		#slot_luck_dashboard .sl-badge-zero{color:#5DE376!important;border-color:#5DE376!important}
		#slot_luck_dashboard .sl-badge-high{color:#D95A55!important;border-color:#D95A55!important}
		#slot_luck_dashboard .sl-lucky{margin:0 auto 24px;padding:12px 24px;text-align:center;width:460px;border:2px solid #f1c054}
		#slot_luck_dashboard .sl-lucky-label{color:gray;font-size:20px}
		#slot_luck_dashboard .sl-lucky-slot{color:#f1c054;font-size:40px;font-weight:bold}
		#slot_luck_dashboard .sl-lucky-stats{color:#C3C3C3;font-size:24px}
		#slot_luck_dashboard .sl-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:10px}
		#slot_luck_dashboard .sl-slot{position:relative;width:82px;height:82px;background:black;border:2px solid gray;display:flex;flex-direction:column;align-items:center;justify-content:center}
		#slot_luck_dashboard .sl-slot.sl-lucky-tile{border-color:#f1c054;box-shadow:inset 0 0 0 1px rgba(241,192,84,.25),0 0 6px rgba(241,192,84,.4)}
		#slot_luck_dashboard .sl-slot-num{color:gray;font-size:22px}
		#slot_luck_dashboard .sl-slot-odds{color:#f1c054;font-size:16px;line-height:16px}
		#slot_luck_dashboard .sl-corner{position:absolute;background:black;border:2px solid gray;font-size:16px;line-height:16px;padding:2px 4px;min-width:18px;text-align:center}
		#slot_luck_dashboard .sl-corner-n{top:-2px;left:-2px;color:#C3C3C3}
		#slot_luck_dashboard .sl-corner-zero{bottom:-2px;left:-2px;color:#5DE376;border-color:#5DE376}
		#slot_luck_dashboard .sl-corner-high{bottom:-2px;right:-2px;color:#D95A55;border-color:#D95A55}
	`).appendTo("head");
}

function odds_text(p) {
	return `${(p * 100).toFixed(1)}%`;
}

function show_slot_luck() {
	ensure_slot_luck_styles();

	const data = slot_rolls();
	const odds = lucky_slot_odds(data);
	const best = likeliest_slot(odds);
	let total = 0;
	for (let i = 0; i < SLOT_COUNT; i++) total += data[i].n;

	let grid = "";
	for (let i = 0; i < SLOT_COUNT; i++) {
		grid += `<div class="sl-slot${total && i === best ? " sl-lucky-tile" : ""}">`
			+ `<div class="sl-corner sl-corner-n">${data[i].n}</div>`
			+ `<div class="sl-slot-num">${i}</div>`
			+ `<div class="sl-slot-odds">${odds_text(odds[i])}</div>`
			+ `<div class="sl-corner sl-corner-zero">${data[i].zero}</div>`
			+ `<div class="sl-corner sl-corner-high">${data[i].high}</div>`
			+ `</div>`;
	}

	const label = odds[best] >= LUCKY_SLOT_CONFIDENCE ? "LUCKY SLOT FOUND" : "LIKELIEST LUCKY SLOT";
	const lucky_text = total
		? `<div class="sl-lucky-slot">SLOT ${best} — ${odds_text(odds[best])}</div><div class="sl-lucky-stats">${data[best].n} rolls  •  ${data[best].zero} × 00.00  •  ${data[best].high} × &gt;96.3  •  ${total} total</div>`
		: `<div class="sl-lucky-slot">--</div><div class="sl-lucky-stats">Waiting for rolls...</div>`;

	const html = `<div id="slot_luck_dashboard" style="border:5px solid gray;background:black;padding:24px;color:#E4E4E4;font-size:28px;line-height:30px;">
		<div class="sl-title cbold">Lucky Slots</div>
		<div class="sl-legend">
			<b class="sl-badge-n">n</b>
			<b class="sl-badge-zero">00</b>
			<b class="sl-badge-high">&gt;96</b>
		</div>
		<div class="sl-lucky">
			<div class="sl-lucky-label">${label}</div>
			${lucky_text}
		</div>
		<div class="sl-grid">${grid}</div>
	</div>`;

	parent.hide_modal();
	parent.show_modal(html, { wrap: false, hideinbackground: true, title: "Lucky Slots" });
}

add_toprightcorner_button("slot_luck_button", "🍀", show_slot_luck);

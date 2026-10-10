// --------------------------------------------------------------------------------------------------------------------------------- //
// BOSS CONTRIBUTION — every visible player's coop points on our cooperative boss, and the loot share the server will give them
// --------------------------------------------------------------------------------------------------------------------------------- //

const COOP_SHARE_POWER = 0.65;
const COOP_CREDIT_SHARE = 0.0025;
const COOP_ROWS_PER_COLUMN = 6;

function coop_contributors() {
	const coop_id = character.s.coop?.id;
	const players = [character, ...Object.values(parent.entities).filter(e => e.type === "character")];
	return players
		.filter(p => p.s?.coop?.p && (!coop_id || p.s.coop.id === coop_id))
		.map(p => ({ name: p.name, ctype: p.ctype, points: p.s.coop.p }))
		.sort((a, b) => b.points - a.points);
}

function coop_share_weight(points) {
	return Math.pow(Math.max(0, points), COOP_SHARE_POWER);
}

function coop_cell(entry, max_points, total_weight, width) {
	const colour = CLASS_COLORS[entry.ctype.toLowerCase()] || "#FFFFFF";
	const bar_pct = (entry.points / max_points * 100).toFixed(1);
	const share = coop_share_weight(entry.points) / total_weight;
	const share_colour = share > COOP_CREDIT_SHARE ? "#000" : "#A00";
	const label = "position:absolute;top:0;color:#000;font-weight:bold;font-size:13px;line-height:14px";
	return `<td style="color:${colour};width:${width}%;border:1px solid #444;padding:2px">${entry.name}`
		+ `<div style="width:100%;background:#555;border-radius:3px;position:relative;height:14px">`
		+ `<div style="width:${bar_pct}%;background:${colour};height:100%"></div>`
		+ `<span style="${label};left:4px">${commas(entry.points)}</span>`
		+ `<span style="${label};right:4px;color:${share_colour}">${(share * 100).toFixed(2)}%</span>`
		+ `</div></td>`;
}

function boss_contribution_html(content) {
	const entries = coop_contributors();
	content.parent().toggle(entries.length > 0);
	if (!entries.length) return "";

	const max_points = Math.max(1, entries[0].points);
	const total_weight = 0.1 + entries.reduce((sum, e) => sum + coop_share_weight(e.points), 0);
	const columns = Math.ceil(entries.length / COOP_ROWS_PER_COLUMN);
	const rows = Math.min(COOP_ROWS_PER_COLUMN, entries.length);
	const width = (100 / columns).toFixed(1);

	let body = "";
	for (let r = 0; r < rows; r++) {
		body += "<tr>";
		for (let c = 0; c < columns; c++) {
			const entry = entries[r + c * COOP_ROWS_PER_COLUMN];
			if (entry) body += coop_cell(entry, max_points, total_weight, width);
		}
		body += "</tr>";
	}

	return `<div>👑 Boss Contribution 👑</div><table style="width:100%;border-collapse:collapse"><tbody>${body}</tbody></table>`;
}

register_widget("bosscontribution", {
	tick_ms: 250,
	container: {
		fontSize: "20px", color: "white", textAlign: "center", width: "100%",
		backgroundColor: "rgba(0,0,0,0.7)", marginBottom: "-3px",
	},
	content: {
		padding: "2px", border: "4px solid grey",
	},
	render: content => boss_contribution_html(content),
});

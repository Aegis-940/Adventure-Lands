// --------------------------------------------------------------------------------------------------------------------------------- //
// MERCHANT GEAR — what he carries by default, and swapping to a gathering tool
// --------------------------------------------------------------------------------------------------------------------------------- //

function is_default_gear(item) {
	return !!item && equipment_sets.default.some(entry => entry.item_name === item.name && (item.level || 0) === entry.level);
}

async function equip_default_gear() {
	await equip_once("default gear", EQUIP_PRIORITY.rules, "default");
}

async function ensure_tool_available(tool_name) {
	if (character.slots.mainhand && character.slots.mainhand.name === tool_name) return true;
	if (locate_item(tool_name) !== -1) return true;

	log_msg("info", `🔎 No ${tool_name} in inventory, checking bank...`);
	await smarter_move(BANK_LOCATION);
	await sleep(500);
	await withdraw_item(tool_name);
	await sleep(400);
	if (locate_item(tool_name) !== -1) return true;

	log_msg("info", `🔨 No ${tool_name} in bank either, attempting to craft one...`);
	for (let attempt = 0; attempt < 8; attempt++) {
		const result = await craft_item(tool_name);
		if (result === "crafted") break;
		if (result !== "buying" && result !== "withdrawing") break;
		await sleep(400);
	}

	if (locate_item(tool_name) === -1) {
		log_msg("error", `Could not obtain a ${tool_name} (not in inventory, bank, or craftable).`);
		return false;
	}
	return true;
}

async function equip_tool(tool_name) {
	await equip_once("tool", EQUIP_PRIORITY.rules, tool_name);
	return character.slots.mainhand && character.slots.mainhand.name === tool_name;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// MERCHANT GEAR — what he carries by default, and swapping to a gathering tool
// --------------------------------------------------------------------------------------------------------------------------------- //

function is_default_gear(item) {
	if (!item) return false;
	for (const slot in CONFIG.default_gear) {
		const g = CONFIG.default_gear[slot];
		if (g && g.name === item.name) return true;
	}
	return false;
}

async function equip_default_gear() {
	for (const slot of ["mainhand", "offhand"]) {
		const gear = CONFIG.default_gear[slot];
		const current = character.slots[slot];
		if (current && current.name === gear.name && current.level === gear.level) continue;

		const idx = character.items.findIndex(item => item && item.name === gear.name && item.level === gear.level);
		if (idx === -1) continue;

		await equip(idx, slot);
		await delay(400);
	}
}

async function ensure_tool_available(tool_name) {
	function find_in_inventory() {
		return character.items.findIndex(item => item && item.name === tool_name);
	}

	if (character.slots.mainhand && character.slots.mainhand.name === tool_name) return true;
	if (find_in_inventory() !== -1) return true;

	log(`🔎 No ${tool_name} in inventory, checking bank...`);
	await smarter_move(BANK_LOCATION);
	await delay(500);
	await withdraw_item(tool_name);
	await delay(400);
	if (find_in_inventory() !== -1) return true;

	log(`🔨 No ${tool_name} in bank either, attempting to craft one...`);
	for (let attempt = 0; attempt < 8; attempt++) {
		const result = await craft_item(tool_name);
		if (result === "crafted") break;
		if (result !== "buying" && result !== "withdrawing") break;
		await delay(400);
	}

	if (find_in_inventory() === -1) {
		log(`❌ Could not obtain a ${tool_name} (not in inventory, bank, or craftable).`);
		return false;
	}
	return true;
}

async function equip_tool(tool_name) {
	if (character.slots.mainhand && character.slots.mainhand.name === tool_name) return true;

	const idx = character.items.findIndex(item => item && item.name === tool_name);
	if (idx === -1) return false;

	if (character.slots.offhand) {
		await unequip("offhand");
		await delay(400);
	}

	await equip(idx, "mainhand");
	await delay(400);
	return character.slots.mainhand && character.slots.mainhand.name === tool_name;
}

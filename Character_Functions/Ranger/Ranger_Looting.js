// --------------------------------------------------------------------------------------------------------------------------------- //
// RANGER LOOTING — disabled; kept for when delayed chest looting is wanted again
// --------------------------------------------------------------------------------------------------------------------------------- //

// const CHEST_STORAGE_KEY = "loot_chest_ids";

// function loadChestMap() {
// 	const data = get(CHEST_STORAGE_KEY);
// 	return typeof data === "object" && data !== null ? data : {};
// }

// function saveChestMap(map) {
// 	set(CHEST_STORAGE_KEY, map);
// }

// function removeChestId(id) {
// 	const stored = loadChestMap();
// 	if (stored[id]) {
// 		delete stored[id];
// 		saveChestMap(stored);
// 	}
// }

// function updateChestsInStorage() {
// 	const stored = loadChestMap();
// 	const now = performance.now();
// 	for (const id of Object.keys(get_chests())) {
// 		if (!stored[id]) {
// 			stored[id] = now;
// 		}
// 	}
// 	saveChestMap(stored);
// }

// async function handleLooting() {
// 	if (!CONFIG.looting.enabled) return;

// 	try {
// 		const chestMap = loadChestMap();
// 		const now = performance.now();
// 		let looted = 0;

// 		for (const id of Object.keys(chestMap)) {
// 			const storedAt = chestMap[id];
// 			if (!storedAt) continue;
// 			if (now - storedAt < CONFIG.looting.delayMs) continue;
// 			await loot(id);
// 			removeChestId(id);
// 			looted++;
// 		}

// 		if (looted > 0) {
// 			console.log(`Looted ${looted} chest(s)`);
// 		}
// 	} catch (err) {
// 		console.error("Looting error:", err);
// 	}
// }

// function lootInterval() {
// 	updateChestsInStorage();
// 	handleLooting();
// }
// setInterval(lootInterval, 250);

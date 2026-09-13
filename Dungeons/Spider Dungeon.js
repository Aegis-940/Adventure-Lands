// --------------------------------------------------------------------------------------------------------------------------------- //
// SPIDER DUNGEON — the healer leads the party through the spider instance
// --------------------------------------------------------------------------------------------------------------------------------- //

const SPIDER_DUNGEON = {
	name: "Spider Dungeon",
	map: "spider_instance",
	home: "giantspider",
	entrance: { map: "gateway", x: -322, y: -203 },
	bosses: [
		{ mtype: "spiderbr", x: 192, y: -1533 },
		{ mtype: "spiderr", x: 0, y: -1515 },
		{ mtype: "spiderbl", x: -188, y: -1515 }
	]
};

function run_spider_dungeon() {
	return run_dungeon(SPIDER_DUNGEON);
}

function start_spider_dungeon_when_ready() {
	start_dungeon_when_ready(SPIDER_DUNGEON);
}

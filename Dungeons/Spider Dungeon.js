// --------------------------------------------------------------------------------------------------------------------------------- //
// SPIDER DUNGEON — the healer leads the party through the spider instance
// --------------------------------------------------------------------------------------------------------------------------------- //

DUNGEONS.spider = {
	name: "Spider Dungeon",
	map: "spider_instance",
	home: "giantspider",
	entrance: { map: "gateway", x: -322, y: -203 },
	flags: {
		leader_manual: true,
		center_on_tank: true,
		combat_always_on: true,
		single_target: true,
		warrior_single_weapon: true,
		nearest_first: true,
		no_cleave: true,
		no_agitate: true,
		circle_on_self: true,
		skip_panic: true,
		absorb_nearby: true,
		aggroed_only: true,
		defensive_targeting: true,
		no_attack: true,
		engage_radius: 50,
	},
	bosses: [
		{ mtype: "spiderbr", x: 192, y: -1533 },
		{ mtype: "spiderr", x: 0, y: -1515 },
		{ mtype: "spiderbl", x: -188, y: -1515 }
	]
};

function run_spider_dungeon() {
	return run_dungeon(DUNGEONS.spider);
}

function start_spider_dungeon_when_ready() {
	start_dungeon_when_ready(DUNGEONS.spider);
}

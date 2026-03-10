// --------------------------------------------------------------------------------------------------------------------------------- //
// CONFIG VARIABLES
// --------------------------------------------------------------------------------------------------------------------------------- //

// Monster Targets
const HEALER_TARGET    = MONSTER_LOCS.dryad;
const WARRIOR_TARGET   = MONSTER_LOCS.dryad;
const RANGER_TARGET    = MONSTER_LOCS.dryad;

const WHITELIST_MONSTERS            = ["goo", "bee", "crab", "snake", "osnake", "bat", "goldenbat", "croc", "arcticbee", "spider", "cgoo", "stoneworm", "jr", "minimush", 
                                    "rat", "bbpompom", "tortoise", "crabx", "porcupine", "armadillo", "squig", "ghost", "phoenix", "iceroamer", "skeletor", "snowman",
									"prat", "booboo", "bigbird", "poisio", "boar", "mechagnome", "mrpumpkin", "mrgreen", "greenjr", "fireroamer", "dryad", "bscorpion",
                                    "dragold", "mummy", "plantoid"];

const MONSTER_LOCS = {
    spider: 	  { map: "main", x: 907, y: -174, orbit: true , hostile: false },
    crab:   	  { map: "main", x: -1197, y: -79, orbit: false , hostile: false },
    fireroamer:   { map: "desertland", x: 116, y: -606, orbit: true , hostile: false },
    cgoo:         { map: "level2s", x: 10, y: 500, orbit: true , hostile: false },
    bbpompop:     { map: "winter_cave", x: -82, y: -949, orbit: true , hostile: false },
    booboo:       { map: "spookytown", x: 370, y: -790, orbit: true , hostile: true },
    ghost:        { map: "halloween", x: 229, y: -1203, orbit: true , hostile: false },
    prat:         { map: "level1", x: 89, y: 199, orbit: true , hostile: false },
    dryad:        { map: "mforest", x: 380, y: -359, orbit: true , hostile: false },
    bscorpion:    { map: "desertland", x: -408, y: -1266, orbit: true , hostile: false },
    mummy:        { map: "level3", x: -328, y: -213, orbit: true , hostile: false },
    mummy1:       { map: "spookytown", x: 252, y: -1380, orbit: true , hostile: false },
    plantoid:     { map: "desertland", x: -820, y: -336, orbit: true , hostile: false },
};
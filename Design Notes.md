# Design Notes

Why each system works the way it does: the mechanics it relies on, the numbers it was tuned to, and the incidents that shaped it. The code carries no comments by convention, so this file is where the reasoning lives. [`CLAUDE.md`](CLAUDE.md) has the rules and the one-line file map; read the matching section here before changing a file.

Dates are 2026, written `MM-DD`.

---

## Loader

### `Code Loader.js`

The one file that lives in a game code slot. It fetches and evals `Bootstrapper.js` from jsDelivr, falling back to `rawcdn.githack.com` at the same SHA (correct `application/javascript`, CORS `*`). On 10-07 jsDelivr's `/gh/` backend returned 503 for every uncached commit while npm and cached commits still served. Whichever base works becomes `window.__AL_BASE__`, and the Bootstrapper loads everything else from it.

---

## Kernel

### `Kernel.js`

Files register boot steps at load with `on_boot(file, fn)` and the Bootstrapper calls `kernel_boot()` once, after the role files. Steps run in Bootstrapper list order, not the order scripts happened to arrive in, so the parallel batch can no longer race itself: every file's declarations exist before any step runs. A throwing step is caught, logged with its file and recorded (`errlog_record("boot", …)`), and the other steps still run; the role entry point's failure is logged as fatal. `al_boot()` reports what ran, skipped and failed.

`Kernel/` loads as its own stage, awaited before the first stage. Until 2026-10-15 the kernel files shared the first stage with Global Config, Widget Helpers and Game Log, and that stage is a `Promise.all`: its files run in arrival order. Widget Helpers and Game Log call `on_boot()` at load, so whichever arrived before `Kernel.js` threw `on_boot is not defined` and silently lost its boot step (no toolbar buttons, or no log hook). It never happened live because `Kernel.js` is small and requested first. Lint now checks stage order and the harness boots every role a second time with each stage reversed; either would have caught it.

Error Log is first in the parallel list so its step runs first. Its step loads the saved session; a step that recorded something before it would have had its record overwritten by that load.

The four role entry points are boot steps too, so `run_character()` starts after every shared step, as it used to start after every shared script.

### `Scheduler.js`

`every(name, { ms, kind, fixed }, fn)` is the only interval. Phase 1 converted only `setInterval` loops, all with `fixed: true` (plain `setInterval` timing), so nothing ticks differently. Callbacks that swallowed their own errors still do; the rest now reach `catcher(e, name)` instead of the window error handler. `kind` (`automation`, `combat`, `safety`, `telemetry`, `ui`) only labels a loop for now. The self-rescheduling `setTimeout` loops (`action_loop`, `skill_loop`, `potion_loop`, `main_tick`, …) and the `while (true)` loops are untouched, because moving them changes timing (step 1.2b, measured).

### `Events.js`

`parent.socket` and the game window outlive the code iframe, and the iframe can die without `pagehide` (the 2026-10-01 freeze removed it on a disconnect). So every socket handler is kept under a fixed slot on `parent.socket`, and the previous one is removed before the new one goes on. The slots keep the names the hand-written handlers used (`_equip_reply_counter`, `_damage_sampler`, …), so the first kernel boot after a pre-kernel iframe still removes that iframe's handlers. DOM listeners and `wrap_parent` work the same way on their targets. Each handler runs inside `catcher`, so one throwing handler no longer stops the rest for that event. The first live boot surfaced one that had always thrown: Ulric's rime band logger looked up `G.monsters` for every `hit`, players included, and a player has no `mtype`. Before the kernel the exception escaped into the game window's socket code, unrecorded, and skipped every `hit` handler subscribed after it.

Two fixes came with it. Game Log's `add_log` hook used to check an "already hooked" flag kept on the game window. After an iframe died without `pagehide` the flag stayed set, and the next iframe never hooked the log at all. `wrap_parent` now re-hooks on every boot from the true original. And Widget Helpers' `window.top` drag listeners no longer accumulate one pair per iframe.

### `Storage.js`

Every localStorage access goes through `storage_read`/`storage_write` (JSON) or `storage_raw_read`/`storage_raw_write`/`storage_remove`/`storage_keys` (strings), each wrapped as before so a browser blocking site data degrades instead of throwing. `STORAGE_KEYS` registers every key prefix with its owner. Dungeon Runner reads its override lazily on first use, so no caller can see it before it is read.

---

## Encounters

### `Encounter Registry.js`

An encounter is everything one monster, spawn or boss changes about how the party plays, in one file. The file registers a spec with `encounter(name, spec)` at load and does nothing else; shared and role code ask questions at the decision they affect, and keep the role's default at the call site (`encounter_setting("curse", true)`), so an encounter holds only deviations.

There are two kinds of answer:

- **Context answers** (`gear`, `settings`) come from the encounters live right now. Encounter gear sits inside `gear_override()`, below the rime hold (not an encounter yet) and above the remaining `MONSTER_GEAR_OVERRIDES`. Inside an active dungeon its settings come first: every resolver asks the dungeon (`dungeon_setting()`, `dungeon_loadout()`) before `gear_override()`, and a dungeon flag that vetoes an action is checked beside `encounter_allows()`, so either can veto. A `spawn` encounter is live when `home` is one of its `homes` and the character is on the destination map, which is the rule `gear_override()` used. A `hazard` or `situation` encounter is live while its own `active(ctx)` says so. The highest tier answers (situation, then hazard, then spawn); an answer of `null` passes to the next. Two live encounters of the same tier answering the same question is a configuration error, counted once in the flight recorder and settled by encounter name.
- **Mob answers** (`allows`, `rank`, `traits`) apply to the encounter's `mtypes` wherever the mob is met, live or not, so a porcupine is protected at any spawn. Any veto wins; ranks add. An encounter with only mob answers needs no tier and is never live.

`traits` are the positive facts `allows` cannot say: `encounter_trait("tank", mob)` (Myras tanks it), `taunt`, `cleave_alone` (one in reach is enough to cleave), `hold_cleave`, `attack_if_targeted`, `agitate_pack`. `encounter_mtypes("tank")` lists every monster type with a trait, for code that searches by type.

The actions `allows` can veto: `attack` (target it), `cleave` and `agitate` (fire the skill while it is within reach, through `blocker_within()`), and `pull` (count it as a reason for Ulric to agitate).

`ctx` (`encounter_context()`) is rebuilt at most once per `CACHE_TTL`: the character, the visible monsters within 600 (`ctx.mobs.of(type)`), `home` and `destination`. Rebuilding it is also when activity changes, so `enter`/`leave` hooks and the `encounter_enter`/`encounter_leave` bus topics fire then.

Each answer records which encounter gave it: `why("gear.weapon")` in the console. `encounter_problems()` checks every spec (known keys, tiers and roles, `active` where needed, `mtypes` for mob answers, gear set names in the role's `equipment_sets`), and the harness `load` command fails on any problem.

Encounter files are optional scripts: a missing file means its answers are absent and nothing else.

### `Monster Rules.js`

Monster types with a rule or two and no spawn of their own, kept in one file because each is a few lines with no state. A monster that grows gear, settings or hooks moves to its own file.

- **pppompom:** Ulric doesn't cleave with one in reach and doesn't count them as a reason to agitate.
- **redfairy:** Ulric doesn't agitate with one in reach. The mforest fairies hit for 2,400–4,000 magical at frequency 100 with unlimited range, so a pulled one never stops hitting.
- **nerfedmummy:** Riva never shoots one.

- **franky, icegolem:** Ulric holds his cleave while one is within reach (`hold_cleave`, read by `boss_blocks_cleave()`). Unlike `cleave: false` it doesn't steer his position away from it: he fights these bosses in melee.

- **plantoid, mole:** Riva spends no skills on one (`skills: false`). The recorded reason is for moles: they die to AoE before mark and supershot pay for themselves, and the 640 MP is mana her scare needs. None was recorded for plantoids (or for the dryad and fireroamer entries that came from the same list).
- **jr, greenjr, bigbird:** always a reason for Ulric to agitate (`pull: true`), on any map, beside the monsters of `home`.

Phoenix was in Riva's `always_attack` list, at boss priority. It was taken out on 2026-10-15, as the party no longer meets them.

### `Uhills.js`

The sparkbot and targetron clump (`homes` holds both). Sparkbots also keep the `pull` trait, so Ulric agitates them wherever he meets them. Until 2026-10-15 this was Myras's two duplicated gear entries, `no_curse_homes`, `FARM_FOCUS_HOMES` and a literal in Ulric's agitate list.

**Her gear.** The encounter puts her in `luck_exoarm`: lmace+8 with the exoarm+1 instead of the mshield+8. The arm trades the shield's 16 luck for +9 int, +30 str and +46 armour as measured (max HP 13,594 → 14,224, armour 447 → 493), because holding all eight sparkbots and targetrons is ~5,200 DPS on her. Everywhere else `luck` keeps the mshield.

It also wears `uhills_orb` (stillwaterlens+1), `uhills_gloves` (xgloves+6), `uhills_chest` (xarmor+5) and `uhills_amulet` (t2intamulet+1), chosen on 10-12 from the bank by effective HP against the spawn's even physical/magical damage and by how much raw monster DPS her single heals out-heal. Modelled together: armour 493 → 632, resistance 497 → 641, INT 385 → 403, EHP +19%, out-healing +29% (about 6.5 → 8.5 of the spawn's monsters, each ~1,176 raw DPS), so with all eight on her the single heals nearly cover what party heal had to. They give up the talkingskull's XP, spookyamulet's and cdragon's luck, and 3% attack speed from the supermittens. The `amulet` rule, like `chest`, only follows an override, so both keep the uhills pieces after she leaves until another set replaces them.

**Curse at uhills.** Measured there on 10-12 over 3 minutes, her mana was 225 MP/s out against the 244 MP/s potion limit: swings 80, curse 58, party heal 45, absorb 26, dark blessing 15. Curse and dark blessing spend whatever is above ~40% MP, and the party-heal spikes when she holds 7+ monsters (77–103 MP/s over a heavier 20 minutes) drained her below 25% about a fifth of the time. Curse was dropped there (c822cb5), brought back with the uhills survivability gear (ae01caf), and dropped again the same day (`curse: false`) because she still couldn't sustain mana with it on. Bosses are still cursed, and the farm focus still steers Riva's mark and Ulric's swings.

**Farm focus** (`farm_focus: true`, every role): the party stacks curse, mark and swings on one monster. The mechanism is in Targeting.

### `Dryad.js`

The mforest spawn: Myras wears her magic-defence loadout (`mdef`), and Riva spends no skills on a dryad.

### `Fireroamer.js`

The desertland fireroamer spawn: Myras wears `fireres` and `orb_fire`, and skips her panic check (`skip_panic`; low HP and MP still trigger it). Ulric agitates only while Myras is above 60% HP and 80% MP, Riva and he are above 95% HP, and no more than six monsters are in range (`agitate_conditions`). Riva spends no skills on a fireroamer.

These used to apply whenever `home` was fireroamer. As settings of a spawn encounter they hold only on the spawn's map, so away from it, at a boss or in town, Myras's panic check runs again (one golden re-recorded, `synthetic-fireroamer-away-Myras`).

### `Mummy.js`

The spookytown spawn. It moved out of four role files on 2026-10-15: Myras's orb entry in `MONSTER_GEAR_OVERRIDES`, `no_curse_homes`, `zap_pull_homes`, Ulric's `agitate_blacklist` and Riva's `skill_blacklist`. `zap_pull` is now a setting of a live spawn encounter, so the zap pull holds only on the spawn's map.

**Zap as a pull** (`zap_pull: true`). While the encounter is live, Myras's `ring` rule wears `zap_on`, and `zap_pull_target()` zaps the nearest untargeted monster of `home` within the zapper's 420, in her attack range or not. Any damage makes a monster target its attacker, and a targeted monster moves at its `charge` speed (96 for mummies) instead of `speed` (16), so the zap saves the wait for the spawn's rage tick (every 4.2s). It also makes the mummy eligible for Riva, who only shoots what targets Ulric or Myras. Mummies are a `grow` spawn: a kill refills instantly while 6 or fewer of the 9 are alive, so throughput is live mummies ÷ spawn-to-death time. A 120s probe on 10-14 measured 1.70 kills/s, spawn→targeted 0.9s (p90 2.0s), spawn→death 3.0s, and less than one mummy of HP on the party 15% of the time. That 15% is the most the zap can recover.

**No curse** (`curse: false`, 10-14). A mummy lives ~3s from spawn to death, so the 5s curse mostly lands on monsters that die before it matters. The 2-minute probe counted 22 curses (400 MP each, ~73 MP/s of her ~250 MP/s potion income), and that mana now goes to the zap pull.

**Ulric doesn't agitate mummies** (`pull: false`). The server's agitate also takes every monster already on a party member, so there it took the whole pack off Myras for her to absorb back. A 120s probe on 10-14 counted ~9 agitates a minute (~5.7 mummies each) and ~10.5 absorbs. That is ~63 MP/s of his ~250 MP/s potion income, and every fighter there was drinking 145 of the 150 potions the cooldown allows per 5 minutes. The pull was redundant: the mummy rage box hands the whole spawn to the party every 4.2s, spawns were targeted 0.9s after appearing, and Myras's zap pull (Healer Skills → zap) now takes fresh spawns straight onto her. The mana goes to cleave instead.

**Riva spends no skills on a mummy** (`skills: false`): no hunter's mark or supershot. Mummies die to AoE before a single-target setup pays for itself, and the 640 MP a mark and supershot cycle costs is mana her scare needs (the same reason as the `skill_blacklist` spawns).

### `Halloween Bosses.js`

mrpumpkin and mrgreen share one encounter, because every rule is the same for both. While either is in sight Ulric wears `single` and `orb_dps` and Riva `single` and `dps_chest` (which also keeps her off cupid). Myras tanks them (`tank`: her fight rule and boss absorb, Healer Equipment and Skills), Ulric taunts them off other players (`taunt`, Warrior Skills) and cleaves with only the boss in reach (`cleave_alone`). Until 2026-10-15 this was `BOSS_GEAR_OVERRIDES` in two Equipment files plus `tank_bosses`, `taunt_bosses` and `cleave_lone_bosses`.

### `Crabxx.js`

The kited boss (its event line is commented out, so the party ignores it today) and the crabx it spawns. While crabxx is in sight Ulric wears `double_aoe` and Riva `boom`, and Myras tanks it. Riva shoots a crabx only once it is on someone (`attack_if_targeted`) and ranks those after bosses, and Ulric agitates when exactly five untargeted crabx are in reach (`agitate_pack: 5`). The kite itself stays generic: any `EVENT_LOCATIONS` entry with `kite` is kited (Movement Positioning, Combat Utilities).

### `Porcupine.js`

Porcupines reflect damage. Ulric never targets one, his cleave and agitate refuse to fire with one within reach (`blocker_within()`, the same check as the other blockers), and he wears his single set while one is within his range + 40 (splash reach). Riva ranks them above everything else, bosses included, and shoots them whenever they are safe to touch, so they die before Ulric has to work around them. This was `Porcupine Guard.js`, a temporary file whose four call sites were `typeof`-guarded so deleting it removed the behaviour; as an encounter it is still removed by deleting its Bootstrapper line, with no guards.

---

## Core Systems

### `Global Config.js`

Awaited first, together with `Widget Helpers.js` and `Game Log.js`, so everything may assume it. It holds:

- core config and constants, party constants (including `DUNGEON_PARTY`), and the shared fighter config defaults
- `farm_target_for()`
- the `storage_read()`/`storage_write()` pair that every JSON-backed localStorage value goes through
- the no-op `errlog_*` stubs, plus stubs for the one-role-only `request_delivery`, `model_prediction`, `get_character_state` and `upgrade_slot_for`
- the `var` declarations of every cross-character symbol (`home`, `destination`, `CONFIG`, `cache`, `ITEMS_TO_KEEP`, `MONSTER_GEAR_OVERRIDES`, `RIME_HOLD_GEAR`, `EQUIPMENT_RULES`, `PANIC_BROADCAST_TARGETS`, the panic flags), so no reader needs a `typeof` guard

### `Movement Manager.js` — movement

The two movement owners are `movement_goal()` (where to go: the one priority list) and `movement_local()` (where to stand). The machinery they drive is `smarter_move()`, the travel arbiter (`travel_arbiter()`), `move_to_character()` and the stuck escape.

**Escalating to the town edge.** The arbiter counts a goal's failures (no path, timeout, stall, a search over 60s). On the second failure, with nothing targeting us, it re-issues the journey with the pathfinder's town edge on. That is `smart.use_town`, set only for that journey and cleared when it ends; the BFS reads it at every node.

**Drift.** The drift that re-issues a journey scales with the distance left (30%, never under 80px) and ignores a cross-map target's coordinates. Re-searching every 3s for a leader moving 1500px away kept followers standing in searches.

**Parked routes.** A hold or a local goal parks a route that was already found (`travel_park()`: the current leg's end plus the remaining plot) and stops the character. When the same goal (same label and coordinates) comes back, the route is re-armed through `smarter_move`'s `plot` option (`travel_parked_plot()`, counted as `travel resumed parked route`) instead of being searched again. Every cohesion hold used to cost a full search on resume. While the window is visible, the game's pathfinder works 40ms in every 80ms, and the character stands still with the "Hmm…" bubble the whole time. A parked route whose first node is a door is re-armed only beside that door (`is_door_close()`), and a route that starts with a town node is never re-armed.

**Released journeys.** A journey the arbiter released itself is re-issued at once, not after the 3s floor.

**Passive goals keep a search alive.** A search is not parkable, so a local goal that releases it throws the work away. A `passive` local goal (`boss-loot`, `await-town`) leaves an unfinished search of ours running instead; once found, the next tick parks it as usual. `boss-loot` coming and going with the chest count threw a 20s cross-map search home away four times in a row on 10-11 10:55. `movement_local()` stays silent for a passive goal while the search runs, and the runner still loots under it.

**Journey cap.** `TRAVEL_JOURNEY_TIMEOUT_MS` is 300s. At 90s the walk home from halloween timed out twice on 10-11 with the followers in formation the whole way, and each timeout counted as a failure toward the town escalation.

**Native search failure.** A native search failure reaches `smarter_move` through `smart.on_done` and settles the journey as `no path` on the spot. It is told apart from the native `smart_move` re-entering (its own "Lost the path" recovery, or `stop()`) by state, not reason: `bfs()` clears `smart.moving` before calling `on_done`, the re-entry calls it while `smart.moving` is still set, and after one recovery the native closure drops the reason altogether — reading the reason produced the spurious `"home" failed (no path)` of 10-11 10:29. Settling on failure is the way out of walled pockets like the ice golem landing. The stuck escape behind it skips only real instances and the cave.

**Route resplice.** `route_resplice()` runs ahead of the game's `smart_move_logic` (wrapped by name; the game's 80ms interval calls it by global lookup). When the next node is out of line of sight it continues from the first later node in sight, up to 12 ahead, so the game's "Lost the path" (a full re-search) is the fallback rather than the rule. 10 of the 13 lost paths on 10-11 were one two-minute chain on winter_cove, a search every 5–10s.

**`walk()`.** Every local step goes through `walk()`, which is `move()` behind the game's `can_walk()`. A bare `move()` within 8s of a door transport, or while disabled, rejects with `unable`. The follow steps fired through a door crossing were the `unhandled_rejection` lines of 10-10.

Why the native town edge is not used is in [`Game API Reference.md`](Game%20API%20Reference.md).

### `Movement Manager.js` — town shortcut

`town_shortcut_check()` runs every main tick. It uses town for speed and never touches `smart.use_town`.

**Who plans it.** Only the movement leader plans it, or a fighter with no leader. It applies on any travel goal, `disengage` ones included: event walks are all `disengage`, and not attacking is what keeps a channel alive. It needs nothing targeting the party, and never runs inside instances or in dungeon mode. It fires when walking on from `spawns[0]` to a point on the route saves 3s beyond the channel.

**Walk distances.** The walk from the spawn is read from a per-map field of walking distances (`walk_from_spawn()`). It is a flood fill from `spawns[0]` over a 20px grid with the game's own `can_move()`, built once per map on first use in ~250ms, within 1–8% of the game's routes, and always long. It replaced a straight-line test that found no join at all on desertland, where the spawn's way to the transporter bends four times. The camp → transporter walk is 2,627px (58s at speed 45) against 13s by town, and the bot never took it.

**Landing.** On landing, a route point in a straight line is spliced in; otherwise the search restarts from the landing (`smart.found = false`). The route is spliced onto the best point reachable from the landing.

**Walking while channelling.** The channel is cast while the walk continues, so an interruption (heals, swaps and hits all cancel it server-side) just leaves her walking. It re-evaluates each second. Myras's heals and party heal run while disengaged by choice, and her orb swaps to the jacko as the trip starts, so her first channel is often interrupted.

**Follower copies (`mode: "copy"`).** Followers copy a channel they see on the leader (`get_player(MOVEMENT_LEADER).c.town`) and cancel theirs if she stops hers short.
- Her position is recorded the moment the copy is cast. That way a channel of hers that a heal cuts short before the follower's own has started is still caught. Recording it only once his channel was up let Ulric and Riva teleport out of the bscorpion camp without her (10-07 09:18).
- Her channel vanishing is read with a 1s grace (`TOWN_LEAD_GONE_GRACE_MS`). Her own re-cast after a heal interrupts her comes up to 1s later, and a 400ms grace still cancelled the copies at 19:29:50 on 10-10.
- It counts as landed when she stands within 30px of `spawns[0]`, or when her channel had been up 2.5s (`TOWN_LEAD_SEEN_LANDED_MS`). In a follower's view her entity's `c.town` clears before her position jumps: 195 of 384 follower cancels over 10-05..10-10 came in the second she landed, and each one turned into a `join` cast and a cohesion hold.

**Joining her at the spawn (`mode: "join"`).** A follower more than cohesion range from her while she is within 150px of `spawns[0]` teleports too (`leader_waiting_at_spawn()`). It is never cancelled and is retried every second until it lands. Every town on a map lands on the same spot, so one missed copy (Ulric, targeted or interrupted by his own swaps) no longer leaves the party split across the map with each half waiting for the other.

**Recognising a landing.** `town_landed()` runs every main tick while a channel is open, and on `character.on("new_map")`. It recognises the landing by position (the character within 30px of `spawns[0]`), never by `c.town`. On her own client `c.town` clears a tick *before* the position jumps, so the channel used to be dropped as "interrupted" before `new_map` fired. That happened in 63 of Myras's 210 landings over 10-05..10-10, and on 10-10 19:30 the stale plot made her and Riva cast a second, pointless channel from halloween's spawn. A vanished channel is therefore kept for 1s (`TOWN_LANDING_GRACE_MS`) before it counts as interrupted.

**Her own channel through a hold.** Her own channel survives a cohesion hold and a goal change shorter than 500ms (`TOWN_OWN_CHANGE_GRACE_MS`). At 20:40:22 on 10-10 a hold for Riva, still a map behind, cancelled her channel at 3.0s. By then Ulric's copy had passed the 2.5s "landed" mark, so he teleported alone, walked 1,450px back to her, and all three teleported again.

**Guards against useless casts.**
- Nothing is cast within 150px of the spawn (`town_shortcut_eligible()`, which also stops a `join` from the spawn itself).
- The planner refuses a plot whose first node is not reachable from here.
- A follower already at the spawn while she is channelling (seen live, or `town` in her state cache when she is out of view) waits for her (`await-town` in `follow_goal()`) instead of walking off.

### `Bscorpion Camp.js`

Positioning for the desertland bscorpion/primling camp. It owns no movement loop of its own: `movement_goal()` returns `{ local: "camp" }` while camped and `movement_local()` runs `camp_step()`. Myras orbits; Ulric and Riva hold station. The orbit itself is `orbit_away()` in `Movement Positioning.js` (a 105px ring around the camp centre, 10° steps toward whichever neighbour is further from the scorpion), shared with the crabxx kite.

**Riva's rail (`CAMP_RAIL`).** A wall-free line from (-390,-1250) running north-west (215°) for 360px through the open ground. A solid wall runs ~140px north of the camp centre, and pillars and walls sit to the south-west, so any position computed relative to the moving scorpion eventually landed behind one of them.
- She stands at the rail point nearest the camp that is ≥130px (hitbox to hitbox) from the scorpion, clear of its `weakness_aura`. The aura is −10 dex/str and −30 speed for 20s, re-applied every 4s within 100px, with the first tick 0–4s after spawn. At her old 50px it cost her ~3.4%.
- Between spawns she waits 150px along the rail, where all of the spawn box is within her 222 range.
- Simulated over the spawn box and Myras's orbit, every fight position has such a point within range (worst 145), at most 345px along. No single north-west spot can cover the box: its far corner is ~234px edge to edge from its own north-west corner.
- Her hold radius is the rail's far end plus the margin, so retreating never turns the goal into travel.

**Temporal surge.** `camp_temporal_surge()` casts temporal surge the moment the scorpion dies. The server cuts every pending respawn within 160px (hitbox to hitbox) of the caster to `remaining × 0.85 − 1000ms`, so the 6.45s respawn becomes ~4.5s. The orb goes in, the cast goes out and the orb goes back via the caster's own `orb` rule, in one burst like scare. Myras casts first. Riva (`SURGE_PRIORITY`) waits 800ms and casts only if Myras's `surge_at` in the state cache shows she didn't. With two 60s cooldowns against a ~38s loop, every death is surged. Ulric is not a caster: cleave keeps his 1,890 MP near empty.

**Combat pause.** At the camp `should_pause_combat_loop()` never pauses a follower for being beyond cohesion range of the leader. That formation rule stopped Riva shooting whenever Myras's orbit took her to the far side. The general rule reads `cohesion_range()` (250); it was a fixed 200 while `follow_goal()` let a follower stand up to 250 away, a band where he neither moved nor fought.

**Scoping.** Camp-only behaviour keys on `is_at_bscorpion_farm()` (which includes the `home` check), never on `home` alone, so none of it follows the party to a boss. `party_camped()` is the only carve-out from cohesion: following and Myras's cohesion hold are off only while no event is up and Myras is at the camp, so boss trips and the walk back keep the party together.

**Ulric's cleave.** Ulric cleaves the lone scorpion (a one-mob minimum at the camp). Each cleave is half a swing of bataxe damage and its own sugar rush roll, mana-bound by `can_cleave()`. It stands down while sugar rush is up, where the bataxe swap's penalty costs more than a 274ms swing.

**Measurement.** Every kill interval goes to the timeline as `bscorpion_kill`, so a change can be measured against the last session instead of remembered.

### `Combat Utilities.js`

Monster and entity queries (`monsters_matching()`, `get_num_targets()`, `get_num_chests()`), boss and party state predicates (`is_coop_boss()`, the Rime Djinn's shell predicates `rime_shell_casting()`, `rime_shell_pending_within()` and `rime_shell_held()`, plus `find_active_boss()`, `boss_engageable()`, `should_pause_combat_loop()`), and the lethal-monster rule.

**Lethal monsters.** A monster with no target turns on whoever touches it first, with a hit or a splash. So `must_not_touch()`/`safe_to_touch()` keep every fighter's targeting, splash, cleave, agitate, stomp and Myras's absorb off any untargeted monster whose hit (`monster_hit_on()`) is half their max HP or more, or whose hits in one second (hit × `frequency`) reach their whole max HP. `lethal_pursuer()` drives the `evade` movement goal when one targets them anyway, at any distance: scare, then keep stepping directly away until it lets go (scare, or the server's ~608px chase leash). A fighter walking back to Myras with it in tow drags it across the map.

**The one-second clause is for the mforest fairies.** green/red/bluefairy hit for 2,400–4,000 magical, under half anyone's HP, but at `frequency: 100` with unlimited range and `aggro: 0`. Until 10-11 the per-hit rule called them touchable, so nothing blocked on them. At 19:46 that day, on the survey's first odino visit, Ulric's agitate (420 MP, 320px) went off at (-205,576) on the way to the pen, about 190px from the greenfairy's box. Ulric (16,954 HP) and Riva both went from full to dead within one 1s state sample, with nothing else targeting them. The redfairy's box (313..393, 590..848) is ~180px from the odino pen, inside agitate, multishot and stomp range. Nothing can answer a monster that kills from full inside a second, so for that kind of monster the measure is DPS against max HP, not one hit against half. A plain "one second of hits ≥ half HP" rule would also have barred first touches on crypt monsters the party fights on purpose (a6, a8, d_wiz); the whole-HP line catches only the fairies (rudolph's 16k raw/s lands under max HP after resistance). Monster entities carry `frequency` (copied from `G.monsters` by the client).

**Kited bosses are the exception.** An `EVENT_LOCATIONS` entry with `kite` (crabxx) is never an evade threat: whoever it targets kites it on the ring instead of scaring it off. Untargeted, only `BOSS_KITER` (Myras) may touch it, whatever its hit, so the first hit always lands it on the kiter; once it holds a target anyone may hit it. `takes_one_damage()` reads the server's `1hp` flag (crabxx while any crabx lives anywhere on the server: every hit does 1, 2 on a crit).

**`avoid` and `off_limits()`.** An `EVENT_LOCATIONS` entry with `avoid` (franky: `["oneeye"]`) widens that rule while its boss is live on our map. The `avoid` types are untouchable outright, targeted or not, and until a fighter is within 50px of the entry's `spot`, every monster but the boss is untouchable too. That one predicate covers targeting, Riva's multishot, splash and the agitate/stomp/cleave blockers. So the party fights only Franky on the way in and, from the spot, anything that is not a oneeye.

**Boss leash (`boss_strayed()`).** Boss pursuit is leashed to the boss's spawn `boundary` from `G.maps[map].monsters`. It trips at +200px outside and is latched per boss until the boss is back within +150px; mrpumpkin's usual fight spot is 136px outside its boundary, so a tighter return margin would never resume. A boss outside its boundary with a target is chasing someone, and following it only drags the fight into town.
- Spawns flagged `roam` (icegolem) have no leash.
- Neither does an `EVENT_LOCATIONS` entry with `leash: false`. Franky's spawn entry in `G` is a copy of the oneeye pen, so the event's real spot (~0,32) read as strayed and sent Myras home and back through `join` in a loop.
- mrpumpkin, mrgreen and franky are `leash: false`. Other parties kite them a few hundred px and fight them there. At 20:34 on 10-06 mrpumpkin was fought for minutes at (152,816), 350px from its spawn, while ours stood at its spawn point with combat targeting a boss movement would not approach (`Monster out of range` spam).
- A `join` boss that does stray falls back to the centre of its spawn area on its map, never `null`. A boss walking home with no target is still pursued.
- Only crabxx (16,000 attack) crosses that line today. Without the leash, boss pursuit (`8e809d3`) fed it to Riva 32 times in one spawn.

### `Combat Formulas.js`

The server's damage and heal arithmetic. It computes values and acts on nothing:

- `defense_reduction()`, `heal_delivered()`/`heal_useful()`/`partyheal_base()`, `burn_multiplier_at_dps()`, `splash_bonus()`, `time_to_kill_ms()`, `crit_multiplier()`
- `skill_mp_cost()`: the server's `mp × (100 − mp_reduction)/100`. Never read `G.skills.X.mp` raw.
- `incoming_dps()`/`projected_hp()`/`endangered()`: the game client's own estimate of what the monsters on someone deal

### `Combat Sampling.js`

Hit and heal telemetry, self-starting at load: the `hit`/`action` socket samplers and the damage/heal windows they feed.

It also keeps the party's in-flight damage ledger. Every fighter's `action` is recorded by `pid` (after the target's armour, or resistance for Myras, × 0.9) until its `hit` lands or its `eta` passes. `remaining_hp(mob)` is what targeting, `would_kill()` and Riva's skills read instead of `mob.hp`.

### `Boss Profiler.js`

A per-fight profile of every player on a cooperative boss (`is_coop_boss()`) in sight, ours and strangers. It reads the `action`/`hit` sockets and a 1s sample of each player entity.

**What is measured.** The server sends strangers `attack`, `frequency`, `range`, `speed`, `armor`, `resistance`, `level`, `s`, `slots` (full items) and `pdps`, but never crit, piercing or explosion, so those are measured from hits. The profile covers actions by type, damage by source (burn/splash/skill), crit rate and multiplier, burn procs, sugar rush, damage taken from the boss, buff and weapon time-share, distance and gear. Each fight also records the boss's own condition uptime (`boss_conditions`: marked, cursed, burned …) and each player's share of samples under 20% MP (`mp_low_pct`).

**Coop points are not damage.** The server also gives `0.25 ×` the boss's raw hit on a player (tank points) and `1.8 ×` net heals on coop fighters, with `× 5` on the character's home server and `÷ 4` with `hopsickness`. So `coop_per_explained` (coop gain over boss damage + tank points) shows which of these is moving a player's score.

**Output.** One `boss_profile` sample per fight per observer when the boss dies or has been out of sight 15s, plus a `📊` boss-dps line in the game log. The sink appends every one to `boss_profiles.jsonl`, since samples in `errors.json` age out in 2h. `al_boss_profiles("makiz")` reads the last 10 in the console.

### `Targeting.js`

`score_targets()`/`select_target()`: the one scorer every character picks targets with. Damage is valued with `context.gear` (attack, frequency, explosion, apiercing, burn chance) when the caller passes one, otherwise with the live gear. Ulric passes his swing set's measured profile (`swing_gear()`). The live cache refreshes every 50ms and often caught him mid-swap in candy canes or the bataxe, scoring every target without splash or burn.

**Farm focus.** At a clumped spawn (the uhills encounter's `farm_focus` setting) the party stacks its damage amplifiers on one monster: Myras curses it (+20% damage taken), Riva marks it (hunter's mark; her supershot follows the same target) and Ulric swings at it, while splash spreads the rest across the clump. Myras chooses (`choose_farm_focus()` in her `update_cache()`): the current focus while it lives, is in curse range and is on a party member, else the highest-HP monster on a party member, so the debuffs go where they have the longest to pay. It is held until it dies, because "highest HP" re-evaluated each tick would jump to the next full-HP monster the moment the first is hit. One character decides and writes the id to localStorage (`AL_farm_focus`, only on change) so the three never latch different monsters; the others read it with `farm_focus()`. Riva's attacks and multishots are untouched, only her mark. Unlike `dungeon_focus_target()`, which also redirects Riva's shots, this never narrows anyone's attacks to one target. Her curse only goes on the focus while there is one, which also covers both monster types: the generic curse only considered monsters of the farm target's own type.

### `World Events.js`

Live boss and seasonal targets, and the goal that walks the party to them.

**When the boss strays.** Pursuit stops when the boss strays from its spawn area (`boss_strayed()`), and the event goal falls back to the walk to its spawn point. That is a non-pursuit `disengage` goal, so the party waits there together under cohesion. It used to return `null`, which sent Myras `home` mid-fight while the followers pursued the boss on its return.

**Pursuit.** Pursuit bypasses following and cohesion: each fighter closes to its own range. For an entry with a `spot` (franky: -19,36), every fighter first walks to within 50px of the spot while the boss is within 100px of it, then fights from there; Ulric's `engage_step` takes over inside that radius. The spot keeps the party together and away from the oneeye pen. `party_cohesion_hold(event)` does not hold for a follower whose goal is the same event.

**Kiting (crabxx).** Disabled on 10-11: its `EVENT_LOCATIONS` line is commented out, so the party ignores the event, and with no entry nothing is kited. The kite machinery stays for any entry with `kite`. When enabled, crabxx has no engage gate: the party joins at full HP. Its HP never moves while crabx live, so the old 95% gate kept the party at the bscorpion camp through every spawn from 09-30 to 10-11. The fight, from the server source:
- It hits for 16,000 every 3.3s with 45 range (~7,000 on Myras, ~7,800 on Ulric, ~9,100 = 90% on Riva). Its speed is 30 idle, but the server sets a monster's speed to its `charge` while it has a target, so it chases at 80. Curse's −20 takes that to 60, under Myras's ~70, so the kite holds only while the curse is up.
- While it has a target it spawns a crabx every 1s on a random player with coop points within 400px, in the target's party only, targeting that player. A spawned crabx (4,200 HP, 240 attack, charge 30) disappears when it loses its target: its chase limit is ~218px, crabxx's ~289px. Both drop a target not attacked for 20s.
- Whoever crabxx targets gets `{ local: "kite" }` (same label as the event, so followers don't hold back and Myras's cohesion hold never applies; `movement_goal()` returns it before cohesion). `kite_step()` runs `orbit_away()` on the entry's ring: (-1000,1700), the server's `join` landing point, radius 105 (the camp orbit's size). Clear of walls at every radius up to 240 by a geometry check.
- The ring is small so every monster stacks in its middle for AOE, and that costs Myras hits. Pure pursuit puts a chaser on an inner circle of radius R·v_chaser/v_kiter, trailing by √(R² − r²). At 105 a cursed crabxx trails ~54px centre to centre, inside its reach: its 54×39 hitbox (crabx ×1.5) plus 45 range needs ~85–100px. So it lands its ~7,000 hit (49% of her HP) whenever its 3.3s swing comes up beside her. The adds circle at ~45px from the centre, a tight stack for cleave (160) and splash. Kiting it clean needs about R ≥ 190 (220 gave ~114px), but then the adds trail ~200px behind her instead of stacking; that was the first version, and the party asked for the stack.
- Ulric (`double_aoe`) and Riva (`boom`) wear their splash sets the whole time crabxx is in sight (the crabxx encounter's gear).
- Myras curses the kited boss whenever `curse_expiring()`, ignoring her curse MP floor. `tank_can_take()` leaves the kited boss out of her absorb headroom, `boss_absorb_target()` takes it off a party member (crabxx has Myras's `tank` trait) without the lethal-hit refusal, and the generic absorb pulls adds spawned on Ulric and Riva. Ulric does not agitate with a kited boss within range: the server's agitate takes every monster on any party member, crabxx off Myras included. His stomp is fine; it only stuns.
- Ulric and Riva stay on crabxx throughout and use their AOE on the adds only while it also hits the boss. Riva's multishot keeps crabxx first while it `takes_one_damage()` (Ranger Combat → boss only), and Ulric cleaves during a boss pursuit only with the boss inside the cleave. Killing crabx is what ends the 1hp phase.
- Myras loots while kiting. Elsewhere looting replaces the movement tick; on a `kite` goal the runner starts `handle_looting()` without awaiting it and still takes the orbit step. Her gold gloves (−20 speed) are on only while `_looting`, a few hundred ms per burst. Chests open within 400px (server `open_chest`), which covers the ring.

**Draining the field.** After the boss dies Myras stays on `boss-loot` (a `passive` local goal) while `boss_field_draining()` holds: a chest in sight, or one seen within the last 3s (`BOSS_LOOT_LINGER_MS`), inside the 20s field grace. Without the linger the goal flipped to `home` and back on every chest, and each flip cancelled the search home.

**`boss_watch`.** While a boss is in sight each fighter writes a `boss_watch` timeline line every 10s (boss HP and target, positions, distance, goal, panic/evade) via `errlog_timeline()`. It goes to `errors_timeline.jsonl` without creating a record. Read those lines first after a boss fight goes wrong.

### `Equipment Manager.js`

The one file that changes what is worn: equipment sets, the single `batch_equip()` emitter, the slot arbiter, the shadow-inventory planner (`equip_plan()`/`emit_equip_ops()`) that resolves a chain of sets ahead of the server's acks, and the rules resolver.

**Slot intent.** Every swap sent is recorded per slot for 1.5s (`slot_in_flight()`/`slot_intent()`), and `is_set_equipped()` reads that intent. So the rules loop never re-sends a swap from a stale inventory view; re-sending used stale indices and flipped the orb straight back.

**Reply alignment.** `emit_equip_ops()` queues a reply deferred for every op so the server's FIFO replies stay aligned.

**The sent view.** Every planner (`equip_plan()`, `batch_equip()`) starts from the sent view (`equip_view()`): the inventory the server will hold once every equip/unequip we have sent is answered. It is counted off `game_response` replies per event (the server sends the `player` update before the reply), with a 1.5s backstop. A bare `place: "equip"` reply only counts when `failed` (the failed form of an `equip_batch`). Potions are answered under `equip` too, and counting them settled swaps that had not landed. Matching the live inventory is no landing signal, because a swap and its restore end where they started.

**Unequip lands where the server says.** `equip_batch` swaps in place, but `unequip` puts the item in the server's first empty bag slot, and party chest loot fills that same slot at any time without the client knowing yet. The server equips whatever is at the index sent, and for `slot: "offhand"` it moves a non-weapon to its own slot (`can_equip_item()`). So restoring Ulric's offhand from a guessed index after a cleave or stomp (bataxe and wbasher are two-handed) once equipped a looted int amulet and a pumpkin helmet. His real ones, in no set, were then shipped to Riff. `shadow_unequip()` now marks the item `guess`. `best_copy()` will not pick it until the unequip reply (the `player` update arrives first) shows it at that index (`settle_landing()`). Until then the restore leaves that slot to the rules loop, which takes it once the view is live again. A miss is counted as `unequip landed elsewhere`.

**Which copy.** `best_copy()` picks the bag copy for both planners: the set's exact level first, then its lock, and never a copy below the set's level (one above is equipped with a warning, the upgrade case). A set without a `level` takes the highest. It used to try level 0 first, so every sugar-rush burst put a freshly looted +0 candy cane in Ulric's hand. That copy was on `SELLABLE_ITEMS`, and the sale landed on the bag index the real weapon had just been swapped into.

**Swap penalty.** Each item equipped adds 120ms of the server's `penalty_cd`, which is added to the next skill or attack's cooldown. So a swap belongs *after* the skill it serves.

**Overrides.** `gear_override(group)` checks these in order:
1. `RIME_HOLD_GEAR`, while a held Djinn or a shell is within 400 (`rime_hold_gear_wanted()`, see Warrior Skills)
2. `encounter_gear(group)`: the live encounters, highest tier first. A boss in sight (situation), then a porcupine nearby (hazard), then the spawn of `home` (spawn)
3. the `MONSTER_GEAR_OVERRIDES` of `home`, for spawns not yet moved to encounters

Ulric's porcupine weapon used to be checked before the rime hold and boss gear. Now it comes after them; a porcupine never meets either (desertland against winter_cove and the boss maps).

Ulric and Riva wear their single-target sets (and Ulric's loaded die, Riva's coat) on mrpumpkin and mrgreen, which also keeps Riva off cupid there.

### `Equipment Valuation.js`

What each set is worth: ability procs, measured set profiles, damage maths, and the one weapon chooser (`resolve_weapon_set()`/`set_damage_value()`) every fighter uses. It returns names and numbers and equips nothing.

Set profiles pause (they are not reset) while a skill claim is held or a swap is unanswered (`equip_transient()`/`equip_pending()`), so the per-swing candy-cane swap does not starve them. They record only from the items actually in the slots (`set_worn()`), never the intended set. A profile taken from candy canes still in hand once valued `double_aoe` without its explosion, and the chooser then never wore it again to correct it. Profiles carry `schema: SET_PROFILE_SCHEMA`; one without it counts as unusable and is re-measured.

### `Party Management.js`

Panic and its broadcast (`set_panic()` is the only writer), party invites, and where home is. `scare_off()` sends the jacko swap and the scare in one burst (`equip_plan("panic")` → `emit_equip_ops()` → `use_skill("scare")`), the same pattern as cleave. It never waits for the rules loop to put the orb on first.

### `Loot Management.js`

`loose_loot()` (what we keep, ship to the merchant, or vendor), bank withdrawal, and chest looting (`should_loot()`/`handle_looting()`, driven by each character's `CONFIG.looting`). On a `kite` goal it runs alongside the orbit step instead of in place of it (World Events → kiting).

**Reserved gear.** `reserved_gear_slots()` ranks every copy of a set item, worn and bagged (locked first, then level), and keeps the top N, where N is how many slots the sets wear it in. Bag copies in that top N are never shipped or sold. It used to count a slot as covered by any worn copy of the name, so a junk copy in the hand made the real one in the bag look spare.

**Sending and selling wait out swaps.** An `equip_batch` moves the worn item into the bag index it took from, and the client sees that only when the reply arrives. `remote_sell_items()` skips the tick while a swap is in flight. `send_to_merchant()` re-checks each index just before sending it (`still_loose()`), because its list was built seconds earlier. A skipped item goes on the next pass.

`inventory_sorter()` keeps `item_order` items on their bag slots. It waits out any swap in progress and moves through `inventory_move()`, so the sent view sees every move. Sorting from a stale inventory mid-swap moved the fireblades out from under the restore and left Ulric in candy canes.

### `Maintenance.js`

Potion drinking and restocking, and the periodic tab reload. HP and MP potions (and the regen skills) share one cooldown, so `potion_loop()` drinks at most one per tick, MP first while panicking without the mana to scare.

Regen is never worth casting: it shares that cooldown, locks it for twice as long, and is what `use("hp"/"mp")` already falls back to with no potions.

### `Party Cohesion.js`

Cohesion only: `follow_goal()`, `party_cohesion_hold()`, `leader_position()`, `behind_on_xp()`. It is a service `movement_goal()` consults and decides no movement itself.

**The breadcrumb trail.** Followers keep a trail of the leader's turning points (`record_leader_trail()`). A crumb is dropped each time her move target (`going_x`/`going_y`, which every player broadcasts) changes. The trail keeps the last 60 and is wiped on a map change or a jump over 120px (a teleport). Every crumb joins the next by a straight leg she actually walked, so a follower on her trail can always see the next one. Crumbs sampled every 25px did not work, because the chord between the samples either side of a corner cuts through the wall.

**Following the trail.** When the step beside her is out of sight, `follow_goal()` returns `{ local: "trail" }` to the newest crumb (or her live position) in a straight line, so a corner costs no pathfinder search. A journey to her own position is the fallback while no crumb is in sight. It is cancelled the moment a step beside her or a crumb comes into line of sight (`approach()` and `trail_point()` no longer wait for `smart.moving` to clear). A journey that ran to completion walked the follower to where she had been, up to 80px or 30% of the distance behind her, before the next search.

`trail_point()` returns the newest visible point even when the follower already stands on it, **only if that point is her live position** (`trail_step()` then issues nothing: he is beside her). Standing on the newest visible *crumb* or her last-seen spot means the next point is out of sight, and it returns `null` so a journey is issued. Both halves matter: returning `null` beside her made `follow_goal()` read "nothing in sight" and answer with a journey, which with the far-point-only step below had each follower start and cancel a `follow` journey every 1–2s for the whole walk to a boss (685 searches in the 14h to 10-11 12:00, 26 in one minute, none at the camp); returning the crumb he stood on left Ulric and Riva standing on main at 250px from a holding Myras on 10-11 12:30, and still there a minute after she had left for desertland.

**Walking with her.** In formation the step aims at her move target (`pos.going`, her `going_x`/`going_y`) 12px short, so a follower walks her leg with her. Before, it arrived inside 15px, stopped, and re-stepped every few px: `with-leader` and `follow-close` alternated about equally in the alive samples. When the far point is out of line of sight the step falls back to her own position; the game's executor stops her for a tick between route legs, so her move target flips between the far end of a leg and her own spot, and a far-only step alternated between a step and a journey on every corner.

**Pace.** A follower on a follow goal in formation is capped to her walking speed through the game's `cruise(speed)`, a server-side cap that `cruise(500)` lifts. The cap has two states with hysteresis (`follow_pace()`): matched to her `speed` (from her entity, or the state cache out of view) once he is within 25px, free again beyond 60px. Matched speed is what stops him reaching the point 12px behind her, stopping and re-stepping. `convoy_pace()` runs once per main tick on the chosen goal: it sends only on a state change, at most once a second, and lifts the cap at once on any goal without a `pace` (pursuit, evade, farming, a hold of his own), so a kite or a fight never runs capped. The server prices `cruise` at **10 call-cost** (`CC` in `node/server.js`: `move` 1.5, `equip` 3, `unequip` 6, `send_updates` 12; the budget is 200 per 4s and a character over it is disconnected with `limitdcreport`). The first version ramped the cap linearly with the gap and re-sent it whenever the rounded value changed, up to four times a second: 40 call-cost per second on top of Ulric's 115–150 baseline from the swap trick, and he was booted on nearly every walk home from a boss on 10-14 (ten times in a day; Riva and Myras, with more headroom, less often). It only ever happened while travelling because the cap is only ever sent while following in formation.

**Reading the 🧭 lines.** They are throttled to one per 1.5s per character and only on a label change, and a re-issued journey of the same label logs nothing, so a goal that flips and returns inside 1.5s shows only as two lines of the same label. Read the game's "Searching for a path" lines beside them.

**Across maps.** When she is on another map the trail still runs to her last seen position (`_trail.seen`, at the door she used), and the follower then takes the same way through: `leader_passage()` finds the door beside that spot that leads to her map (or the transporter within 75px of it, with the place that serves her map), and once he is beside it (`is_door_close()` and `can_use_door()`) the goal is `{ local: "passage" }` and `passage_step()` emits the same `transport` the game's executor would, retried each second. Until then he steps to the door's own landing point (`passage_point()`: `spawns[door[6]]`, or the transporter's position), because her last visible spot is the very edge of the game's 40px door reach — she transports the instant she is inside it — and a follower stopped within 15px of that spot can be 55px from the landing point, where `can_use_door()` refuses. On 10-11 18:12 Riva stood one step short of main's halloween door for 15s that way.

**An exhausted trail stays exhausted.** Once the follower is on the newest visible point and it is not her live position, the trail is marked `exhausted` and only her live position can produce a trail point until a new crumb is dropped. Without that, the journey that replaces the trail moves him 5px off the last crumb, the crumb is "visible and more than 15px away" again, the journey is cancelled for a trail step back to it, and round it goes: Riva ran 24 searches in 11s that way at the same door. A convoy has no reason to search for a map its leader just walked out of; the cross-map search is now only for a leader who went out of view before reaching a door. The trail is per map, and `trail_point()` returns nothing once the follower has changed map; on the far side she is usually in view and the trail restarts from her. Every map change writes a `map` timeline line (`map_changed()`: from, to, landing position, goal), so the gap between her crossing and each follower's is measurable.

**No `follow-heading`.** Pathing to her destination gave the follower a route of its own, a long cross-map search, and the `follow-wait` logic to stop it overtaking her, all to avoid re-searching for a moving target. The arbiter's distance-scaled drift now handles that instead.

**`keep`, not the farm step.** A follower that has reached her while she is in formation (travelling or holding) gets `{ local: "keep" }`, not the farm step. `warrior_farm_step()` walked Ulric off to every monster attacking the party mid-trip, which is why he, never Riva, was the straggler in all 23 cohesion holds over 17h.

What this replaced: every corner stopped the follower for a search and sent it on its own route to her destination, and the hand-back to a local step cancelled that journey. Those pauses and loop-backs held Myras in `cohesion` for about a third of her boss travel.

**Pursuit and the hold.** Myras does not pursue a boss while `party_cohesion_hold(event)` holds, that is while a live follower is off her map or beyond the range, unless that follower is itself on the event. The same call, with its 250/120 hysteresis, decides both the pursuit wait and the ordinary hold. A separate `leader_waits_for_party()` without hysteresis flipped her between pursuit and hold each tick as a follower hovered at 250. Any one follower on the boss also exempted her, so on 10-09 06:45 Riva walked 1,100px alone to mrpumpkin and arrived 40s late. Pursuit otherwise bypasses cohesion, and the tank pulled bosses alone with the party still maps behind.

A follower in turn does not pursue while she is live on his map, beyond the range (`cohesion_closing()`, the follower's own 250/120 hysteresis) and not herself on the event (`follower_holds_back()`). So her cohesion hold pulls him back to her instead of leaving the tank behind.

### `Farm Ledger.js`

One `ledger` record per fighter every 5 minutes, through `errlog_archive()` to `ledger.jsonl`. Plan: [`Data and Farming Plan.md`](Data%20and%20Farming%20Plan.md).

- **At the spot vs away.** Each 1s tick decides `at_farm_spot()`: alive, inside the farm target's spawn boxes on the destination map widened by 200px, enough to take in the far end of Riva's bscorpion rail (a 400px circle round the destination when the target has no spawn box), and no event goal (`event-*`, `boss-loot`, `holiday-tree`) on this character or on Myras. Gold, XP and kills land in `total` always and in `spot` only while at the spot, so a spot's rate is `spot` over `at_spot_s`, with travel and boss detours excluded.
- **Gold comes from chests, not the wallet.** The fighters send gold to Riff, so a wallet delta undercounts. Every party member gets its own `chest_opened` with its share of each chest (server `open_chest`), so `gold` is this character's share and `chest_gold` (`gold / share`, the Gold Meter's formula) is the whole chest. Party gold/hr is one character's `chest_gold`, never a sum across characters.
- **XP** is the `character.xp` delta carried across level-ups with `G.levels`. It is net, so XP lost on a death shows.
- **A window closes early when `home` changes**, and carries the `home` and `survey_spot` it started with. A window straddling a spot change would otherwise credit the old spot's minutes to the new one.
- **A window also closes on `pagehide`**, and `errlog_send_archive()` beacons everything archived since the last 30s push. Until 10-11 every reload (the periodic one, the watchdog's, a Settings save) dropped the open window and anything archived since the last push: Myras lost five windows in two hours that evening, and every finished survey spot showed 20–26 ledger minutes against its 30-minute clock. The beacon is a slim payload (`character`, `build`, `session`, `archive`); the sink's `merge()` leaves everything it doesn't carry untouched.
- Also per window: deaths, potions drunk (`potions_drunk`, counted in `potion_loop()`), the most foreign players seen in the spawn area, fighters on this map, `goldm`/`xpm`/`luckm`, and a gear signature.

**Tracker snapshot.** Once a day per fighter it emits the game's `tracker` call and archives `monsters` (kills per type), `monsters_diff` and `max` (`player.max_stats`) to `tracker.jsonl`. **Achievements run on monster score, not kills**: own score is `monsters + monsters_diff` (each kill adds its `calculate_monster_score()` − 1 to the diff), and the server takes the larger of that and the account best, `max.monsters[type][0]`. A kill scores 1.6 for each fighter with all three partied and Riff away; the formula is in the plan's Workstream 2. The server answers only while a `tracker` or `supercomputer` is in the bag (`computer` alone does not set `player.tracker`). The client renders the tracker window on every reply, so the handler closes it (`hide_modal`), but only for a reply within 10s of our own request.

### `Farm Survey.js`

The `*SURVEY*` farm target (`SURVEY_FARM_TARGET`). `farm_target_for()` resolves it to the survey's current spot, or to `DEFAULT_FARM_TARGET` once the survey is complete. Set it on all three fighters; Myras (`SURVEY_OWNER`) is the only writer of the state, in localStorage `AL_survey`, which every iframe shares.

**Runtime spot changes, not reloads.** Every reader of `home` and `destination` looks them up when it runs (movement, the encounters, `MONSTER_GEAR_OVERRIDES`, the bscorpion branches), so `switch_home()` reassigns both and the next tick follows. The one cache is `active_dungeon()`, and no survey spot is a dungeon. The bscorpion kill logger now starts for Ulric whatever the home, since it parks itself away from the camp.

**Visit rules**, all in `survey_owner_tick()` on Myras's 1s tick:

- Arrival is her first `at_farm_spot()` tick. Travel time that isn't an event detour counts toward `SURVEY_TRAVEL_LIMIT_MS` (20 min); past it the spot is `unreachable`.
- For the first 5s at the spot, any non-party player inside the spawn box itself (no margin) ends the visit: `skipped` on the first pass, `occupied` on the retry. Skipped spots are retried after every pending spot. The 200px margin that decides *being at* the spot was used for this too until 10-11 19:50, and skipped sparkbot, targetron and xscorpion on players merely nearby: xscorpion's widened box reaches Mr. Pumpkin's spawn, where players wait for the event.
- The clock is her at-spot time; 60 minutes makes the spot `done` (30 until 10-11). A `done` spot short of `SURVEY_SPOT_MS` is reopened as pending with its clock kept (`survey_extend()`), so raising the target extends finished spots instead of restarting them. The reopened visit starts fresh (travel, occupancy, the two-death rule), and the report sums the ledger windows of every visit since the spot's last retry.
- `unsafe` at 2 fighter deaths at the spot in one visit: a rip transition (hers, or one seen in the state cache) where the body lies inside the farm area, outside event detours. A death on the way there or on a boss detour does not count. Deaths are the only measure; a "lost hold" rule (a monster on Ulric or Riva for 15s) was dropped on 10-11.
- Each status change is archived as a `survey_spot` record to `survey.jsonl`.

**Editing the spot list mid-survey.** The saved state carries its own spot list, so Myras reconciles it against `SURVEY_SPOTS` on every tick (`survey_reconcile()`): removed spots go (if the party is on one, it moves on to the next pending spot), new ones join as pending, finished results are kept, and a completed survey reopens when a spot is added. The reconciled state is saved at once: the tick returns early while the party's `home` still names the old spot, and without that write it re-reconciled every second without moving on.

`survey_status()` prints the state; `survey_retry("odino")` puts a finished spot back to pending with its clock at zero (it is visited when the current spot finishes); `survey_move_on()` leaves the current spot pending with its clock kept and heads to the next pending spot (the list order decides when it comes back: on 10-11 pppompom was moved to the end and left at 11 minutes for odino); `survey_reset()` starts again from the first spot. Retry and reset archive a `survey_spot` record (`retry`, or `reset` with no spot), and the report counts a spot's ledger windows only from its latest retry and everything only from the latest reset. Until 10-11 a retried spot's rates summed every window ever tagged with it: odino's rerun carried the failed 19:46 visit's 2 deaths. The survey report and the status page take the spot list and statuses from the live `survey_state` sample, so a spot dropped from `SURVEY_SPOTS` disappears and a retried spot shows pending, not its old result; spots with under a minute at the spot are left out of the by-spot table. sparkbot and targetron share one uhills spawn area (the boxes overlap), so the survey has one spot for both, `sparkbot`, since 10-12.

### `Danger Log.js`

Every death and close call, per fighter, through `errlog_archive("danger")` to `danger.jsonl`. It keeps the last 80 hits *on this character* from the `hit` socket (attacker resolved to a monster type or player name at the moment of the hit, damage, burn/crit), and a 250ms tick watches HP.

- **Close call:** HP under 30% opens an episode; the lowest point is snapshotted; recovering to 60% records it with `min_hp_pct` and `low_for_s`.
- **Death:** the rip transition records the snapshot at death, `killer` = the last hit's source, and how long HP had been under 30% (`low_for_s`, null for a death from above 30%).
- **Snapshot:** map, position, home, goal, panic, HP/MP %, damage taken in the last 10s by source (top 5) and the biggest hit, monsters targeting this character and monsters within 300px by type, debuffs, teammates' HP from the state cache, HP/MP potions left.

The event type is the `event` field, never `kind`: `errlog_archive()` merges the data over `{ kind }`, and `kind` is what the sink routes on. Until 10-11 it was `kind`, so every record went out as kind `death` or `close_call` and none reached `danger.jsonl`; three were recovered from the archive rings.

The status page lists them newest first; deaths from the timeline before the log existed (or from a character not running it) appear without detail unless a detailed death of the same character is within 15s.

### `Error Log.js`

Persistent cross-character flight recorder; hooks only, read with `al_errors(true)`. It defines the real `errlog_*` over `Global Config.js`'s stubs, so call sites never guard on it.

**`game_response` replies are records only.** The `exception`/`cant`/`not_ready` replies still count in `records`, but no longer go to the timeline, so they no longer reach `errors_timeline.jsonl`. They were 63% of its bytes (50.6 of 81 MB by 10-11), mostly Myras's.

**The archive lane.** `errlog_archive(kind, data)` keeps its own ring of 100 (`_errlog.archive`, about 8 hours of ledger windows), pushed with every payload. Records meant to be kept for good (`ledger`, `tracker`, `survey_spot`) go there instead of `samples`, where Myras's ~10 `target_choice` samples a second turn the 400-sample ring over in about 40s, close to the 30s push interval. The sink writes each kind to its own `.jsonl` once, by a per-kind high-water mark on `t`.

It records game-log lines by prefix (`ERRLOG_GAMELOG_PREFIXES`): the bot's ⚠️ ❌ 🛑 🎂 🚨 🧭 🌀 and `[` lines, and the game's own pathfinder lines ("Searching for a path", "Path found", "Path not found", "Lost the path"). So a goal flip or a search loop shows in `errors_timeline.jsonl` as it happens. Until 10-10 the 🧭 goal changes and the searches were the one thing the recorder could not see.

**Snapshots.** `errlog_snapshot(label)` records everything the deciders read, so the overhaul's offline harness (`Tests/Harness.js`) can replay a live moment: the character and every entity within 600 (nearest 40), chests, party, `next_skill`, pings, `S`, the `AL_*` storage the deciders read (set profiles, farm focus, farm targets; not the error log), `home`/`destination`/goal, the panic state, the active dungeon, the clock (`t`, `performance.now()`) and the build. It is POSTed straight to the sink's `/snapshot` route, which appends it to `snapshots.jsonl` (gitignored). It never goes through `errlog_archive()`: at tens of KB a snapshot would fill the ~5MB of localStorage the four characters share.

Two things a field copy gets wrong, both found by round-tripping a snapshot through the harness before it shipped. `parent.character` and the entities belong to the game window's realm, so their nested objects' prototype is not this iframe's `Object.prototype`. The plain-object test is therefore "a prototype whose own prototype is null", and dates are recognised by tag, not `instanceof`. And `distance()` reads width, height and position partly through PIXI getters a `for…in` copy cannot see, so each body is recorded with explicit `real_x`/`real_y`/`awidth`/`aheight` from the game's own `get_x`/`get_width`. The replay then measures the same distances the live client did.

Triggers: each ledger window closed at the farm spot (Farm Ledger), a close call opening and a death (Danger Log), a panic starting (`set_panic`, deferred one task so the serialisation never delays the panic path), and a coop boss in `ALL_BOSSES` within 400 and damaged, once on first sight and then every 60s (Danger Log). Every record through `errlog_archive()` now also carries `build`, which `Data Store.py compare` uses to judge one build against another.

A `limitdcreport` from the server (sent just before it closes the socket for call cost) is recorded as a `limitdc` record and timeline line with the per-method breakdown, the goal and the position, and flushed to localStorage at once so it survives the reload and reaches the sink with the next push.

---

## Dungeons

### `Dreams Cave.js`

`DUNGEONS.dreams`, the daily Cave of Many Dreams. Mechanics are in [`Game API Reference.md`](Game%20API%20Reference.md).

**Entry.** Myras checks `cave_info()` every 10 min and switches the mode on when the account's visit is unused and no boss is being engaged (`dreams_boss_engaged()`). Once it is on, the mode's `ignore_events` keeps `event_goal()` (boss walks and `join` teleports) from pulling anyone out until the run ends. The `party_only` flag makes Ulric kick Riff, since the cave holds 3.

**Getting there.** `dreams_goal()` is first in `movement_goal()`. The walk to Dorr is a `disengage` goal (stop attacking, jacko, scare); followers inherit it through the state cache. The wait at Dorr is a plain hold so they defend themselves. A follower inside whose leader is outside holds rather than path to her, because that path would leave through the exit door. Then `cave_enter()`, clear each floor's required objectives, take the stairs, and exit after floor 3.

**Voting.** Every fighter votes the same option from `G.events.dreams.encounters` (`DREAMS_EFFECT_RANK`, risky fights first). The exception is the six level-100 wolves, which wiped the party on floor 3 and are ranked last.

**Escorts.** An escort ("Keep the Crate Cold") only finishes when the traveler reaches the stairs down, which stay locked until it does. So after an escort vote Myras walks it to the stairs down (`dreams_escort()`), stopping whenever it is more than 200px behind and giving up after 90s idle. Walking only to unlocked stairs or the encounter marker left the escort unfinished for 11 minutes on 10-08, and for good on floor 3 on 10-07. Floor 3 has no stairs down, so an escort there ranks below leaving (`dreams_effect_rank()`).

**Revives and loot.** Nera revives in place only when nothing hostile is near the body, otherwise at the free landing, and loots chests in reach.

**Fighting inside.** A follower within cohesion range of Myras treats her fight as its own. A hostile is in the fight when it targets the party or is within 250 of the follower **or of Myras** (`dreams_in_fight()`). Measuring only from the follower left Ulric and Riva standing on `with-leader` 100–250px behind her, with the mobs she was killing 340–480px from them, for up to 18s with no actions (10-08).

The goal owns the approach to the nearest touchable hostile (`dreams_fight_goal()`):
- in range → `dreams-fight` (the farm step)
- a straight line to 0.9× range → `dreams-fight-close` (a local step)
- otherwise → `dreams-fight-path` (a travel goal through the arbiter)

Leaving the approach to the farm steps froze both side by side when a wall stood between them and the mob: `ranger_close_in()` gives up without a straight line, and Ulric's detour search often finds none.

**Per-character flags.**
- `melee_engage_radius` makes Ulric open on any hostile out to 250, idle or not, and walk into melee (`warrior_may_engage()`, `warrior_farm_step()`).
- `ranged_engage_radius` makes Riva walk to 0.9× her range of her best target when nothing is in range (`ranger_close_in()`).
- Myras (`dreams_close_in()`) stops at 0.9× her range rather than walking into the mob. She leaves an idle mob to Ulric once it is within his 250 and its hit is under half his HP (`dreams_left_to_opener()`), so the warrior opens and she absorbs. Any mob already attacking someone, or one he cannot reach or take, she still closes on, which also walks him into reach.

`cave_hostile()` is the side check `dungeon_skip_target()` uses so travelers and allies are never hit.

---

## Interface

### `Widget Helpers.js`

Loaded in the awaited first stage with `Global Config.js`, so everything else may assume it. It provides:

- `register_widget()`: the one container and render tick that the Gold/XP/CC/DPS/Boss Contribution meters each make a single call into
- `create_bottomrightcorner_widget()`, and `add_toprightcorner_button()`, which polls for the corner and replaces any button with the same id
- `CLASS_COLORS`
- the coop-point helpers `coop_contributors()`, `coop_share_weight()` and `coop_total_weight()` (the server's loot share)
- the rolling-window helpers `commas()`, `prune_before()`, `window_sum()`
- `make_draggable()` (used by `Settings Window.js` and `Stats Window.js`)

### `Game Log.js`

Loaded in the awaited first stage, so `al_log_push()` is guaranteed on the error path. It is the one log window: it wraps `parent.add_log`, adds timestamps, category filters (gold/kills/items/errors) and the Log/Filtered tabs, and resizes `#gamelog` 50% wider (leftward, over the canvas) and 25% taller. It self-starts at load. There is no `log()` any more; everything goes through `game_log()`.

### `Boss Contribution.js`

Coop boss contribution overlay, after Crowns3bc's. It shows every visible player's `s.coop.p` on the same boss as us (`s.coop.id`), with the loot share the server will award: `p^0.65 / (0.1 + Σp^0.65)`, from `issue_monster_awards()`. A share at or under 0.25% earns no drop and shows in red. Hidden while no one in sight has coop points.

### `Kill Tracker.js`

kpm/kph/kpd top buttons. The session kill rate is counted from the server's `kill_credit`, which is sent to every party member for every party kill, and to coop contributors over 0.25%.

### `Lucky Slot Tracker.js`

The 🍀 button and the search for Riff's lucky upgrade slot.

**The mechanic.** The server picks one slot 0–41 per character, for good (`player.p.item_num`). `imove` never moves it; only the cyberland mainframe's `swap a b` chat command does. On a scroll upgrade of the item in that slot, the server replaces 60% of rolls with `max(rand/10000, roll × 0.975 − 0.012)` (server `upgrade` handler). Only scroll upgrades count (`p.scroll` of type `uscroll`). Compounds never get it, and a grace offering (`upgrade(item, null, offeringp)`) rolls a fixed 0.999999, which the old tracker counted as a 99.99 in every slot it graced.

**Evidence.** Per slot it stores every roll (`n`), 00.00s and rolls over 96.3 in localStorage `AL_upgrade_slot_rolls`, shared by all four windows (only Riff upgrades). Each roll is evidence: a 00.00 is 74.9× likelier in the lucky slot, an over-96.3 0.4×, anything else 1.0153×. So the odds per slot are exact Bayes over a uniform prior.

**Focusing.** `upgrade_slot_for(slot)` returns the likeliest slot (a pass-through stub in `Global Config.js`, since this file is optional). Every upgrade goes where the evidence is, because a roll in the suspect slot moves its odds and a roll elsewhere barely does. Simulated, focusing reaches 99.9% in a median of ~1,850 rolls (p90 ~5,600), against ~10,900 (p90 ~20,000) for rolling every slot equally, with no wrong pick either way: the threshold's error rate does not depend on the sampling order. The label flips to "LUCKY SLOT FOUND" at 99.99% (`LUCKY_SLOT_CONFIDENCE`), ~40 rolls past 99.9% under focusing. The label is informational only, so a fluke leader keeps being rolled and sinks on its own.

**Keeping the layout.** `upgrade_in_lucky_slot()` sends the swap into the lucky slot and the upgrade together (the server applies them in order, so the upgrade's `clevel` and scroll index are computed for the bag after the swap). It doesn't swap the item back: the next item's swap carries it out to that item's old slot. The lucky slot's own occupant waits where the first item came from (`_lucky_parked`) and is swapped home by `restore_lucky_slot()` when the pass ends, or before the lucky slot moves. So a roll costs one round trip instead of three, and Riff's layout still holds at the end of every pass: tracker, computer, hpot1 and mpot1 in slots 0–3, then scrolls and primlings. `bank_items()` protects those four by name through `do_not_bank`, never by slot index. Skipping slots 0–2 by index banked the tracker and computer the first time a swap displaced them.

**Counting once.** `q_data` is sent at each roll digit and again for success/failure with the same four digits, so a roll counts once per slot until a new upgrade starts there (fewer than four digits).

### `Metrics Graphs.js`

📊 popout, after Crowns3bc's: session gold, XP (carried across level-ups), party DPS by damage type, kills per mob, loot per item, and boss contribution as the server's loot share. Gold and XP samples are taken every 5s in the background, so the line charts have history when it opens. The rest renders only while it is open.

**Live feed.** Every second each character POSTs `metrics_snapshot()` to the sink's `/live`: the same session totals, damage rates per party member and type, the top 12 coop contributors with their loot share, the last 5 minutes of gold/XP samples, and live vitals (HP/MP, level progress, map, goal, target, panic, wallet). The sink keeps only the latest per character, in memory, for the status page's Session section. The goal comes from the character's own state cache, not `current_goal_label()`: that lives in `Character Runner.js`, in the same parallel batch, and the 1s interval could reach it before it loads. A failed post pauses the feed for 30s, and a post still in flight skips the next tick.

---

## Warrior (Ulric)

### `Warrior Combat.js`

Targeting, `action_loop()`, and `weapon_burst()`. Sets `cache.tank_entity` to **Myras**.

**Farm focus at uhills** (`Targeting.js`, the uhills encounter's `farm_focus`). After the Rime shell, a pursued boss and any boss, he takes the party's farm focus when it is touchable within his engage radius; otherwise the normal scorer decides. At this spawn the monsters stand clumped on Myras, so his explosion reaches all of them whichever he hits, and the direct hit is best spent where it is amplified.

**The swing burst.** `weapon_burst()` is the one weapon swap each swing makes: swing → bataxe → cleave (when ready) → candy canes, held until the flight of the swing and of every cleave hit has landed → the weapon chooser's current set.
- Sugar rush is rolled per hit when it lands (a cleave rolls once per monster), while damage, burn and splash are fixed at launch.
- The hold is capped where it starts to cost the next swing a penalty (`free_hold_ms()`). Each equip adds 120ms of `penalty_cd` the moment it is sent, so holding to `swing interval − restore penalty` is free: ~460ms, which covers most of cleave's 160px.
- A hit on an overlapping hitbox resolves inside the attack handler and cannot roll, so `Warrior Movement.js` steps him out to a 12px gap once he is under 4px.
- The burst is off while sugar rush is up. A proc does refresh it to 10s, but at rush attack speed each swap's penalty costs more swings than the refresh is worth.

**Call cost.** The server limit is 200 per 4s, with a disconnect above it. A 2-item `equip_batch` costs 7.5 and `unequip` 9. So a plain-swing swap costs 15 per roll, while the candy step of a cleave burst costs 7.5 for one roll per monster. The plain-swing swap therefore stands down above `CONFIG.combat.swing_trick_cc_budget`. `cc_report_logger()` samples the server's per-method breakdown every 20s (`cc_report` samples).

### `Warrior Skills.js` — skill loop

Agitate, warcry, stomp, and taunt; cleave fires here only when no swing is coming, otherwise it rides the swing's `weapon_burst()`. Hardshell and charge are commented out.

**Blockers.** Cleave and agitate refuse to fire with a monster an encounter forbids (`encounter_allows("cleave"/"agitate", mob)`: porcupines reflect, pppompom, redfairy) within their range + 25px (`blocker_within()`), measured hitbox to hitbox like the server. A centre-distance check let porcupines just past 160px get cleaved.

**Boss pursuit.** During a boss pursuit he cleaves only with the pursued boss inside the cleave, so the AOE always includes the boss.

**Agitate** donates aggro to the tank but stands down while she is `endangered()`, and never fires with a kited boss in range (World Events → kiting).

**Stomp** stuns her attackers when she is below 35%. It does not use `endangered()`, which already fires below 60% whenever she is taking damage, so it saves the stun for real emergencies. It works only with a basher-type weapon worn or the `basher` set in the bag, swapped in and out in one burst like cleave.

**Taunt** (`handle_taunt()`) pulls a boss with the `taunt` trait (mrpumpkin, mrgreen) onto him whenever it is on anyone but him, Myras or a `taunt_exempt` player (CrownTown, CrownsAnal, CrownPriest), provided she is within absorb range of him. The boss's `coop` makes every player fighting it friendly to the server's taunt check, so this steals it from other parties too.

### `Warrior Skills.js` — the Rime Djinn's shell

Stomp's first job is the Rime Djinn's shell (`mob.s.rimeshell`). At half HP the Djinn casts for 3s. Unless it is stunned or takes 5% of its max HP (64k–112k; the party deals ~10–15k/s), it fires a 20,000 magical bolt at up to three contributors within 260. That one-shot all three fighters at once on 10-10.

**Stomping at the deadline.** Stomp is held to the shell's deadline.
- `rime_stomp_watcher()` reads each shell off the `entities` socket packet as it arrives. Its `s.rimeshell.ms` is the server's remaining time; the client applies entity updates only on its next draw frame and counts `ms` down locally.
- `rime_deadline_stomp()` fires on a timer at `arrival + ms − rtt − 150ms` (`RIME_STOMP_MARGIN_MS`), ~2.75–2.85s into the 3s. It was 250 (~2.66s) until 10-10 22:12: of 21 stomped shells in the 20 minutes before, seven had landed 31–32k of the 32k — about 80–100ms short. `rime_rtt()` is the median of the last 10 pings + 100, never under 300. The highest of the 10 read 405–456 on every spike and landed stomps at 2.38–2.60s.
- It does not fire if every due shell has since gone (a packet carrying `s` without `rimeshell`: broken by damage), which keeps stomp for the next Djinn.
- A blocked stomp retries every 25ms while a send still lands in time (`seen + ms − rtt`), then reports unbroken. The timer is not trusted alone: every `entities` and `hit` packet, and the skill loop, run `rime_stomp_overdue_check()` and fire an overdue stomp themselves — at 22:04 on 10-10 the timer fired 1.45s late (4.1s into the shell; damage happened to break it), the signature of a frame the browser throttles while it is not on screen, and packets keep arriving at full rate while timers do not. A stomp more than 50ms late logs `deadline Nms late, fired by <timer|entities|hit|skill loop>, last packet Nms before`.

**Mana.** A shell stomp needs only stomp's own 120 MP (`stomp_blocked(0)`). Keeping the scare reserve refused it at ~600 MP at 21:09 on 10-10, and the bolt killed all three. `stomp_ready_at` reads `null` below stomp + 300 MP (`RIME_STOMP_MP_BUFFER`), so no Djinn is let across half while he could not pay for it. That check is made only at the crossing, so while a shell is up or any Djinn within stomp range is above half, `stomp_mana_reserved()` also skips any swing that would leave him under stomp's cost: at 05:53 on 10-11 he crossed with 420+, swung himself to "Out of mana" inside the 2.5s, and the deadline stomp was refused for no mp.

**Fallback without `ms`.** A shell whose packet carries no `ms` falls back to the 1s stomp in `handle_stomp()`, once the oldest shell within 400 has been up 1s (`RIME_SHELL_STOMP_DELAY_MS`). The delay means a second Djinn shelling just after the first is caught by the same stun; a stun applied before a shell starts does not break it, and six shells went unbroken that way. It fires regardless of Myras and writes the state cache at once. It is held while any Djinn in range is still above half (`rime_shell_pending_within()`), since its 24s cooldown would otherwise often be running when the shell comes. A shell it cannot stomp is logged once with the reason (`rime shell unbroken: …`).

**One crossing at a time (`rime_shell_held()`).** One stomp breaks every shell within 400, but two Djinns crossing half within 24s of each other still wiped the party. So a Djinn within 12% of max HP above half is off-limits to every fighter unless:
- it is the one closest to half (`rime_shell_next()`; only it takes damage, so it stays the closest),
- no shell is up, and
- his stomp is ready within 1.5s, with him within 400 of it.

The band is measured by `remaining_hp()` less the burn still to tick (`pending_burn()`: intensity × ms left). The 18:58 wipe on 10-10 was a Djinn held at the old 6% band (38k) and carried across by 33k of Ulric's burn, which reaches ~9k/s for 5s. So the band must also cover a fresh burn from a hit already in flight. The hold sits inside `must_not_touch()`, so targeting, multishot, splash and the cleave/agitate blockers all respect it. His readiness reaches Riva and Myras as `stomp_ready_at` in the state cache (`null` without a basher).

**Gear while held.** The Djinns stand bunched on Myras, so with splash gear on, `splash_would_touch()` made every Djinn beside a held one untouchable, and the party stopped attacking altogether. While a held Djinn is within 400, `gear_override()` returns `RIME_HOLD_GEAR` first (Ulric and Riva: `single`, default `{}` in `Global Config.js`), so they keep hitting the Djinns near full HP and those already past half. The same override holds while a shell is up within 400: burn counts toward the break (broken shells all total ≥32k with direct damage as low as 21k), and over 43 shells on 10-10 those with Ulric's fireblade burn broke 70% of the time against 45% in his burnless vhammer set, Riva's firebow 54% against 40% in boom gear.

At the Djinns, Ulric wears `orb_dps` (he was in the XP skull every logged fight). Myras wears her `single_target` loadout (firestaff + mshield, so heals rise with attack and her armour is unchanged), `orb_dps` (loaded die +1) and `dps_chest` (coat +10, through a `chest` rule that only follows an override and stands down while the `fight` rule owns the slots). Weapons are left to the chooser so AoE stays on when they stack.

**Targeting the shell.** While a shell is up it is every fighter's first target (`rime_shell_casting()` in each `find_best_target()`, and `shelled_first()` at the head of Riva's list, so it is mark's and supershot's target). Riva picks her shot by the damage landing on the shelled Djinn (`choose_shell_shot()`): the arrow aimed at it plus, with explosion worn, each other arrow's hit × explosion % × its armour when that arrow's target is within splash radius of it, with other targets taken nearest to it first. That gives a plain shot in single gear (a 3shot is 0.7× on it, and the hold puts her in single gear whenever another Djinn nearby is held), and a 3shot in boom gear once two Djinns stand within ~14px of it (~1.26×). Her total-damage chooser kept firing 3shots in single gear.

**Telemetry (`rime_watch`).** Every shell, stomp and server refusal of a stomp goes to the timeline as `rime_watch` (`rime_shell_logger()`). Each shell's line names who damaged that Djinn inside the band while it should have been held (`ledger.held`, by attacker, burn separate). The hold still leaked on 10-10: wipes at 18:06 and 18:21 were each a second Djinn shelling during stomp's cooldown. Read those lines first after the next Djinn wipe.

Each shell also gets two lines when it ends (`log_shell_window()`):
- `shell … <outcome> Nms: total (direct + burn) of need, first hit, stack`
- `shell … by <attacker:source>`

The timeline caps a line at 160 chars. The window runs from the shell's first `entities` packet to the stomp, or to the packet that drops `rimeshell` (`plan.gone_at`). Measuring from the draw-frame sighting missed early hits and counted hits after the break, so stomped shells showed 32–34k and broken ones 26–30k. The outcome comes from that packet's conditions: `broken` (it carries `rimeexposed`), `stomped`, or `gone (…)` without `rimeexposed`, which is the bolt. Counters: `rime shell broken/stomped/gone`. Burn is split out because it is the prime suspect for damage the break does not count. The ability's live `G` entry is dumped once at load (`rimeshell ability …`).

### `Warrior Movement.js`

The reposition scorer and the farm step that keeps him engaged. He targets anything within `CONFIG.combat.engage_radius` that is attacking the party (or already in reach), walks to a 12px hitbox gap when it is out of reach, and steps back out to 12px once he is under 4px. That is `warrior_engage_step()`, which the runner also hands to `event_step()` as `engage_step`, so he holds the same gap on a boss instead of walking to `range × EVENT_REACH` and standing inside its hitbox. A moving target is re-closed as soon as the gap passes 20px (`WARRIOR_CHASE_GAP`), not when it leaves his range. Waiting for out-of-range left him a step behind a kited crabxx the whole fight. Every move is skipped while he is already heading there, since each `move` costs 2.5 call cost.

---

## Healer (Myras)

### `Healer Skills.js`

Curse, absorb, party heal, dark blessing, zap.

**Boss absorb.** A boss with her `tank` trait (mrpumpkin, mrgreen, crabxx) on a party member (usually Ulric, straight after his taunt) is absorbed onto her (`boss_absorb_target()`) without the `tank_can_take()` headroom check. Only a hit of half her HP or more refuses it, and never for a kited boss, which she outruns instead (World Events → kiting).

**Curse** is recast while the old one is still on (`curse_expiring()`: remaining ≤ projectile flight + ping + 150ms). Its cooldown equals its 5s duration and the server never checks for an existing curse, so waiting for it to drop left a ~0.5s gap plus the slow (240 speed) flight in every 5.5s.

**Zap** is the bscorpion camp's mana dump. The `ring` rule in `Healer Equipment.js` wears the zapper on ring2 inside `bscorpion_damage_window()` (`camp_luck` lists a ring of luck, but she doesn't own one, so the zapper stays on for the kill too), and she zaps down to `zapper_min_mp_pct` (60%) and lets MP potions top her up. The damage zap is camp-only: `bscorpion_damage_window()` returns nothing unless `is_at_bscorpion_farm()`, so off the camp (and off the zap-pull homes below) the ring of luck stays on and the floor never applies. She has no mana regen, so the zap rate is set by the potion cooldown (500 MP per 2s ≈ 1.8 zaps/s), not the floor; the floor is only her reserve.

**Her rings** are the Ring of the Crypt +4 (ring1) and the zapper (ring2), and she owns no other. Until 2026-10-15 the `ring` rule asked for `zap_off`, a ring of luck on ring2, whenever the fight rule and the zap pull were both off. She has no ring of luck, so every equipment tick refused it (2.3 million `equip unavailable ring` counts) and the zapper stayed on. The rule now asks for `zap_on` during a zap pull and nothing otherwise, which is what she was wearing anyway.

**Zap has its own loop.** Zap is instant, has a 200ms cooldown, and shares no cooldown with attack, so `zap_loop` runs it every `TICK_RATE.skill` (40ms), awaiting each cast. Inside `skill_loop` it ran last, behind awaited party heal, curse, absorb and dark blessing (each a ~200ms round trip), and fired 9 times in a 2-minute probe. The pull spends down to `zapper_min_mp_pct` (60%), like the camp's damage zap. It is gated by `fighter_down()` and `tank_can_take()`, not by `effective_aggro_cap()`. That cap is 5 only at 80% MP or more and 3 at 60%, so it blocked the zap whenever the zap had spent her mana. The rage box hands every mummy to the party within 4.2s anyway, so the cap protected nothing there; `tank_can_take()` is the real limit. A first build on 10-14 that kept the cap pinned her at 61% MP: spawn→targeted 1.2s, 2.1 untargeted mummies, and under one mummy of HP on the party 28% of the time, even though the kill rate rose from 1.70 to 1.78/s once Ulric stopped agitating. Drops roll on the luck of the monster's target at the kill (`issue_monster_award`), which at mummies is her ~90% of the time, so the zapper costs the ring of luck's 20 luck if she holds one again. On 10-14 she had none. The `mummy` override wears `orb_luck` (rabbit's foot+1) for the same reason, in place of `preferred_orb()`'s talkingskull while `behind_on_xp()`.

### `Healer Equipment.js`

`EQUIPMENT_RULES` resolvers and the booster swap.

**One rule owns the fight.** At the bscorpion camp, and while a boss with her `tank` trait is in sight (`tank_boss_nearby()`), one rule, `fight`, owns every swapped slot. The loadout/orb/ring rules stand down while `fight_gear_owned()`; panic still takes the orb. So each switch is a single `equip_batch`:
- `camp_fight` (firestaff, exoarm, loaded die, zapper, coat+10, plus the amulet she wore, remembered and kept off the loot list) while `bscorpion_damage_window()` holds
- `camp_luck` (lmace, mshield, rabbit's foot, ring of luck, Lucky cdragon, spookyamulet+2; `camp_gear_set()` keeps only the pieces she holds, and she holds no ring of luck) only from then until the kill (`luck_window()`, over `luck_kill_target()`: the scorpion at the camp, the boss elsewhere, where `camp_fight` goes on without the zapper since the fight rule only zaps at the camp)

The moment the target dies she goes straight back to `camp_fight`, so that swap's penalty lands in the respawn, not the next pull.

**Why luck only at the kill.** Primlings (`offeringp`, 5%) roll on `5% × (1 + luck/100)` of the scorpion's target at the kill, which is Myras, so luck matters only at that instant. `luck_due()` switches once the scorpion's remaining HP is within `luck_lead_ms` (600) of its measured kill rate plus `luck_burst_hp` (15,000, one supershot crit), latched per scorpion. Every kill is counted as `bscorpion kill: target …, luck gear on/off`.

### `Healer Movement.js`

Runner hooks (`healer_local`, panic skip) and the circle walk. `walk_in_circle()` aims half a radian ahead on the circle (`CIRCLE_LEAD`) through `local_step()`, so she keeps walking instead of being issued a ~5px move each time she stops.

**The circle's pace follows her speed** (`CIRCLE_PACE`): the angle advances at the lower of `circle_speed` (1.8 rad/s) and 90% of her speed over the radius, so the point she chases never outruns her and the circle keeps its 30px. Fear slows her hard: the server's fear is the count of physical (or magical) attackers over her courage (or mcourage), and each level takes 20/40/70/80/90/100 off her speed. She has physical courage 2 (a priest's base; STR adds none for her), so four targetrons at uhills are fear 2 and her speed falls from 72 to 32, three more levels to ~5. At a fixed 1.8 rad/s the point ran at 54 px/s, she cut inside it, and the orbit shrank to ~18px when feared (measured 10-12). Fear costs her speed and attack only; `fear_affects_heal` is off on the server.

---

## Ranger (Riva)

### `Ranger Combat.js`

Target cache, `action_loop()`, `handle_attack()`.

**Armour piercing.** `shot_apiercing()` counts her own armour piercing twice, as the server does: it adds the attacker's piercing into the hit's and then subtracts both. At 226 piercing a plain shot (×0.952 vs the bscorpion's 500 armour) beats piercing shot (0.75 × 1.188), which the single count had backwards.

**Boss only.** With a cooperative boss in range the shot chooser sees only the boss (`coop_boss_only()`, over `is_coop_boss()`: cooperative *and* in `ALL_BOSSES`). The Rime Djinn is cooperative but a farm mob, and reading it as a boss left its adds unshot. The chooser scores total damage over its targets, so with two adds beside mrpumpkin a 3-shot (0.7× each) beat a plain shot. On 10-10 she fired ~336 of them: 2.26M into adds, which earn no coop points, her 200 MP each starving her into skipped shots, and her boss DPS down from ~9,500 to 7,513.

The exception is a boss that `takes_one_damage()` (crabxx behind its crabx): there the adds are the boss's shield, so the chooser sees the boss first and the adds after it. Every multishot then includes the boss, and a plain shot goes to the boss. Boss-only resumes the moment the flag drops.

Shot choice on a shelled Djinn is under Warrior Skills → the Rime Djinn's shell.

**Free mana.** With the manasteal shirt in the bag (`mana_free()`), the chooser takes the biggest shot it can afford above the scare reserve alone. With two or more targets in range she should multishot all the time; a plain shot there means something is wrong. Until 10-11 the floor also held hunter's mark and supershot (640 MP), even at plantoid and fireroamer, where both skills are blacklisted. That is 47% of her 1,880 MP: a 5-shot needed 1,210 and a 3-shot 1,090, and she shot single targets anywhere between 250 and 1,090. Mark and supershot now fire only when the mana is there (their own check is the scare reserve).

### `Ranger Equipment.js` — chest

In free-mana mode the shirt goes on `chest_engage_shots` (2) of the widest wanted shot (`desired_shot()`) above the point where that shot stops being affordable: 1,210 MP for a 5-shot. It comes off at 90%. The engage line used to follow the shot the chooser could afford *now*, so it fell as she did (1,210 → 1,090 → 964). She settled near 1,090 in the coat, where potions alone pay for a 3-shot/plain mix of about 60/40, and the shirt was on in only 2 of 29 ledger snapshots. The +5 shirt steals 1.5%, worth about 80–110 MP per 5-shot on five targets. That doesn't fully pay for 5-shots alongside potions, but it does pay for 3-shots, so she settles at the 5-shot line and alternates 5- and 3-shots.

---

## Merchant (Riff)

### `Merchant Stand.js`

`stand_loop()` opens the stall whenever he has stood still for 2s and closes it the moment he moves, because an open stand pins speed to 10.

### `Merchant Party.js` — mluck

`buff_nearby_players()` tags every player on the map within range (320), party or stranger, with Riff's own mluck, on the 1s opportunistic loop and at the end of a delivery run. Strangers are worth it because the server gives the caster a copy of a looted item 2% of the time for anyone whose `mluck.f` is him, so what matters is whose buff it is, not whether there is one. It reads the live `s.mluck` off `parent.entities` (the server sends `s` whole, `f` and `strong` included), not the state cache, so it sees strangers and the true owner and remaining time.

`mluck_wanted()`: no buff, cast. Riff's own buff, top it up under 50 minutes. Someone else's buff, take it over whatever its time left, unless it is `strong`. The server lets a cast replace another caster's mluck only when it isn't `strong`, and a buff is `strong` when the caster's owner is the target's, so another merchant's buff on his own characters can't be taken and a cast would spend 10 MP for nothing. For the same reason no one can take Riff's buff off the party, but anyone can take it off a stranger. A takeover of the same player is allowed once a minute (`_mluck_takeover_at`): if another bot also retakes on sight, the two would otherwise trade the buff every second. Casts are 200ms apart (cooldown 100ms) and stop when MP runs short.

### `Merchant Gear.js`

`is_default_gear()` protects only the copy Riff wears: the default slot's name **and** level (`broom` +9, `wbookhs` +1). Matching by name alone kept every broom off the vendor list once `broom` was added to `SELLABLE_ITEMS`, because his mainhand is a broom.

**Nothing upgraded is vendored.** `vendorable()` (`Loot Management.js`) is the one test both sellers use, the fighters' `remote_sell_items()` and Riff's `sellable()`: on `SELLABLE_ITEMS` *and* below +1. `SELLABLE_ITEMS` names junk drops, and a +1 or better copy is either something Riff paid scrolls for or a lucky drop, so it's banked instead.

### `Merchant Upgrading.js` — scroll a grade above

Every `UPGRADE_PROFILE` uses scroll1 from +0 (`scroll0_until: 0`). The server treats a scroll of higher grade than the item as "high": the chance becomes `p×1.2 + 0.01`, the cap rises to `min(p0+0.36, 3×p0)`, and the item gains 0.4 grace, which it carries to every later level. Scroll0 on a grade-0 item gets none of that, and how far above the item the scroll is makes no difference: scroll2 at +0 scored the same as scroll1. Simulated over the profiles (2026-10-13), scroll1 from +0 instead of scroll0 raised yield 24% for pouchbow and wingedboots to +9, ~50% for coat and pants to +8, 17% for hbow and quiver, 8–9% for broom and cave_mothsteps. The reverse doesn't pay: scroll1 instead of scroll2 at pouchbow's +8 (grade 1) dropped +10s from 4.9 to 3.3 per 10k.

### `Merchant Upgrading.js` — upgrade target

The settings window's Upgrading toggle carries a target: an item, a level m and a count n (`CONFIG.upgrade_target`, localStorage `AL_merchant_upgrade_target`/`_level`/`_count`). While fewer than n copies at +m or above are held (bag and bank, `upgrade_target_open()`), each upgrade run works the target before the `UPGRADE_PROFILE` items. The profile pass skips the target's name until it is met, then upgrades it as before if it has a profile.

- **Batched like everything else.** `upgrade_target_pass()` is `upgrade_pass()` over `target_plan()`: every copy goes +0→+1, then every copy +1→+2, up to +m, the same level-by-level batch as the profile items (`profile_plan()`). It can overshoot n, which is wanted: a spare at +m costs nothing. Withdrawal takes the highest copies first when the bag can't hold them all.
- **Scrolls.** The item's `UPGRADE_PROFILE` decides scrolls and primlings, ignoring its `max_level`. An item without a profile gets `target_profile()`: a scroll one grade above the item (scroll1 below its first grade boundary, scroll2 after), no primlings. A target past the grade that scroll2 covers (grade 3, e.g. lolipops beyond +10) is refused by the server, and the copy is skipped as failed.
- **Buying replaced the "Buy to upgrade" toggle and the hard-coded coat list.** With Upgrading on, Riff buys base copies of the target when an NPC sells it (`npc_sells()`, over `G.npcs[*].items`) and none below +m are left. A batch is capped by gold above `upgrade_gold_threshold`, free slots, and the copies the base odds say are still needed (`target_base_odds()`, the product of `G.upgrades` up to +m with no grace). So a coat +7 ×2 target buys ~50 at most, not a bag-full each run.
- **Never vendored.** `sellable()` exempts the target's name, so junk-list items (helmet, shoes…) aren't sold out from under it.

The Crafting toggle carries one craft target (`AL_merchant_craft_target`), which becomes `CONFIG.crafting.targets`. `try_craft()` crafts it as far as ingredients, free slots and gold allow. The settings window lists only recipes that produce an item (`makeawishjar` has none).

**Craft, then upgrade.** After each craft batch, `upgrade_crafted()` upgrades what's in the bag (the target pass, then the profile pass) before the next batch, when Upgrading is on and the crafted item is the open upgrade target or has an `UPGRADE_PROFILE`. So a firestaff run alternates crafting and upgrading instead of banking a bag of +0s for a later upgrade run.

**Speed.** With a `computer` in the bag (Riff keeps one, `do_not_bank`) the server lets him buy and craft from anywhere, so `go_to_basics()` and `go_to_craftsman()` only step out of the bank (both are refused inside it, `cant_in_bank`). Without a computer they still walk to the NPC. The server sells a non-stackable item one per `buy()` whatever the quantity, so `buy_amount()` sends one call per copy, all at once. Buying 30 staves one per gather round was the 10-10 firestaff stall: ten rounds bought ten staves, the batch was still short, and the run banked them and blocked for 10 minutes.

**Pipelined, not awaited one by one.** The server answers every bank, craft and upgrade request exactly once, in order, so a batch is sent at once and settled with `Promise.allSettled`:
- `withdraw_item()` plans every slot first, then retrieves a floor's slots together, and saves the bank snapshot once per floor instead of per item.
- `bank_items()` plans the pack for each item itself (`plan_bank_stores()`): a stack it can merge into, else a pack on this floor with a free slot left. `bank_store()`'s own choice is made from the client's copy of the bank, so parallel stores would all pick the same first pack and overflow it. It waits for `character.bank` on arrival (`wait_for_bank()`) instead of a fixed second.
- `craft_batch()` plans every craft's grid against a simulated bag (`plan_crafts()`) and sends them together. Outputs only land in empty slots, so no planned ingredient slot is disturbed.

**The craft grid.** The server reads one grid cell per ingredient and takes the quantity from that stack's `q`, and an ingredient matches only at the recipe's level (`x[2]`, else +0: the server names an upgraded item `staff+2`). The old code put one cell per unit, so the 104 recipes with a quantity above 1 could never craft, and it accepted any level, so a stray +1 ingredient failed the craft.

The settings window saves on **Reload All** (every character, staggered as before) or **Reload One** (this window's character only); **Close** discards. Merchant settings are read when Riff's files load, so they need a reload of Riff.

### `Merchant Upgrading.js` — lolipop push

`lolipop_push()` in Riff's console runs every ololipop in stock from +8 to +10; `lolipop_push_stop()` ends it. The call only sets `lolipop_run.active` (localStorage `AL_lolipop_push`, so a reload resumes it). The `lolipops` priority, after banking and before upgrading, then runs one `lolipop_push_step()` per pass of the task loop, so deliveries still interleave. A step stocks the kit from the bank, walks HOME (the server refuses upgrades inside the bank), fails the glolipops that are due, graces the ololipop and rolls it.

**The server's rules** (`node/server.js`, `socket.on("upgrade")`; checked 2026-10-11):
- Base odds are `G.upgrades[igrade][new_level]`: ololipop 7% for +9, 2.4% for +10. A scroll of higher grade than the item, or a higher-grade offering, makes the roll "high", and the chance is capped at `min(base+0.36, 3×base)` (otherwise `min(base+0.24, 2×base)`). That is 21% for +9 (scroll2 + primling) and 7.2% for +10 (scroll3; only Primordial Essence reaches the cap, a primling stalls near 6%). `upgrade_chance_cap()` computes the same cap.
- Grace = `min(new_level+1, item.grace + min(3, p.ugrace[lvl]/4.5) + igrace) + min(6, S.ugrace[lvl]/3) + p.ograce/3.2`. The two `ugrace` stacks are per *level*, for any item: every failure adds to them and any success at that level (anyone's, for the server-wide `S`) zeroes them. So a failed glolipop raises the next ololipop's chance at the same level, and an ololipop success wipes it.
- A primling offered alone (`upgrade(item, null, offeringp)`) never fails and adds 0.5 `item.grace`, which stays on the item through later levels.
- `upgrade(..., true)` returns the exact chance and grace without consuming anything. It leaves out the lucky slot, which acts on the roll.

**Why this schedule.** Simulated over 43 ololipops and 25 glolipops (scratch `sim.js`), the chance of at least one +10 is ~54% with the lucky slot, ~48% without; scroll2 + Essence instead of scroll3 drops it to ~42%. All +8 rolls come first, because each failed +10 roll stacks the next one. Two glolipop fails after each +8→+9 success beat more: the glolipops then last the whole run, and a bigger stack is overtaken by the ololipops' own failures past the cap. They are worth ~0.5 points or ~60 primlings, because primling grace reaches the same 21% cap. Glolipops roll on scroll1 with no primling and never in the lucky slot, so they fail as often as possible: a glolipop success resets the stack too.

**Grace to the cap, not beyond.** Each roll is graced one primling at a time until the server's chance reaches the cap, or stops rising. At +8 one primling is kept back for the roll itself. Expect ~8 primlings per +8 roll and a handful per +9, ~380 in total from grace 1. Mass production is spent only on scroll rolls (12s saved each) and not on 1s grace offerings.

**The double reply.** A primling offered alone gets two replies at completion, `upgrade_offering_success` then `upgrade_success`, replayed in one synchronous loop. The client resolves `upgrade` promises FIFO, so `offer_grace()` queues a second `upgrade` deferred before the reply can arrive, and drains it if the offering is refused. Without it, the stray reply resolves the next chance check with no `chance` in it. (`add_grace_to_cap()` in the auto upgrader still logs a "Weird resolve_deferred issue" console error per offering for the same reason.)

**What it buys and when it stops.** It buys scroll1 and scroll2 from the NPC as needed, and never scroll3, Essence or primlings. It stops, with a summary of rolls, wins, glolipops failed and primlings graced, when no ololipop is left at +8 or +9, when a required item (the ololipop, its scroll or its offering) is out, or when an upgrade call is refused (a locked item, for instance).

---

## Tools

### `Data Store.py`

`al_data.sqlite`, derived from the archives and safe to delete: `ledger.jsonl`, `survey.jsonl`, `tracker.jsonl` (plus `tracker_monsters`: kills, own score and account-best score per monster), `boss_profiles.jsonl`, and from `errors_timeline.jsonl` the `death` and `bscorpion_kill` lines. Ingest is incremental by byte offset per file, and a file that shrank is re-read from the start. The sink runs `ingest` after every 15-minute sweep, in a subprocess so a slow ingest never holds the store lock, and `status()` ingests before it reads, so the page is as fresh as the `.jsonl` files (it lagged up to 15 minutes before 10-11). `ingest()` opens with `BEGIN IMMEDIATE`: Python's sqlite3 only begins a transaction at the first INSERT, so two ingests at once could both read the same offsets and insert the same lines twice. The first full ingest of 81 MB took 4s; an incremental one takes half a second.

`survey` prints one row per spot: party gold/hr from Myras's `spot_chest_gold`, kills/hr from her `spot_kills`, XP/min as the mean of the fighters' own rates, the bands, and the score.

**Bands and score are relative** (`farm_rates()`). The reference is the median gold/hr and XP/min across every measured farm spot: survey spots and the last 7 days' farm targets, each spot once (whichever measurement has more minutes), counting only spots with 10+ minutes at the spot while any have that long. A band is the ratio to the median (high ≥ 1.25×, average ≥ 0.8×, fair ≥ 0.5×, low below), and score is the gold ratio plus the XP ratio, so 2.0 is a typical spot. The median, rather than the best or the mean, keeps one outlier spot from rescaling everything. The fixed guidelines (20M gold/hr, 1M XP/min) were replaced on 10-11 at the user's request: "high" should mean high against what the party has measured. The last-hour and last-day tiles include travel and detours, so they read a little under the at-the-spot reference.

`status` is the status page's JSON: each character's last heartbeat and death from `errors.json`, farming rates (last hour, last day, and per farm target over 7 days at the spot), the survey (Myras's latest `survey_state` sample, sent once a minute, plus the per-spot results), the bscorpion kill-time and death trends, and a trimmed `party_model.json`.

### `Party Model.js`

The server's stat pipeline, offline, for Ulric and Riva. It runs the game's own `data.js` and `common_functions.js` (cached a day in `Tools/.cache`) in a `vm` context, so `calculate_item_properties()` (levels, class extras such as the Scorpion Seal's warrior block, shiny/stat_type) and `damage_multiplier()` are the game's code, not a copy. Everything is inside one async function, so `Lint.py` sees no globals.

**What it reproduces from `calculate_player_stats()`:** class base stats with the level brackets (each main-stat point per level counts again past 40, 55 and 65, and once less past 80: Ulric's base str is 203 at 91, not 101), item stats via `apply_stats` (frequency ÷ 100), offhand attack × 0.7, the mainhand/offhand wtype modifiers, exact-count set bonuses, ability `attr0` summed across items, milestone stats (`monster_stats`, from the account's best monster score in the tracker snapshot), `attack = class attack + item_attack × main/20 + a_attack`, then `× output/100`, and attack speed from level, dex and int. Buffs are added at the uptimes measured in the boss profile; an elixir whose `expires` is before the profile is dropped.

**Calibration on 10-11:** Riva 2,430 attack vs 2,428 measured, 1.628 attack speed vs 1.628. Ulric 2,310 vs 2,254 and 1.562 vs 1.568. Ulric's crit reads 31.6% against 28.3% measured because his per-swing swap (`weapon_burst()`) starts many swings in candy canes or the bataxe, which the recorded gear doesn't show.

**Damage** is attack × (1 + crit × (1 + critdamage)) × attack speed × the armour curve, per fighter, summed; the Can Opener's sunder uptime is shared across both (`1 − Π(1 − p)^(hits in 5s)`). Burn, splash, cleave and multishot are out, so AOE and burn weapons are undervalued: the slot report's "scythe for Ulric" ignores his fireblade burn and cleave.

**Mana.** `p.mp_cost` is the server's: class base + level term + item/buff `mp_cost` + crit × 1.25 + lifesteal × 1.5 + manasteal ÷ 5 + armour pierce ÷ 15, so crit, lifesteal and pierce gear make every swing dearer (Ulric 45 MP per attack, Riva 74). Income is potions, 500 MP per 2.05s (244 MP/s), plus manasteal: hit damage × manasteal %, capped by the monster's own MP per kill (the server steals from `target.mp`). There is no passive regen. Spend is measured: MP potions per second over the last 24h of ledger windows (at that farm target when there are any). Skill spend is measured minus modelled attack spend plus manasteal. Cast counts can't come from boss profiles: the profiler counts a cleave once per target struck, while the server charges its 720 MP once per cast.

Measured spend is what was spent, not what was wanted: at the potion limit the skill-mana reserve hides the demand. So the model works at the margin. A fighter at 90%+ of the potion limit is mana-bound: mana a change frees buys skills and mana it costs comes out of skills. Below that, extra cost first uses the spare headroom. Skill mana is valued as Ulric's cleave (0.5× a hit per target, 1 target at bscorpion, 3 elsewhere); Riva's skills are cooldown-bound, so her spare mana has no damage value. Cleave's sugar-rush rolls are not valued, which is most of why Ulric spends ~135 MP/s on skills at the camp: a lone-scorpion cleave is ~1.7 damage per MP against a 45 MP basic attack. Riva's `tshirt9` (manasteal 1.5% at +5), worn only in her mana band, is worth about 60 MP/s while on. Slot and upgrade rows carry the damage-only gain, the mana-adjusted gain (ranked) and the change in MP/s; `mana` prints each budget and the swaps that free mana.

**Upgrade cost** is the expected gold to rebuild the item one level higher at base odds (`G.upgrades`/`G.compounds` at the item's grade, its own grade of scroll): `value(L+1) = (value(L) [×3 for a compound] + scroll) / p`, from `G.items[x].g` at +0. Primlings, grace and the lucky slot are out, so it overstates the cost at high levels.

**Milestones** take the next unreached `[score, "stat", stat, amount]` per monster at the account's best score. Gain is the party damage with the reward applied to both fighters; hours use Myras's at-the-spot kill rate at that farm target × 1.6 score per kill, so only farmed or surveyed monsters have one.

### `Status Page.html`

Served by the sink: `/` is the page, `/api/status` its history and model data (built by `Data Store.py`, loaded fresh per request, so an edit shows without restarting the sink), `/api/live` the characters' latest 📊 snapshots. After each ingest the sink also runs `node "Tools/Party Model.js" json`; without `node` on PATH it logs and the gear and milestone panels stay on the last file.

The page polls `/api/live` every second (character cards and the Session section, one tab per character, mirroring the 📊 popout) and `/api/status` every 15s. A poll still in flight skips the next tick. The sink is a `ThreadingHTTPServer`, so a 1.5 MB `errors.json` merge (still serialised by `STORE_LOCK`) never delays the live feed. A chart under the pointer is not redrawn, so its tooltip survives the 1s refresh. One series hue, status colours only with an icon and a label, light and dark themes from the dataviz reference palette. The kill-time line breaks across gaps over 90 minutes rather than drawing a line through hours with no kills.

### `Watchdog.py`

An outside-the-page watchdog over the client's DevTools port (9222). **Read `watchdog.jsonl` first after the next dead character.**

- Logs every navigation, document request/failure, crash and dialog per window to `watchdog.jsonl` (script-initiated reloads carry the calling function and line), and mirrors them into the sink's timeline.
- Reloads a window whose main-loop heartbeat has been silent 5 min. The heartbeat is `main_beat_at`, stamped by the fighters' `main_tick` and Riff's upkeep loop (the `_errlog` heartbeat for a tab still on older code). It reloads only after it has seen that window alive, and at most 4 times an hour.
- Live state is in `watchdog.json`. Create `watchdog.pause` in the repo root to observe without reloading.
- Pings four layers every second: `router` (LAN), `isp` (the NordVPN server, sourced from the Ethernet address so it bypasses the tunnel; the kill switch blocks every other outside host), `tunnel` (1.1.1.1) and `game` (`de.adventure.land`). Each outage of 2+ misses is logged as `net_outage` with the other layers that were down at the time.

### `Install Watchdog.ps1`

Registers the watchdog as a logon task and sets the client's WebView2 flags (anti-throttling + `--remote-debugging-port=9222`) in `HKCU\Software\Policies\Microsoft\Edge\WebView2\AdditionalBrowserArguments` under `Adventure Land.exe`. It deletes the user-wide `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS`, which would override it and leak the port to every WebView2 app. Takes effect only after Steam **and** the client are fully restarted.

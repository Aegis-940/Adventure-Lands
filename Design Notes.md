# Design Notes

Why each system works the way it does: the mechanics it relies on, the numbers it was tuned to, and the incidents that shaped it. The code carries no comments by convention, so this file is where the reasoning lives. [`CLAUDE.md`](CLAUDE.md) has the rules and the one-line file map; read the matching section here before changing a file.

Dates are 2026, written `MM-DD`.

---

## Loader

### `Code Loader.js`

The one file that lives in a game code slot. It fetches and evals `Bootstrapper.js` from jsDelivr, falling back to `rawcdn.githack.com` at the same SHA (correct `application/javascript`, CORS `*`). On 10-07 jsDelivr's `/gh/` backend returned 503 for every uncached commit while npm and cached commits still served. Whichever base works becomes `window.__AL_BASE__`, and the Bootstrapper loads everything else from it.

---

## Core Systems

### `Global Config.js`

Awaited first, together with `Widget Helpers.js` and `Game Log.js`, so everything may assume it. It holds:

- core config and constants, party constants (including `DUNGEON_PARTY`), and the shared fighter config defaults
- `farm_target_for()`
- the `storage_read()`/`storage_write()` pair that every JSON-backed localStorage value goes through
- the no-op `errlog_*` stubs, plus stubs for the one-role-only `request_delivery`, `model_prediction`, `get_character_state` and `upgrade_slot_for`
- the `var` declarations of every cross-character symbol (`home`, `destination`, `CONFIG`, `cache`, `ITEMS_TO_KEEP`, `MONSTER_GEAR_OVERRIDES`, `BOSS_GEAR_OVERRIDES`, `RIME_HOLD_GEAR`, `EQUIPMENT_RULES`, `PANIC_BROADCAST_TARGETS`, the panic flags), so no reader needs a `typeof` guard

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

**Lethal monsters.** A monster with no target turns on whoever touches it first, with a hit or a splash. So `must_not_touch()`/`safe_to_touch()` keep every fighter's targeting, splash, cleave, agitate, stomp and Myras's absorb off any untargeted monster whose hit (`monster_hit_on()`) is half their max HP or more. `lethal_pursuer()` drives the `evade` movement goal when one targets them anyway, at any distance: scare, then keep stepping directly away until it lets go (scare, or the server's ~608px chase leash). A fighter walking back to Myras with it in tow drags it across the map.

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

### `Porcupine Guard.js`

Temporary. Keeps Ulric off porcupines (no targeting, and his single set when one is within splash reach) and puts them first on Riva's list. Every call site is `typeof`-guarded; delete the file's Bootstrapper line to remove it.

### `World Events.js`

Live boss and seasonal targets, and the goal that walks the party to them.

**When the boss strays.** Pursuit stops when the boss strays from its spawn area (`boss_strayed()`), and the event goal falls back to the walk to its spawn point. That is a non-pursuit `disengage` goal, so the party waits there together under cohesion. It used to return `null`, which sent Myras `home` mid-fight while the followers pursued the boss on its return.

**Pursuit.** Pursuit bypasses following and cohesion: each fighter closes to its own range. For an entry with a `spot` (franky: -19,36), every fighter first walks to within 50px of the spot while the boss is within 100px of it, then fights from there; Ulric's `engage_step` takes over inside that radius. The spot keeps the party together and away from the oneeye pen. `party_cohesion_hold(event)` does not hold for a follower whose goal is the same event.

**Kiting (crabxx).** Disabled on 10-11: its `EVENT_LOCATIONS` line is commented out, so the party ignores the event, and with no entry nothing is kited. The kite machinery stays for any entry with `kite`. When enabled, crabxx has no engage gate: the party joins at full HP. Its HP never moves while crabx live, so the old 95% gate kept the party at the bscorpion camp through every spawn from 09-30 to 10-11. The fight, from the server source:
- It hits for 16,000 every 3.3s with 45 range (~7,000 on Myras, ~7,800 on Ulric, ~9,100 = 90% on Riva). Its speed is 30 idle, but the server sets a monster's speed to its `charge` while it has a target, so it chases at 80. Curse's −20 takes that to 60, under Myras's ~70, so the kite holds only while the curse is up.
- While it has a target it spawns a crabx every 1s on a random player with coop points within 400px, in the target's party only, targeting that player. A spawned crabx (4,200 HP, 240 attack, charge 30) disappears when it loses its target: its chase limit is ~218px, crabxx's ~289px. Both drop a target not attacked for 20s.
- Whoever crabxx targets gets `{ local: "kite" }` (same label as the event, so followers don't hold back and Myras's cohesion hold never applies; `movement_goal()` returns it before cohesion). `kite_step()` runs `orbit_away()` on the entry's ring: (-1000,1700), the server's `join` landing point, radius 105 (the camp orbit's size). Clear of walls at every radius up to 240 by a geometry check.
- The ring is small so every monster stacks in its middle for AOE, and that costs Myras hits. Pure pursuit puts a chaser on an inner circle of radius R·v_chaser/v_kiter, trailing by √(R² − r²). At 105 a cursed crabxx trails ~54px centre to centre, inside its reach: its 54×39 hitbox (crabx ×1.5) plus 45 range needs ~85–100px. So it lands its ~7,000 hit (49% of her HP) whenever its 3.3s swing comes up beside her. The adds circle at ~45px from the centre, a tight stack for cleave (160) and splash. Kiting it clean needs about R ≥ 190 (220 gave ~114px), but then the adds trail ~200px behind her instead of stacking; that was the first version, and the party asked for the stack.
- Ulric (`double_aoe`) and Riva (`boom`) wear their splash sets the whole time crabxx is in sight (`BOSS_GEAR_OVERRIDES`).
- Myras curses the kited boss whenever `curse_expiring()`, ignoring her curse MP floor. `tank_can_take()` leaves the kited boss out of her absorb headroom, `boss_absorb_target()` takes it off a party member (`tank_bosses` includes crabxx) without the lethal-hit refusal, and the generic absorb pulls adds spawned on Ulric and Riva. Ulric does not agitate with a kited boss within range: the server's agitate takes every monster on any party member, crabxx off Myras included. His stomp is fine; it only stuns.
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
2. `BOSS_GEAR_OVERRIDES` (per character, keyed by boss, default `{}` in `Global Config.js`), while that boss is in sight
3. the `MONSTER_GEAR_OVERRIDES` of `home`

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

`trail_point()` returns the newest visible point even when the follower already stands on it (`trail_step()` then issues nothing). It used to return `null` for "already here", which `follow_goal()` read as "nothing in sight" and answered with a journey: together with the far-point-only step below, each follower started and cancelled a `follow` journey every 1–2s for the whole walk to a boss — 685 searches in the 14h to 10-11 12:00, 26 in one minute, all on trips and none at the camp.

**Walking with her.** In formation the step aims at her move target (`pos.going`, her `going_x`/`going_y`) 12px short, so a follower walks her leg with her. Before, it arrived inside 15px, stopped, and re-stepped every few px: `with-leader` and `follow-close` alternated about equally in the alive samples. When the far point is out of line of sight the step falls back to her own position; the game's executor stops her for a tick between route legs, so her move target flips between the far end of a leg and her own spot, and a far-only step alternated between a step and a journey on every corner.

**Reading the 🧭 lines.** They are throttled to one per 1.5s per character and only on a label change, and a re-issued journey of the same label logs nothing, so a goal that flips and returns inside 1.5s shows only as two lines of the same label. Read the game's "Searching for a path" lines beside them.

**Across maps.** When she is on another map the trail still runs to her last seen position (`_trail.seen`, at the door she used) before the cross-map search starts from there. The trail is per map, and `trail_point()` returns nothing once the follower has changed map.

**No `follow-heading`.** Pathing to her destination gave the follower a route of its own, a long cross-map search, and the `follow-wait` logic to stop it overtaking her, all to avoid re-searching for a moving target. The arbiter's distance-scaled drift now handles that instead.

**`keep`, not the farm step.** A follower that has reached her while she is in formation (travelling or holding) gets `{ local: "keep" }`, not the farm step. `warrior_farm_step()` walked Ulric off to every monster attacking the party mid-trip, which is why he, never Riva, was the straggler in all 23 cohesion holds over 17h.

What this replaced: every corner stopped the follower for a search and sent it on its own route to her destination, and the hand-back to a local step cancelled that journey. Those pauses and loop-backs held Myras in `cohesion` for about a third of her boss travel.

**Pursuit and the hold.** Myras does not pursue a boss while `party_cohesion_hold(event)` holds, that is while a live follower is off her map or beyond the range, unless that follower is itself on the event. The same call, with its 250/120 hysteresis, decides both the pursuit wait and the ordinary hold. A separate `leader_waits_for_party()` without hysteresis flipped her between pursuit and hold each tick as a follower hovered at 250. Any one follower on the boss also exempted her, so on 10-09 06:45 Riva walked 1,100px alone to mrpumpkin and arrived 40s late. Pursuit otherwise bypasses cohesion, and the tank pulled bosses alone with the party still maps behind.

A follower in turn does not pursue while she is live on his map, beyond the range (`cohesion_closing()`, the follower's own 250/120 hysteresis) and not herself on the event (`follower_holds_back()`). So her cohesion hold pulls him back to her instead of leaving the tank behind.

### `Error Log.js`

Persistent cross-character flight recorder; hooks only, read with `al_errors(true)`. It defines the real `errlog_*` over `Global Config.js`'s stubs, so call sites never guard on it.

It records game-log lines by prefix (`ERRLOG_GAMELOG_PREFIXES`): the bot's ⚠️ ❌ 🛑 🎂 🚨 🧭 🌀 and `[` lines, and the game's own pathfinder lines ("Searching for a path", "Path found", "Path not found", "Lost the path"). So a goal flip or a search loop shows in `errors_timeline.jsonl` as it happens. Until 10-10 the 🧭 goal changes and the searches were the one thing the recorder could not see.

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

---

## Warrior (Ulric)

### `Warrior Combat.js`

Targeting, `action_loop()`, and `weapon_burst()`. Sets `cache.tank_entity` to **Myras**.

**The swing burst.** `weapon_burst()` is the one weapon swap each swing makes: swing → bataxe → cleave (when ready) → candy canes, held until the flight of the swing and of every cleave hit has landed → the weapon chooser's current set.
- Sugar rush is rolled per hit when it lands (a cleave rolls once per monster), while damage, burn and splash are fixed at launch.
- The hold is capped where it starts to cost the next swing a penalty (`free_hold_ms()`). Each equip adds 120ms of `penalty_cd` the moment it is sent, so holding to `swing interval − restore penalty` is free: ~460ms, which covers most of cleave's 160px.
- A hit on an overlapping hitbox resolves inside the attack handler and cannot roll, so `Warrior Movement.js` steps him out to a 12px gap once he is under 4px.
- The burst is off while sugar rush is up. A proc does refresh it to 10s, but at rush attack speed each swap's penalty costs more swings than the refresh is worth.

**Call cost.** The server limit is 200 per 4s, with a disconnect above it. A 2-item `equip_batch` costs 7.5 and `unequip` 9. So a plain-swing swap costs 15 per roll, while the candy step of a cleave burst costs 7.5 for one roll per monster. The plain-swing swap therefore stands down above `CONFIG.combat.swing_trick_cc_budget`. `cc_report_logger()` samples the server's per-method breakdown every 20s (`cc_report` samples).

### `Warrior Skills.js` — skill loop

Agitate, warcry, stomp, and taunt; cleave fires here only when no swing is coming, otherwise it rides the swing's `weapon_burst()`. Hardshell and charge are commented out.

**Blockers.** Cleave and agitate refuse to fire with a `cleave_blacklist`/`agitate_blockers` monster (porcupines reflect) within their range + 25px (`blocker_within()`), measured hitbox to hitbox like the server. A centre-distance check let porcupines just past 160px get cleaved.

**Boss pursuit.** During a boss pursuit he cleaves only with the pursued boss inside the cleave, so the AOE always includes the boss.

**Agitate** donates aggro to the tank but stands down while she is `endangered()`, and never fires with a kited boss in range (World Events → kiting).

**Stomp** stuns her attackers when she is endangered or below 60%, only with a basher-type weapon worn or the `basher` set in the bag, swapped in and out in one burst like cleave.

**Taunt** (`handle_taunt()`) pulls a `taunt_bosses` boss (mrpumpkin, mrgreen) onto him whenever it is on anyone but him, Myras or a `taunt_exempt` player (CrownTown, CrownsAnal, CrownPriest), provided she is within absorb range of him. The boss's `coop` makes every player fighting it friendly to the server's taunt check, so this steals it from other parties too.

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

**Boss absorb.** A `tank_bosses` boss (mrpumpkin, mrgreen, crabxx) on a party member (usually Ulric, straight after his taunt) is absorbed onto her (`boss_absorb_target()`) without the `tank_can_take()` headroom check. Only a hit of half her HP or more refuses it, and never for a kited boss, which she outruns instead (World Events → kiting).

**Curse** is recast while the old one is still on (`curse_expiring()`: remaining ≤ projectile flight + ping + 150ms). Its cooldown equals its 5s duration and the server never checks for an existing curse, so waiting for it to drop left a ~0.5s gap plus the slow (240 speed) flight in every 5.5s.

**Zap** is the bscorpion camp's mana dump. The `ring` rule in `Healer Equipment.js` wears the zapper on ring2 inside `bscorpion_damage_window()` (the ring of luck is back on for the kill), and she zaps down to `zapper_min_mp_pct` (60%) and lets MP potions top her up. All of it is camp-only: `zap_target()` returns nothing unless `is_at_bscorpion_farm()`, so off the camp the ring of luck stays on and the floor never applies. She has no mana regen, so the zap rate is set by the potion cooldown (500 MP per 2s ≈ 1.8 zaps/s), not the floor; the floor is only her reserve.

### `Healer Equipment.js`

`EQUIPMENT_RULES` resolvers and the booster swap.

**One rule owns the fight.** At the bscorpion camp, and while a `tank_bosses` boss is in sight (`tank_boss_nearby()`), one rule, `fight`, owns every swapped slot. The loadout/orb/ring rules stand down while `fight_gear_owned()`; panic still takes the orb. So each switch is a single `equip_batch`:
- `camp_fight` (firestaff, exoarm, loaded die, zapper, coat+10, plus the amulet she wore, remembered and kept off the loot list) while `bscorpion_damage_window()` holds
- `camp_luck` (lmace, mshield, rabbit's foot, ring of luck, Lucky cdragon, spookyamulet+2) only from then until the kill (`luck_window()`, over `luck_kill_target()`: the scorpion at the camp, the boss elsewhere, where `camp_fight` goes on without the zapper since zap is camp-only)

The moment the target dies she goes straight back to `camp_fight`, so that swap's penalty lands in the respawn, not the next pull.

**Why luck only at the kill.** Primlings (`offeringp`, 5%) roll on `5% × (1 + luck/100)` of the scorpion's target at the kill, which is Myras, so luck matters only at that instant. `luck_due()` switches once the scorpion's remaining HP is within `luck_lead_ms` (600) of its measured kill rate plus `luck_burst_hp` (15,000, one supershot crit), latched per scorpion. Every kill is counted as `bscorpion kill: target …, luck gear on/off`.

### `Healer Movement.js`

Runner hooks (`healer_local`, panic skip) and the circle walk. `walk_in_circle()` aims half a radian ahead on the circle (`CIRCLE_LEAD`) through `local_step()`, so she keeps walking instead of being issued a ~5px move each time she stops.

---

## Ranger (Riva)

### `Ranger Combat.js`

Target cache, `action_loop()`, `handle_attack()`.

**Armour piercing.** `shot_apiercing()` counts her own armour piercing twice, as the server does: it adds the attacker's piercing into the hit's and then subtracts both. At 226 piercing a plain shot (×0.952 vs the bscorpion's 500 armour) beats piercing shot (0.75 × 1.188), which the single count had backwards.

**Boss only.** With a cooperative boss in range the shot chooser sees only the boss (`coop_boss_only()`, over `is_coop_boss()`: cooperative *and* in `ALL_BOSSES`). The Rime Djinn is cooperative but a farm mob, and reading it as a boss left its adds unshot. The chooser scores total damage over its targets, so with two adds beside mrpumpkin a 3-shot (0.7× each) beat a plain shot. On 10-10 she fired ~336 of them: 2.26M into adds, which earn no coop points, her 200 MP each starving her into skipped shots, and her boss DPS down from ~9,500 to 7,513.

The exception is a boss that `takes_one_damage()` (crabxx behind its crabx): there the adds are the boss's shield, so the chooser sees the boss first and the adds after it. Every multishot then includes the boss, and a plain shot goes to the boss. Boss-only resumes the moment the flag drops.

Shot choice on a shelled Djinn is under Warrior Skills → the Rime Djinn's shell.

---

## Merchant (Riff)

### `Merchant Stand.js`

`stand_loop()` opens the stall whenever he has stood still for 2s and closes it the moment he moves, because an open stand pins speed to 10.

### `Merchant Upgrading.js` — upgrade target

The settings window's Upgrading toggle carries a target: an item, a level m and a count n (`CONFIG.upgrade_target`, localStorage `AL_merchant_upgrade_target`/`_level`/`_count`). While fewer than n copies at +m or above are held (bag and bank, `upgrade_target_open()`), each upgrade run works the target before the `UPGRADE_PROFILE` items. The profile pass skips the target's name until it is met, then upgrades it as before if it has a profile.

- **Batched like everything else.** `upgrade_target_pass()` is `upgrade_pass()` over `target_plan()`: every copy goes +0→+1, then every copy +1→+2, up to +m, the same level-by-level batch as the profile items (`profile_plan()`). It can overshoot n, which is wanted: a spare at +m costs nothing. Withdrawal takes the highest copies first when the bag can't hold them all.
- **Scrolls.** The item's `UPGRADE_PROFILE` decides scrolls and primlings, ignoring its `max_level`. An item without a profile gets `target_profile()`: the cheapest scroll the server accepts at each grade, no primlings. A target past the grade that scroll2 covers (grade 3, e.g. lolipops beyond +10) is refused by the server, and the copy is skipped as failed.
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

### `Watchdog.py`

An outside-the-page watchdog over the client's DevTools port (9222). **Read `watchdog.jsonl` first after the next dead character.**

- Logs every navigation, document request/failure, crash and dialog per window to `watchdog.jsonl` (script-initiated reloads carry the calling function and line), and mirrors them into the sink's timeline.
- Reloads a window whose main-loop heartbeat has been silent 5 min. The heartbeat is `main_beat_at`, stamped by the fighters' `main_tick` and Riff's upkeep loop (the `_errlog` heartbeat for a tab still on older code). It reloads only after it has seen that window alive, and at most 4 times an hour.
- Live state is in `watchdog.json`. Create `watchdog.pause` in the repo root to observe without reloading.
- Pings four layers every second: `router` (LAN), `isp` (the NordVPN server, sourced from the Ethernet address so it bypasses the tunnel; the kill switch blocks every other outside host), `tunnel` (1.1.1.1) and `game` (`de.adventure.land`). Each outage of 2+ misses is logged as `net_outage` with the other layers that were down at the time.

### `Install Watchdog.ps1`

Registers the watchdog as a logon task and sets the client's WebView2 flags (anti-throttling + `--remote-debugging-port=9222`) in `HKCU\Software\Policies\Microsoft\Edge\WebView2\AdditionalBrowserArguments` under `Adventure Land.exe`. It deletes the user-wide `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS`, which would override it and leak the port to every WebView2 app. Takes effect only after Steam **and** the client are fully restarted.

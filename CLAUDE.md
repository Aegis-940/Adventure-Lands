# CLAUDE.md — Claude Code Instructions for Adventure-Lands

## Project Summary

Adventure-Lands is a **browser-injected JavaScript game automation bot** for the AdventureLand MMO. It controls a party of 4 characters (Warrior, Healer, Ranger, Merchant) through role-based scripts loaded directly into the game client. There is no build system, bundler, or Node.js runtime — all code runs in the browser.

---

## Environment & Constraints

- **No package.json, npm, or build pipeline.** Do not suggest installing packages or running build commands.
- **No module system.** Files are loaded sequentially via the Bootstrapper or injected manually into the game client. There are no `import`/`export` statements.
- **Two different load mechanisms, and they scope differently.** `Core Systems/*.js` and `Interface/*.js` load in parallel as real `<script>` tags, so their top-level `const`/`let`/`function` are all global. `Character Managers/**` load sequentially through **indirect eval**, where `var` and `function` go global but **a top-level `const`/`let` is invisible to sibling files**. Anything shared between two files of the same character must therefore be `var` or `function`. This fails silently at runtime, not at load.
- **Nothing in a character file may run at load time** except the entry point (`Warrior.js`, `Healer.js`, `Ranger.js`, `Merchant.js`). The fighters start every loop from `run_character()`; the merchant starts `loop_controller()`.
- **A top-level initializer may only name what has already loaded.** Function bodies run later so they can call anything, but a top-level `const X = {...}` is evaluated at load. `Merchant Task Loop.js` builds `PRIORITY_CHECKS` out of the `should_run_*` functions, so it has to load last. Getting this wrong throws inside the eval and the file defines nothing — silently.
- **The parallel batch executes in network-completion order, not list order.** Only `Core Systems/Global Config.js` and `Interface/Widget Helpers.js` are awaited first; every other `Core Systems`/`Dungeons`/`Interface` file races. So **adding or removing a Bootstrapper entry reshuffles that race** and can expose a latent load-time dependency that had been winning by luck — this is how deleting `Server Watch.js` broke the DPS meter. Before changing the list, check what runs at load time in the affected files (`grep -n "^[a-z_][a-z_0-9]*("`), not just what they declare. Two fixes exist, both already in the repo: promote the dependency to the first stage (why Widget Helpers is there), or poll for it and retry (how the toprightcorner button chain attaches). A guarded initialiser is worthless if an unguarded `setInterval` can reach the same code path.
- **If it's written correctly, you don't need guards.** Do not add `typeof x === "function"` / `typeof x !== "undefined"` checks or defensive fallbacks. Treat any you find as a symptom and fix the cause. There are only four legitimate guards in this repo, and they are the template for the only acceptable reasons: `Porcupine Guard.js` (a documented removal seam), `Code Loader.js` (runs standalone in a code slot before anything exists), the game's own optional callbacks (`on_cm`, and `heal`, which only a priest has), and optional *callback parameters* (`on_done`, `farm_step`, `context`) — which are an API contract, not defence. Everything else has a structural fix:
  - **needed everywhere** → declare it in `Global Config.js`, the awaited first stage. It already declares the cross-character symbols (`home`, `destination`, `CONFIG`, `cache`, `ITEMS_TO_KEEP`, `MONSTER_GEAR_OVERRIDES`, `EQUIPMENT_RULES`, `PANIC_BROADCAST_TARGETS`, the panic flags) with neutral defaults, because `Core Systems` is shared by all four characters but only the fighters fill most of them in. **These must be `var`** — the character files re-declare the same names through indirect eval, and a top-level `const`/`let` in a classic script would make that a SyntaxError.
  - **optional diagnostics** → a no-op stub the real file overwrites, as `Global Config.js` does for `errlog_*` and for the one-role-only `request_delivery`, `model_prediction` and `get_character_state`.
  - **waiting on DOM another file creates** → poll for the element and retry, as the toprightcorner button chain does.
  - **in `CRITICAL_SCRIPTS`** → it cannot be absent; a load failure aborts the bot. Guarding it is dead code.
- **Runtime is the browser game client.** All globals (`character`, `parent.G`, `parent.entities`, `parent.S`, `parent.socket`) are provided by the game environment — they are not bugs or undefined references.
- **jQuery is available** as `parent.$` or `window.jQuery`. This is injected by the game client.
- **Code is injected into iframes.** `parent.*` references are how scripts access the game's top-level scope.
- **`"Common Variables.js"` has been deleted.** It was merged or removed — do not reference or recreate it.

---

## File Roles (Quick Reference)

| File | Role |
|------|------|
| `Code Loader.js` | The one file that lives in a game code slot; fetches and evals `Bootstrapper.js` |
| `Bootstrapper.js` | Script loader — loads all other files from CDN in order |
| `Core Systems/Global Config.js` | **Awaited first, with `Widget Helpers.js` and `Game Log.js`** — everything may assume it. Core config/constants, party constants (including `DUNGEON_PARTY`), the shared fighter config defaults, `farm_target_for()`, the `storage_read()`/`storage_write()` pair every JSON-backed localStorage value goes through, the no-op `errlog_*` stubs, and the `var` declarations of every cross-character symbol so no reader needs a `typeof` guard |
| `Core Systems/Movement Manager.js` | The two movement owners — `movement_goal()` (where to go, the one priority list) and `movement_local()` (where to stand) — plus the machinery they drive: `smarter_move()`, the travel arbiter (`travel_arbiter()`), `move_to_character()`, stuck escape. The arbiter counts a goal's failures (no path, timeout, stall, a search over 60s) and on the second, with nothing targeting us, re-issues the journey with the pathfinder's town edge on (`smart.use_town`, set only for that journey and cleared when it ends — the BFS reads it at every node). The drift that re-issues a journey scales with the distance left (30%, never under 80px) and ignores a cross-map target's coordinates: re-searching every 3s for a leader moving 1500px away kept followers standing in searches. That is the way out of walled pockets like the ice golem landing; the stuck escape behind it only ignores real instances and the cave. The **town shortcut** (`town_shortcut_check()`, every main tick) is the speed use of town and never touches `smart.use_town`: only the movement leader (or a fighter with no leader) plans it — on any travel goal including `disengage` ones (event walks are all `disengage`, and not attacking is what keeps a channel alive), nothing targeting the party, outside instances and dungeon mode — when walking on from `spawns[0]` to a point on the route saves 3s beyond the channel. The walk from the spawn is read from a per-map field of walking distances (`walk_from_spawn()`: a flood fill from `spawns[0]` over a 20px grid with the game's own `can_move()`, built once per map on first use in ~250ms and within 1–8% of the game's routes, always long). It replaced a straight-line test that found no join at all on desertland, where the spawn's way to the transporter bends four times: the camp → transporter walk is 2,627px (58s at 45) against 13s by town, and the bot never took it. On landing, a route point in a straight line is spliced in; otherwise the search restarts from the landing (`smart.found = false`). The channel is cast while the walk continues, so an interruption (heals, swaps, hits all cancel it server-side) just leaves her walking; it re-evaluates each second. Followers copy a channel they see on the leader (`get_player(MOVEMENT_LEADER).c.town`) and cancel theirs if she stops hers short — her position is recorded the moment the copy is cast (`mode: "copy"`), so a channel of hers that a heal cuts short before the follower's own has started is still caught; recording it only once his channel was up let Ulric and Riva teleport out of the bscorpion camp without her (10-07 09:18). Myras's heals and party heal run while disengaged by choice, and her orb swaps to the jacko as the trip starts, so her first channel is often interrupted. A follower more than cohesion range from her while she is within 150px of `spawns[0]` teleports too (`mode: "join"`, `leader_waiting_at_spawn()`, never cancelled), every second until it lands — every town on a map lands on the same spot, so one missed copy (Ulric, targeted or interrupted by his own swaps) no longer leaves the party split across the map, each half waiting for the other; `town_landed()` (`character.on("new_map")`) splices the route onto the best point reachable from the landing. Why the native town edge is not used is in `Game API Reference.md` |
| `Core Systems/Bscorpion Camp.js` | Content-specific positioning for the desertland bscorpion/primling camp. It owns no loop of its own for movement: `movement_goal()` returns `{ local: "camp" }` while camped and `movement_local()` runs `camp_step()` (Myras orbits, Ulric/Riva hold station). Camp-only behaviour keys on `is_at_bscorpion_farm()` (which includes the `home` check), never on `home` alone, so none of it follows the party to a boss. `party_camped()` is the only carve-out from cohesion: following and Myras's cohesion hold are off only while no event is up and Myras is at the camp, so boss trips and the walk back keep the party together. Ulric cleaves the lone scorpion (a one-mob minimum at the camp): each cleave is half a swing of bataxe damage and its own sugar rush roll, mana-bound by `can_cleave()`; it stands down while sugar rush is up, where the bataxe swap's penalty costs more than a 274ms swing. Every kill interval goes to the timeline as `bscorpion_kill`, so a change can be measured against the last session instead of remembered |
| `Core Systems/Combat Utilities.js` | Monster and entity queries (`monsters_matching()`, `get_num_targets()`, `get_num_chests()`), boss and party state predicates (`find_active_boss()`, `boss_engageable()`, `should_pause_combat_loop()`), and the lethal-monster rule: a monster with no target turns on whoever touches it first (a hit or a splash), so `must_not_touch()`/`safe_to_touch()` keep every fighter's targeting, splash, cleave, agitate, stomp and Myras's absorb off any untargeted monster whose hit (`monster_hit_on()`) is half their max HP or more, and `lethal_pursuer()` drives the `evade` movement goal when one targets them anyway, at any distance: scare, and keep stepping directly away until it lets go (scare, or the server's ~608px chase leash) — a fighter walking back to Myras with it in tow drags it across the map. An `EVENT_LOCATIONS` entry with `avoid` (franky: `["oneeye"]`) widens that rule while its boss is live on our map (`off_limits()`): the `avoid` types are untouchable outright, targeted or not, and until a fighter is within 50px of the entry's `spot` every monster but the boss is too. That one predicate covers targeting, Riva's multishot, splash, and the agitate/stomp/cleave blockers, so the party fights only Franky on the way in and, from the spot, anything that is not a oneeye. `boss_strayed()` leashes boss pursuit to the boss's spawn `boundary` from `G.maps[map].monsters` (+200px out, latched per boss until it is back within +150px — mrpumpkin's usual fight spot is 136px outside its boundary, so a tighter return margin would never resume): a boss outside it with a target is chasing someone, and following it only drags the fight into town. Spawns flagged `roam` (icegolem) have no leash, and neither does an `EVENT_LOCATIONS` entry with `leash: false` — franky's spawn entry in `G` is a copy of the oneeye pen, so the event's real spot (~0,32) read as strayed and sent Myras home and back through `join` in a loop. A `join` boss that does stray falls back to the centre of its spawn area on its map, never `null`, and a boss walking home with no target is still pursued. Only crabxx (16,000 attack) crosses that line today; boss pursuit (`8e809d3`) without it fed it to Riva 32 times in one spawn. mrpumpkin, mrgreen and franky are `leash: false` in `EVENT_LOCATIONS`: other parties kite them a few hundred px and fight them there — at 20:34 on 10-06 mrpumpkin was fought for minutes at (152,816), 350px from its spawn, while ours stood at its spawn point with combat targeting a boss movement would not approach (`Monster out of range` spam) |
| `Core Systems/Combat Formulas.js` | The server's damage and heal arithmetic — `defense_reduction()`, `heal_delivered()`/`heal_useful()`/`partyheal_base()`, `burn_multiplier_at_dps()`, `splash_bonus()`, `time_to_kill_ms()`, `crit_multiplier()`, `skill_mp_cost()` (the server's `mp × (100 − mp_reduction)/100` — never read `G.skills.X.mp` raw), and `incoming_dps()`/`projected_hp()`/`endangered()` (the game client's own estimate of what the monsters on someone deal). Computes values, acts on nothing |
| `Core Systems/Combat Sampling.js` | Hit and heal telemetry — the `hit`/`action` socket samplers and the damage/heal windows they feed — plus the party's in-flight damage ledger: every fighter's `action` is recorded by `pid` (after the target's armor, or resistance for Myras, × 0.9) until its `hit` lands or its `eta` passes, and `remaining_hp(mob)` is what targeting, `would_kill()` and Riva's skills read instead of `mob.hp`. Self-starting at load |
| `Core Systems/Movement Positioning.js` | `best_orbit_spot()`, `make_distance_from_monsters_scorer()`, `reposition_center()` and `orbit_reposition()` — scoring candidate spots around a centre |
| `Core Systems/Targeting.js` | `score_targets()`/`select_target()` — the one scorer every character picks targets with. Damage is valued with `context.gear` (attack, frequency, explosion, apiercing, burn chance) when the caller passes one, otherwise with the live gear; Ulric passes his swing set's measured profile (`swing_gear()`), because the cache refreshes every 50ms and often caught him mid-swap in candy canes or the bataxe, scoring every target without splash or burn |
| `Core Systems/Porcupine Guard.js` | **Temporary** — keeps Ulric off porcupines (no targeting, single set when one is within splash reach) and puts them first on Riva's list. Every call site is `typeof`-guarded; delete the file's Bootstrapper line to remove |
| `Core Systems/World Events.js` | Live boss/seasonal targets, the goal that walks the party to them, and the anniversary visit. Pursuit stops when the boss strays from its spawn area (`boss_strayed()`), and the event goal falls back to the walk to its spawn point — a non-pursuit `disengage` goal, so the party waits there together under cohesion. It used to return `null`, which sent Myras `home` mid-fight while the followers pursued the boss on its return. Pursuit itself bypasses following and cohesion (each fighter closes to its own range — or, for an entry with a `spot` (franky: -19,36), every fighter first walks to within 50px of it while the boss is within 100px of it, then fights from there; Ulric's `engage_step` takes over inside that radius. The spot keeps the party together and away from the oneeye pen), so `party_cohesion_hold(event)` does not hold for a follower whose goal is the same event. While a boss is in sight each fighter writes a `boss_watch` timeline line every 10s (boss HP and target, positions, distance, goal, panic/evade) via `errlog_timeline()`, which goes to `errors_timeline.jsonl` without creating a record — read those first after a boss goes wrong |
| `Core Systems/Character Messaging.js` | CM (character message) handlers, localStorage-backed state cache |
| `Core Systems/Equipment Manager.js` | Equipment sets, the single `batch_equip()` emitter, the slot arbiter, the shadow-inventory planner (`equip_plan()`/`emit_equip_ops()`) that resolves a chain of sets ahead of the server's acks, and the rules resolver — the one file that changes what is worn. Every swap sent is recorded per slot for 1.5s (`slot_in_flight()`/`slot_intent()`), and `is_set_equipped()` reads that intent, so the rules loop never re-sends a swap from a stale inventory view — re-sending used stale indices and flipped the orb straight back. `emit_equip_ops()` queues a reply deferred for every op so the server's FIFO replies stay aligned. Every planner (`equip_plan()`, `batch_equip()`) starts from the **sent view** (`equip_view()`): the inventory the server will hold once every equip/unequip we have sent is answered, counted off `game_response` replies per event (the server sends the `player` update before the reply), with a 1.5s backstop. A bare `place: "equip"` reply only counts when `failed` (the failed form of an `equip_batch`) — potions are answered under `equip` too, and counting them settled swaps that had not landed. Matching the live inventory is no landing signal — a swap and its restore end where they started. Each item equipped adds 120ms of the server's `penalty_cd`, which is added to the next skill or attack's cooldown, so a swap belongs *after* the skill it serves |
| `Core Systems/Equipment Valuation.js` | What each set is worth: ability procs, measured set profiles, damage maths, and the one weapon chooser (`resolve_weapon_set()`/`set_damage_value()`) every fighter uses. Returns names and numbers; equips nothing. Set profiles pause (not reset) while a skill claim is held or a swap is unanswered (`equip_transient()`/`equip_pending()`), so the per-swing candy-cane swap does not starve them, and record only from the items actually in the slots (`set_worn()`), never the intended set — a profile taken from candy canes still in hand once valued `double_aoe` without its explosion, and the chooser then never wore it again to correct it. Profiles carry `schema: SET_PROFILE_SCHEMA`; one without it counts as unusable and is re-measured |
| `Core Systems/Party Management.js` | Panic and its broadcast (`set_panic()` is the only writer), party invites, where home is. `scare_off()` sends the jacko swap and the scare in one burst (`equip_plan("panic")` → `emit_equip_ops()` → `use_skill("scare")`), the cleave pattern — it never waits for the rules loop to put the orb on first |
| `Core Systems/Loot Management.js` | `loose_loot()` — what we keep, ship to the merchant, or vendor; bank withdrawal; chest looting (`should_loot()`/`handle_looting()`, driven by each character's `CONFIG.looting`); `inventory_sorter()`, which keeps `item_order` items on their bag slots — it waits out any swap in progress and moves through `inventory_move()`, so the sent view sees every move. Sorting from a stale inventory mid-swap moved the fireblades out from under the restore and left Ulric in candy canes |
| `Core Systems/Maintenance.js` | Potion drinking/restocking and the periodic tab reload. HP and MP potions (and the regen skills) share one cooldown, so `potion_loop()` drinks at most one per tick — MP first while panicking without the mana to scare. Regen is never worth casting: it shares that cooldown, locks it for twice as long, and is what `use("hp"/"mp")` already falls back to with no potions |
| `Core Systems/Party Cohesion.js` | Cohesion only — `follow_goal()`, `party_cohesion_hold()`, `leader_position()`, `behind_on_xp()`. A service `movement_goal()` consults; decides no movement itself. Followers keep a breadcrumb trail of the leader's turning points (`record_leader_trail()`: a crumb each time her move target — `going_x`/`going_y`, which every player broadcasts — changes, the last 60, wiped on a map change or a jump over 120px — a teleport). Every crumb joins the next by a straight leg she actually walked, so a follower on her trail can always see the next one; crumbs sampled every 25px did not, because the chord between the samples either side of a corner cuts through the wall. When the step beside her is out of sight, `follow_goal()` returns `{ local: "trail" }` to the newest crumb (or her live position) in a straight line, so a corner costs no pathfinder search; a journey to her own position is the only fallback (no crumb in sight, or she is on another map) and runs to completion — the trail never cancels it. There is no `follow-heading` any more: pathing to her destination gave the follower a route of its own, a long cross-map search, and the `follow-wait` logic to stop it overtaking her, all to avoid re-searching for a moving target, which the arbiter's distance-scaled drift now does instead. A follower that has reached her while she is in formation (travelling or holding) gets `{ local: "keep" }`, not the farm step: `warrior_farm_step()` walked Ulric off to every monster attacking the party mid-trip, which is why he, never Riva, was the straggler in all 23 cohesion holds over 17h. Before this, every corner stopped the follower for a search, sent it on its own route to her destination, and the hand-back to a local step cancelled that journey — the pauses and loop-backs that held Myras in `cohesion` for about a third of her boss travel. Myras does not pursue a boss while a live follower is off her map or beyond cohesion range, unless one is already on that event (`leader_waits_for_party()`): pursuit otherwise bypasses cohesion, and the tank pulled bosses alone with the party still maps behind |
| `Core Systems/Character Runner.js` | `run_character()` — the shared main tick loop every character starts from |
| `Core Systems/Error Handling.js` | `catcher()`, the shared error-triage/logging helper |
| `Core Systems/Error Log.js` | Persistent cross-character flight recorder; hooks only, read with `al_errors(true)`. Defines the real `errlog_*` over `Global Config.js`'s stubs, so call sites never guard on it |
| `Dungeons/Dungeon Runner.js` | Shared dungeon machinery — `wait_for_death()`, party entry (`join_dungeon_instance()`/`wait_for_party_in_instance()`), `run_dungeon()`, `start_dungeon_when_ready()`, and the `dungeon_override` the mode toggle persists |
| `Dungeons/Dungeon Mode.js` | The on/off toggle that puts the party into a dungeon (`set_dungeon_mode()`, `toggle_dungeon_mode()`) and its toprightcorner buttons |
| `Dungeons/Dungeon Progress.js` | What this run has killed and whether the quota is met — `record_dungeon_kill()`, `dungeon_quota_met()` |
| `Dungeons/Dungeon Escape.js` | Bail-out — scare the pursuit off, walk away, town back to the instance entrance (`dungeon_bailing()`, `dungeon_threats()`) |
| `Dungeons/Dungeon Telemetry.js` | Flight recorder for dungeon runs, pushed to the local sink as `errlog_sample()` calls |
| `Dungeons/Dungeon Collection.js` | Every few runs the party meets Riff outside and hands the haul over (`collection_due()`) |
| `Dungeons/Spider Dungeon.js` | The `DUNGEONS.spider` definition (entrance, map, boss waypoints) and its `run_`/`start_` wrappers |
| `Dungeons/Crypt Dungeon.js` | The `DUNGEONS.crypt` definition and its `run_`/`start_` wrappers |
| `Dungeons/Crypt Route.js` | The crypt's waypoint circuit, what each leg is hunting, and when to back out |
| `Dungeons/Dreams Cave.js` | `DUNGEONS.dreams` — the daily Cave of Many Dreams. Myras checks `cave_info()` every 10 min and switches the mode on when the account's visit is unused and no boss is being engaged (`dreams_boss_engaged()`); once on, the mode's `ignore_events` keeps `event_goal()` — boss walks and `join` teleports — from pulling anyone out until the run ends; the `party_only` flag makes Ulric kick Riff (the cave holds 3). `dreams_goal()` is first in `movement_goal()`: the walk to Dorr is a `disengage` goal (stop attacking, jacko, scare — followers inherit it through the state cache), the wait at Dorr is a plain hold so they defend themselves, and a follower inside whose leader is outside holds rather than path to her (that path would leave through the exit door). Then `cave_enter()`, clear each floor's required objectives, take the stairs, exit after floor 3. Every fighter votes the same option from `G.events.dreams.encounters` (`DREAMS_EFFECT_RANK`, risky fights first — except the six level-100 wolves, which wiped the party on floor 3 and are ranked last); Nera revives in place only when nothing hostile is near the body, otherwise at the free landing and loots chests in reach. Inside, a follower with a hostile within 250 and Myras within cohesion range takes the `dreams-fight` goal (`dreams_fight_goal()`), which runs its farm step instead of the follow step — following alone left Ulric 120–250px behind her for most of a run with no swings. The `melee_engage_radius` flag makes Ulric open on any hostile out to 250, idle or not, and walk into melee (`warrior_may_engage()`, `warrior_farm_step()`); `ranged_engage_radius` makes Riva walk to 0.9× her range of her best target when nothing is in range (`ranger_close_in()`). Myras (`dreams_close_in()`) stops at 0.9× her range rather than walking into the mob, and leaves an idle mob to Ulric once it is within his 250 and its hit is under half his HP (`dreams_left_to_opener()`), so the warrior opens and she absorbs; any mob already attacking someone, or one he cannot reach or take, she still closes on, which also walks him into reach. `cave_hostile()` is the side check `dungeon_skip_target()` uses so travelers and allies are never hit. Mechanics are in `Game API Reference.md` |
| `Interface/Widget Helpers.js` | **Loaded in the awaited first stage with `Global Config.js`**, so everything else may assume it. `register_widget()` — the one container/render-tick the Gold/XP/CC/DPS meters are each a single call into — plus `create_bottomrightcorner_widget()`, the rolling-window helpers (`commas()`, `prune_before()`, `window_sum()`) and `make_draggable()` (Settings Window.js/Stats Window.js) |
| `Character Managers/Warrior Manager/Warrior Config.js` | Warrior tunables, gear sets, panic thresholds, `state`/`cache` (character: Ulric) |
| `Character Managers/Warrior Manager/Warrior Combat.js` | Warrior targeting, `action_loop()`, and `weapon_burst()` — the one weapon swap each swing makes: swing → bataxe → cleave (when ready) → candy canes held until the swing's and every cleave hit's flight has landed → the weapon chooser's current set. Sugar rush is rolled per hit when it lands (a cleave rolls once per monster), while damage, burn and splash are fixed at launch. The hold is capped where it starts to cost the next swing penalty (`free_hold_ms()`: each equip adds 120ms of `penalty_cd` the moment it is sent, so holding to `swing interval − restore penalty` is free — ~460ms, covering most of cleave's 160px). A hit on an overlapping hitbox resolves inside the attack handler and cannot roll, so `Warrior Movement.js` steps him out to a 12px gap once he is under 4px. Off while sugar rush is up: a proc does refresh it to 10s, but at rush attack speed each swap's penalty costs more swings than the refresh is worth. Call cost (server limit 200 per 4s, disconnect above it): a 2-item `equip_batch` costs 7.5, `unequip` 9, so a plain-swing swap is 15 per roll while the candy step of a cleave burst is 7.5 for one roll per monster; the plain-swing swap therefore stands down above `CONFIG.combat.swing_trick_cc_budget`. `cc_report_logger()` samples the server's per-method breakdown every 20s (`cc_report` samples); sets `cache.tank_entity` to **Myras** |
| `Character Managers/Warrior Manager/Warrior Skills.js` | Warrior skill loop (agitate, warcry, stomp, and cleave only when no swing is coming — otherwise it rides the swing's `weapon_burst()`); cleave and agitate refuse to fire with a `cleave_blacklist`/`agitate_blockers` monster (porcupines reflect) within their range + 25px (`blocker_within()`), measured hitbox to hitbox like the server — a centre-distance check let porcupines just past 160px get cleaved; agitate donates aggro to the tank but stands down while she is `endangered()`; stomp stuns her attackers when she is endangered or below 60%, only with a basher-type weapon worn or the `basher` set in the bag, swapped in and out in one burst like cleave (hardshell/charge commented out) |
| `Character Managers/Warrior Manager/Warrior Equipment.js` | Warrior `EQUIPMENT_RULES` resolvers and monster gear overrides |
| `Character Managers/Warrior Manager/Warrior Movement.js` | Warrior reposition scorer, and the farm step that keeps him engaged: he targets anything within `CONFIG.combat.engage_radius` that is attacking the party (or already in reach), walks to a 12px hitbox gap when it is out of reach, and steps back out to 12px once he is under 4px (`warrior_engage_step()`, which the runner also hands to `event_step()` as `engage_step`, so he holds the same gap on a boss instead of walking to `range × EVENT_REACH` and standing inside its hitbox) — every move is skipped while he is already heading there, since each `move` costs 2.5 call cost |
| `Character Managers/Warrior Manager/Warrior.js` | Warrior entry point — windows, event handlers, `run_character()` |
| `Character Managers/Healer Manager/Healer Config.js` | Healer tunables, gear sets, panic thresholds, `state`/`cache` (character: Myras) |
| `Character Managers/Healer Manager/Healer Combat.js` | **The tank's** pull logic — heal target selection, MP-scaled aggro cap (`effective_aggro_cap()`), `action_loop()` |
| `Character Managers/Healer Manager/Healer Skills.js` | Healer skill loop (curse, absorb, party heal, dark blessing, zap). Zap is the bscorpion camp's mana dump: the `ring` rule in `Healer Equipment.js` wears the zapper on ring2 while a fighting scorpion is above `zapper_until_hp_pct` (5%, so the ring of luck is back on for the kill — the drop rolls on the luck of the scorpion's target), and she zaps only while she would stay under `CONFIG.potions.mp_threshold` missing. She has no mana regen, so every zap is paid in MP potions (140 MP ≈ 28 gold for ~190 damage), and spending below that band would keep `prefer_mp` drinking MP every 2s and never reach an HP potion |
| `Character Managers/Healer Manager/Healer Equipment.js` | Healer `EQUIPMENT_RULES` resolvers, booster swap, temporal surge |
| `Character Managers/Healer Manager/Healer Movement.js` | Healer runner hooks (`healer_local`, panic skip) and the circle walk |
| `Character Managers/Healer Manager/Healer.js` | Healer entry point — windows, `run_character()` |
| `Character Managers/Ranger Manager/Ranger Config.js` | Ranger tunables, gear sets, panic thresholds, `state`/`cache` (character: Riva) |
| `Character Managers/Ranger Manager/Ranger Combat.js` | Ranger target cache, `action_loop()`, `handle_attack()` |
| `Character Managers/Ranger Manager/Ranger Skills.js` | Ranger skill loop (hunter's mark, supershot) |
| `Character Managers/Ranger Manager/Ranger Equipment.js` | Ranger `EQUIPMENT_RULES` resolvers (weapon/boss sets) |
| `Character Managers/Ranger Manager/Ranger Movement.js` | Licence top-up and the reposition scorer |
| `Character Managers/Ranger Manager/Ranger.js` | Ranger entry point — windows, `run_character()` |
| `Character Managers/Merchant Manager/Merchant Config.js` | Merchant tunables, locations, `merchant_task` (character: Riff) |
| `Character Managers/Merchant Manager/Merchant Stand.js` | The stall — `stand_loop()` opens it whenever he has stood still for 2s and closes it the moment he moves (an open stand pins speed to 10) — and the idle state |
| `Character Managers/Merchant Manager/Merchant Inventory.js` | Slot counting, vendoring `SELLABLE_ITEMS`, and the banking state |
| `Character Managers/Merchant Manager/Merchant Exchange.js` | Bank fetch task plus the exchanging he does while idle |
| `Character Managers/Merchant Manager/Merchant Gear.js` | Default loadout and gathering-tool swaps |
| `Character Managers/Merchant Manager/Merchant Gathering.js` | Shared fishing/mining run |
| `Character Managers/Merchant Manager/Merchant Party.js` | mluck, party membership, the delivery run |
| `Character Managers/Merchant Manager/Merchant Upkeep.js` | Potions, loot collection and buffing, on their own 1Hz loop |
| `Character Managers/Merchant Manager/Merchant Task Loop.js` | `PRIORITY_CHECKS`, `set_state()`, `loop_controller()` — **must load after every file it names** |
| `Character Managers/Merchant Manager/Merchant Upgrading.js` | Item upgrade profiles and automation |
| `Character Managers/Merchant Manager/Merchant Crafting.js` | Crafting logic and batch orchestration |
| `Character Managers/Merchant Manager/Merchant.js` | Merchant entry point |
| `Interface/DPS Meter.js` | Real-time DPS tracking overlay |
| `Interface/Stats Window.js` | Character stats + gold graph (Canvas API) |
| `Interface/Settings Window.js` | Live in-game per-character target settings, persisted via localStorage, ⚙️ button next to the reload button |
| `Interface/Party Frames.js` | Party HP/status display |
| `Interface/Bank Viewer.js` | Bank access UI, plus the toprightcorner reload button (restored here after Buttons.js was removed) |
| `Interface/Bank Sort Order.js` | Bank sorting order/category definitions |
| `Interface/CC Meter.js` | Crowd control meter |
| `Interface/Gold Meter.js` | Gold accumulation display |
| `Interface/XP Meter.js` | XP tracking display |
| `Interface/Game Log.js` | **Loaded in the awaited first stage**, so `al_log_push()` is guaranteed on the error path. The one log window — wraps `parent.add_log`, adds timestamps, category filters (gold/kills/items/errors) and the Log/Filtered tabs, and resizes `#gamelog` 50% wider (leftward, over the canvas) and 25% taller. Self-starts at load; there is no `log()` any more, everything goes through `game_log()` |
| `Interface/Pause Button.js` | Per-character pause/resume button — parks automation, leaves combat/panic/upkeep running |
| `Tools/Error Sink.py` | Local HTTP sink that receives `errlog_sample()` pushes and writes `errors.json` |
| `Tools/Watchdog.py` | Outside-the-page watchdog over the client's DevTools port (9222). Logs every navigation, document request/failure, crash and dialog per window to `watchdog.jsonl` (script-initiated reloads carry the calling function and line), mirrors them into the sink's timeline, and reloads a window whose main-loop heartbeat (`main_beat_at`, stamped by the fighters' `main_tick` and Riff's upkeep loop; the `_errlog` heartbeat for a tab still on older code) has been silent 5 min — only after it has seen that window alive, at most 4 times an hour. Live state in `watchdog.json`; create `watchdog.pause` in the repo root to observe without reloading. Also pings four layers every second — `router` (LAN), `isp` (the NordVPN server, sourced from the Ethernet address so it bypasses the tunnel; the kill switch blocks every other outside host), `tunnel` (1.1.1.1) and `game` (`de.adventure.land`) — and logs each outage of 2+ misses as `net_outage` with which other layers were down at the time. **Read `watchdog.jsonl` first after the next dead character** |
| `Tools/Install Watchdog.ps1` | Registers the watchdog as a logon task and sets the client's WebView2 flags (anti-throttling + `--remote-debugging-port=9222`) in `HKCU\Software\Policies\Microsoft\Edge\WebView2\AdditionalBrowserArguments` under `Adventure Land.exe`, deleting the user-wide `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS`, which would override it and leak the port to every WebView2 app. Takes effect only after Steam **and** the client are fully restarted |
| `Tools/Anniversary Probe.js` | One-off dev probe pasted into a code slot/console; not part of the loaded bot |
| `Tools/Crypt Probe.js` | One-off dev probe for crypt geometry; not part of the loaded bot |
| `Tools/Drag Probe.js` | One-off dev probe: reports what receives mouse events over the game UI, into the game log; not part of the loaded bot |

---

## Code Conventions

### Naming
- Functions and variables: `snake_case` — e.g., `smarter_move()`, `start_attack_loop()`
- Constants/config keys: `UPPER_SNAKE_CASE` — e.g., `TICK_RATE`, `LOOT_THRESHOLD`
- Top-level config objects: `CONFIG`, `STATE`
- Internal/private: prefixed with `_` — e.g., `smart._interrupt`
- Multi-word file/folder names: space-separated, e.g. `Global Config.js`, `Character Managers/` — a folder names what it contains, a file names what it does. `Bootstrapper.js` already `encodeURI()`s every path and jsDelivr serves `%20` fine; shell loops over these paths must quote and use `-z`/null separators (see Deploying)

### Formatting
- Indentation: tabs
- String quotes: double quotes by default; single quotes only to avoid escaping (e.g. a string containing a `"`); template literals for interpolation
- Braces: same-line (K&R) — `function foo() {`, not `function foo()\n{`
- Statements are semicolon-terminated

### Structure
- Each character function file has a `CONFIG` object at the top for tunable settings
- Section headers use `// ---...--- //` dash-block dividers
- Async loops use `setInterval(async () => { ... }, tickRate)` pattern
- Movement returns Promises — use `smarter_move().then(...)` or `await smarter_move(...)`
- Equipment swapping has **no cooldown of its own** — swaps are meant to react in milliseconds, and no equip path waits on anything: not a timer, not a hold, not a server refusal. The reference is the warrior's cleave swap, which emits arm, skill and restore in one burst and returns. Potions are unrelated to equipment in every way, cooldowns included; do not couple them

### Comments
- **Zero code comments.** Do not add explanatory, WHY, or doc comments (including JSDoc) to any code you write — identifiers, structure, and headings should carry all the meaning
- Section-header dividers (`// ---...--- //` dash-block, title, dash-block) are structural, not comments — keep them
- Commented-out code blocks (disabled/experimental features) aren't comments either — leave them; ask before removing (see What to Avoid)

---

## Key Game Globals (Do Not Flag as Errors)

```javascript
character          // current character state (HP, mana, position, inventory)
parent.entities    // all entities in game world
parent.G           // game data (maps, items, NPCs, crafting)
parent.S           // server data (boss status)
parent.socket      // WebSocket to game server
parent.$           // jQuery
```

---

## Party Configuration

- **Party Leader:** `Ulric` (Warrior)
- **Party Members:** `Riva` (Ranger), `Myras` (Healer), `Riff` (Merchant)
- Characters coordinate via shared globals and socket events
- Merchant (Riff) supports others: delivers potions, collects loot, handles upgrades

### The Healer tanks — not the Warrior

`Myras` (Healer) is the party's tank. This is the single most commonly mis-assumed thing about
this party, so do not reason from the usual Warrior-tanks/Healer-heals layout:

- `Warrior Combat.js` hardcodes `cache.tank_entity = get_entity("Myras")`. Every warrior skill and
  equipment decision reads that entity, never `character`.
- The Healer deliberately pulls: `Healer Combat.js` takes untargeted monsters while
  `count_my_aggro() < effective_aggro_cap()`, and her cap scales with MP
  (`(mp_pct - 0.2) / 0.6`, floored at `CONFIG.combat.aggro_cap`). Aggro is a *resource she
  spends mana on*, not a hazard she avoids.
- The Warrior's `agitate` exists to feed her: `handle_agitate(tank)` refuses to fire when the tank
  is missing or dead, and checks `distance(character, tank) <= 100`.
- Target priority runs both ways round this: the Warrior's `target_priority` is `["Myras"]`, fed to the
  scorer's `protects` term (kill what she holds),
  the Healer's is `["Ulric", "Myras"]` (pull what is hitting him, then hold it).
- So `Warrior Skills.js`'s `hardshell`/`charge` are commented out, its stomp protects *her*, and
  low-HP checks like `tank.hp < tank.max_hp * 0.6` refer to *her* HP, not his.
- Her absorb and her own pulls are gated on projected damage (`tank_can_take()` in `Healer Combat.js`,
  over `incoming_dps()` in `Combat Formulas.js`): nothing is taken on if she would fall below 30% within
  2s net of her own healing. She pulls nothing while Ulric or Riva is dead or off her map.

Practical consequence: survivability work (damage projection, panic thresholds, defensive gear,
escape logic) belongs on the **Healer**. The Warrior is a DPS/off-puller — give him damage,
positioning, and aggro-donation logic.

---

## What to Avoid

- Do not add `import`/`export`, `require()`, or module syntax
- Do not suggest TypeScript, transpilation, or build tools
- Do not add `package.json` or dependency management
- Do not remove commented-out code without confirming with the user
- Do not refactor across multiple files speculatively — changes are hard to test without the live game
- Do not add error handling for scenarios that can't happen in game context (e.g., `character` being null)
- Do not centralize config unless explicitly asked — each file's `CONFIG` is intentionally local. `Global Config.js` holds only the values that were byte-identical in all three fighters (`LOOTING_DEFAULTS`, `POTION_DEFAULTS`, `EQUIPMENT_DEFAULTS`, `PANIC_ORB_SET`), spread and overridden per character so every tuned value stays visible where it is tuned
- Do not merge a dungeon's `flags` into `CONFIG`. They are contextual overrides read at the decision they affect; most have no `CONFIG` counterpart, so merging would mean inventing ~20 dungeon-only `CONFIG` keys, making `CONFIG` mutable, and owning an apply/revert lifecycle that can leave a stale override after the mode is switched off

---

## Deploying (purge jsDelivr after every push)

The bot loads from `cdn.jsdelivr.net/gh/Aegis-940/Adventure-Lands@<sha>/`, resolved via
`api.github.com`. That API allows **60 unauthenticated requests/hour per IP**; on 403 the loader
falls back to `@main`, which jsDelivr caches for 12h (`s-maxage=43200`, confirmed in the response
headers). A query string does **not** purge that cache — only `purge.jsdelivr.net` does.

So a push made while rate-limited can silently never reach the characters. This is not theoretical:
`Party Management.js` and `Healer Skills.js` sat on a pre-fix commit for hours while every other file
was current, producing a mixed build that made fixed bugs look unfixed.

**After every push, purge and verify:**

```bash
# Read the purge response — do NOT discard it. purge.jsdelivr.net throttles PER PATH and reports
# it in the JSON body: {"paths":{"...":{"throttled":true,"throttlingReset":2990}}}. A throttled
# purge returns HTTP 200 and does nothing, so `-o /dev/null` makes the failure invisible.
# Paths contain SPACES: iterate with `-z` and URL-encode them as %20. An unquoted
# `for f in $(git ls-files)` splits every path and purges nonsense.
git ls-files -z '*.js' | while IFS= read -r -d '' f; do
  u=${f// /%20}
  r=$(curl -s "https://purge.jsdelivr.net/gh/Aegis-940/Adventure-Lands@main/$u")
  case "$r" in *'"throttled": true'*) echo "THROTTLED $f";; esac
done
# verify: compare against git blobs, NOT working-tree files — the working tree is CRLF
# while git blobs and jsDelivr are LF, so a naive diff reports every file as stale.
git ls-files -z '*.js' | while IFS= read -r -d '' f; do
  u=${f// /%20}
  a=$(curl -s "https://cdn.jsdelivr.net/gh/Aegis-940/Adventure-Lands@main/$u" | md5sum | cut -d' ' -f1)
  b=$(git show "HEAD:$f" | md5sum | cut -d' ' -f1)
  [ "$a" != "$b" ] && echo "STALE $f"
done
```

A purge that reports `"throttled": false` can still leave `@main` serving the old
content, because an edge refills from a GitHub mirror that is still behind. This has
happened four times. The purge response is therefore not proof of anything — only the
verify loop above is, and for a rename or delete, grep the *served* file for something
you changed. **One** re-purge of just the stale paths clears it in practice.

If a file is still STALE after that one retry, **stop and wait** — do not retry in a loop. Retrying keeps the path
throttled (`throttlingReset` is in seconds and runs to ~50 minutes) and cannot succeed. The pinned
`@<sha>` path is unaffected by any of this and serves the new content immediately, so a stale
`@main` only matters when the loader has fallen back to it after a GitHub API 403. Check the SHA
path to confirm the deploy is actually reachable:

```bash
sha=$(git rev-parse HEAD)
curl -s "https://cdn.jsdelivr.net/gh/Aegis-940/Adventure-Lands@$sha/${f// /%20}" | md5sum
git show "HEAD:$f" | md5sum
```

Other loader facts worth not re-deriving:

- `Code Loader.js` lives in **game code slot 1**, not the repo's load path. Paste it **once** —
  replacing the slot's whole contents. A slot holding two copies runs both IIFEs and loads
  everything twice, which re-evaluates every `Core Systems/*.js`; their top-level `const`s cannot
  re-declare, so those files throw at instantiation and define **nothing**, while the first copy's
  loops keep running against a stale `character` and every action is rejected as `disabled`.
- The base must serve executable script. `raw.githubusercontent.com` sends `text/plain` with
  `nosniff`, so `getScript` refuses it — a raw base fails all 18 files even though a `fetch`+`eval`
  of `Bootstrapper.js` from raw succeeds.
- `log()` and `game_log()` write to the **in-game** log windows, never the browser console. Ask for
  the in-game log when diagnosing; the browser console does not contain them.

## Testing

There is no test suite. Changes must be manually tested by injecting the modified script into the live game client. When suggesting changes, keep them minimal and easy to verify in-game.

---

## Game Engine Reference

A comprehensive map of the AdventureLand game engine internals is available in [`Game API Reference.md`](Game%20API%20Reference.md). This was sourced from the [official game repo](https://github.com/kaansoral/adventureland) and covers:

- **All bot API functions** — `attack()`, `heal()`, `use_skill()`, `smart_move()`, `buy()`, `upgrade()`, `compound()`, `bank_store()`, `send_cm()`, etc. with signatures, return types, and reject reasons
- **Socket events** — every client→server and server→client event with payloads (including skill-specific payloads like `3shot`, `5shot`, `cburst`, `blink`)
- **`character` object** — all properties (stats, slots, inventory, status effects, channeling, bank, queue)
- **`parent.entities`** — monster vs player properties
- **`parent.G` data** — items, monsters, maps, skills, NPCs, geometry, crafting, sets
- **`parent.S` server data** — live boss/event status
- **Event system** — `character.on()` events and overridable callbacks
- **Combat system** — damage flow, reduction formula, cooldowns, disable checks
- **Movement system** — smart_move BFS internals, collision geometry, doors/transporters
- **Item system** — upgrade/compound multipliers, grade thresholds, scroll types

**When to consult it:** Before suggesting improvements to bot combat, movement, item management, or any game API usage — check the reference to confirm exact function signatures, valid parameters, and available events rather than guessing.

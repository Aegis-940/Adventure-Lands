# Design Notes

Why each system works the way it does: the mechanics it relies on, the numbers it was tuned to, and the incidents that shaped it. The code carries no comments by convention, so this file is where the reasoning lives. [`CLAUDE.md`](CLAUDE.md) has the rules and the one-line file map; read the matching section here before changing a file.

Dates are 2026, written `MM-DD`.

---

## Loader

### `Code Loader.js`

The one file that lives in a game code slot. Since 2026-10-15 it loads from this PC: it asks the error sink for `/code/main` (the commit `main` is on), sets `window.__AL_BASE__` to `http://127.0.0.1:8787/code/<sha>/` and evals `Bootstrapper.js` from there. The Bootstrapper loads everything else from the same base, so one load is one commit. The sink reads the files from git (one `ls-tree` and one `cat-file --batch` per commit, kept in memory for the last four), never the working tree.

**Why not the CDN any more.** It used to resolve the commit through `api.github.com` (60 requests an hour), fetch from jsDelivr at that SHA, fall back to githack, and fall back again to jsDelivr `@main`, which is cached for 12 hours and whose purges are throttled. Each of those failed in practice: jsDelivr's `/gh/` backend returned 503 for uncached commits on 10-07 and again on 10-15, githack was slow until warmed, purges throttled and `@main` stayed stale. Every deploy needed a push, a purge and a minutes-long verify. Loading all 98 files took 5.5–6.5s from jsDelivr and about 1s locally, and the slow load is what let the party die in the mummy pack at a reload. GitHub is now only the backup. If the sink is down, the loader retries every 5s rather than falling back, because the sink's logon task restarts it within a minute.

---

## Kernel

### `Kernel.js`

Files register boot steps at load with `on_boot(file, fn)` and the Bootstrapper calls `kernel_boot()` once, after the role files. Steps run in Bootstrapper list order, not the order scripts happened to arrive in, so the parallel batch can no longer race itself: every file's declarations exist before any step runs. A throwing step is caught, logged with its file and recorded (`errlog_record("boot", …)`), and the other steps still run; the role entry point's failure is logged as fatal. `al_boot()` reports what ran, skipped and failed.

`Kernel/` loads as its own stage, awaited before the first stage. Until 2026-10-15 the kernel files shared the first stage with Global Config, Widget Helpers and Game Log, and that stage is a `Promise.all`: its files run in arrival order. Widget Helpers and Game Log call `on_boot()` at load, so whichever arrived before `Kernel.js` threw `on_boot is not defined` and silently lost its boot step (no toolbar buttons, or no log hook). It never happened live because `Kernel.js` is small and requested first. Lint now checks stage order and the harness boots every role a second time with each stage reversed; either would have caught it.

Error Log is first in the parallel list so its step runs first. Its step loads the saved session; a step that recorded something before it would have had its record overwritten by that load.

The four role entry points are boot steps too, so `run_character()` starts after every shared step, as it used to start after every shared script.

### `Scheduler.js`

`every(name, { ms, kind, beat, after, fixed, retry }, fn)` is the only loop. Without `fixed` it runs the body at once (or `after` ms), awaits it, and schedules the next run after the delay the body returns: a number, `false` to stop and deregister, or nothing for `ms`. That is exactly what the hand-written loops did with `setTimeout(self, delay)` and `while (true) { …; await delay(ms) }`, so converting them (step 1.2b, 2026-10-15) left every delay unchanged: the harness boots each role on both builds, advances three rounds of timers, and the scheduled delays match one for one. `fixed: true` keeps plain `setInterval` timing for the loops that had it.

A body that throws is caught here (`catcher(e, name)`, counted in `al_loops()`) and the loop goes on after `retry` if it has one, else `ms`. The action and skill loops use `retry: TICK_RATE.retry` (10ms), which their bodies used to get by wrapping themselves in a try/catch; since 10-16 no loop body or socket handler catches its own errors, so every one reaches `catcher` and `errors.json`. A hand-written loop that threw before its own `try` used to stop for good. Bodies that set their own retry delay in a `catch` (the combat loops' `TICK_RATE.retry`) keep it.

`beat: true` is what `loop_tick`/`loop_next` did for the combat loops: an `errlog_beat(name)` per run and `lag <name>`, the gap between when a run was due and when it started. The loop names are unchanged (`action_loop`, `skill_loop`, `zap_loop`), so the beats in death records and the watchdog read the same.

`wait_until(done, ms, poll)` is the one awaited wait: it resolves `true` as soon as `done()` holds, or `done()`'s answer at the deadline. It replaced twelve hand-written polls in 10-16 (bank, movement settling, dungeon entry and assembly, the crypt's calm hold, Riff's arrival, the bank sort, the gathering channel, and Dreams' own `dreams_until`); the crypt's mana hold stays hand-written, because each of its three exits logs differently. `when(name, ready, fn, ms)` polls `ready()` and runs `fn` once: the game log waiting for `#gamelog`. (The toprightcorner button chain, each button waiting for the one before it, used it until the toolbar registry replaced it on 2026-10-15.)

`kind` (`automation`, `combat`, `safety`, `telemetry`, `ui`) only labels a loop for now. Pause and death still work the way each body checks them.

**Loop rates.** A loop ticks as fast as its decision must be fresh, and no faster: a faster loop spends `character.cc` (looting and gear resolution stop at 125) and wins races against slower loops that matter more. `al_loops()` lists every loop with its rate. Four rates have a history:
- **The skill loops run at `TICK_RATE.skill` (40ms).** Riva's defaulted to 5ms until 2026-09-18, re-pricing mark and supershot 200 times a second whenever one was ready but not worth casting, and calling `change_target()`, which goes to the server, as often. It now sends `change_target` only when the target changes.
- **The potion loop polls at 50ms** (`POTION_POLL_MS`), not 10ms. HP and MP change on server ticks, and against a ~225ms ping the slower poll adds under 40ms to the reaction. If survival ever looks worse, this is one constant to put back.
- **Riva's action loop stays at 5ms** against 10ms for the others. There's no clear reason for the gap; aligning it would halve the rate of her damage loop for a 5ms change, so it is left alone.
- **The equipment loop runs at 25ms**, and that is now what lands the panic orb in a median 31ms. Before panic moved into the resolver, the same rate made it win every race against `panic_check` (the orb ping-pong). A rate is only wrong relative to what the loop decides.

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

- **Context answers** (`gear`, `settings`) come from the encounters live right now. Every gear resolver asks `encounter_gear(group)` directly; `gear_override()`, `MONSTER_GEAR_OVERRIDES`, `BOSS_GEAR_OVERRIDES` and `RIME_HOLD_GEAR` folded into encounters on 2026-10-15. Inside an active dungeon its settings come first: every resolver asks the dungeon (`dungeon_setting()`, `dungeon_loadout()`) before `gear_override()`, and a dungeon flag that vetoes an action is checked beside `encounter_allows()`, so either can veto. A `spawn` encounter is live when `home` is one of its `homes` and the character is on the destination map, which is the rule `gear_override()` used. A `hazard` or `situation` encounter is live while its own `active(ctx)` says so. The highest tier answers (situation, then hazard, then spawn); an answer of `null` passes to the next. Two live encounters of the same tier answering the same question is a configuration error, counted once in the flight recorder and settled by encounter name.
- **Mob answers** (`allows`, `rank`, `traits`) apply to the encounter's `mtypes` wherever the mob is met, live or not, so a porcupine is protected at any spawn. Any veto wins; ranks add. An encounter with only mob answers needs no tier and is never live.

`traits` are the positive facts `allows` cannot say: `encounter_trait("tank", mob)` (Myras tanks it), `taunt`, `cleave_alone` (one in reach is enough to cleave), `hold_cleave`, `attack_if_targeted`, `agitate_pack`, `panic_ignore` (doesn't count toward a fighter's panic aggro). `encounter_mtypes("tank")` lists every monster type with a trait, for code that searches by type.

The actions `allows` can veto: `attack` (target it), `cleave` and `agitate` (fire the skill while it is within reach, through `blocker_within()`), and `pull` (count it as a reason for Ulric to agitate).

`ctx` (`encounter_context()`) is rebuilt at most once per `CACHE_TTL`: the character, the visible monsters within 600 (`ctx.mobs.of(type)`), `home` and `destination`. Rebuilding it is also when activity changes, so the `enter`/`leave` hooks fire then.

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

Phoenix was in Riva's `always_attack` list, at boss priority. It was taken out on 2026-10-15, as the party no longer met them; since 10-16 its own encounter ranks it first for her (`Phoenix.js`).

### `Targetron-Sparkbot.js`

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

### `Bscorpion.js`

The desertland camp, the current farm since 2026-10-15. It moved from `Core Systems/Bscorpion Camp.js` the same day, and its spec took over the bscorpion lines from three `MONSTER_GEAR_OVERRIDES`, Riva's `always_attack` and `aggro_by_home`, and the `home === "bscorpion"` branch in `movement_goal()`:

- `goal` (asked wherever the party is while bscorpion is home): the camp step at the camp (`{ local: "camp", fight: true }`), the walk to its centre otherwise.
- `steps`: `camp`, which `movement_local()` finds through `encounter_step()`: `camp_step()`.
- `gear`: Ulric `single` and `orb_dps`, Riva `single`, Myras `single_target` and `orb_luck`, while on the map.
- `home_settings`: Riva's panic aggro limit is 99, while bscorpion is home, on any map, so a boss trip from the camp keeps it.
- `traits`: Riva always shoots a bscorpion and ranks it with the bosses.

Unlike the other encounter files this one is required, not optional: every fighter's role files call its functions directly (`is_at_bscorpion_farm()`, `camp_temporal_surge()`, `bscorpion_worth_buffing()`). Myras's fight rule stays in Healer Equipment because the tanked bosses use it too.

#### Positioning

Positioning for the desertland bscorpion/primling camp. It owns no movement loop of its own: its encounter goal returns `{ local: "camp", fight: true }` while camped, and the spec's `steps.camp` is what `movement_local()` runs, `camp_step()`. Myras orbits; Ulric and Riva hold station. The orbit itself is `orbit_away()` in `Movement Positioning.js` (a 105px ring around the camp centre, 10° steps toward whichever neighbour is further from the scorpion), shared with the crabxx kite.

**Riva's rail (`CAMP_RAIL`).** A wall-free line from (-390,-1250) running north-west (215°) for 360px through the open ground. A solid wall runs ~140px north of the camp centre, and pillars and walls sit to the south-west, so any position computed relative to the moving scorpion eventually landed behind one of them.
- She stands at the rail point nearest the camp that is ≥130px (hitbox to hitbox) from the scorpion, clear of its `weakness_aura`. The aura is −10 dex/str and −30 speed for 20s, re-applied every 4s within 100px, with the first tick 0–4s after spawn. At her old 50px it cost her ~3.4%.
- Between spawns she waits 150px along the rail, where all of the spawn box is within her 222 range.
- Simulated over the spawn box and Myras's orbit, every fight position has such a point within range (worst 145), at most 345px along. No single north-west spot can cover the box: its far corner is ~234px edge to edge from its own north-west corner.
- Her hold radius is the rail's far end plus the margin, so retreating never turns the goal into travel.

**Temporal surge.** `camp_temporal_surge()` casts temporal surge the moment the scorpion dies. The server cuts every pending respawn within 160px (hitbox to hitbox) of the caster to `remaining × 0.85 − 1000ms`, so the 6.45s respawn becomes ~4.5s. The orb goes in, the cast goes out and the orb goes back via the caster's own `orb` rule, in one `equip_burst()` like scare. Myras casts first. Riva (`SURGE_PRIORITY`) waits 800ms and casts only if Myras's `surge_at` in the state cache shows she didn't. With two 60s cooldowns against a ~38s loop, every death is surged. Ulric is not a caster: cleave keeps his 1,890 MP near empty.

**Combat pause.** At the camp `should_pause_combat_loop()` never pauses a follower for being beyond cohesion range of the leader. That formation rule stopped Riva shooting whenever Myras's orbit took her to the far side. The general rule reads `cohesion_range()` (250); it was a fixed 200 while `follow_goal()` let a follower stand up to 250 away, a band where he neither moved nor fought.

**Scoping.** Camp-only behaviour keys on `is_at_bscorpion_farm()` (which includes the `home` check), never on `home` alone, so none of it follows the party to a boss. `party_camped()` is the only carve-out from cohesion: following and Myras's cohesion hold are off only while no event is up and Myras is at the camp, so boss trips and the walk back keep the party together.

**Ulric's cleave.** Ulric cleaves the lone scorpion (a one-mob minimum at the camp). Each cleave is half a swing of bataxe damage and its own sugar rush roll, mana-bound by `can_cleave()`. It stands down while sugar rush is up, where the bataxe swap's penalty costs more than a 274ms swing.

**Measurement.** Every kill interval goes to the timeline as `bscorpion_kill`, so a change can be measured against the last session instead of remembered.

### `Rime Djinn.js`

The Djinn's shell, moved on 2026-10-15 from Combat Utilities (the shell predicates), Warrior Skills (the shell windows, the band logger, the deadline stomp) and Ranger Combat (`shelled_first()` and the shell shot). It was a pure relocation: every function kept its name and text, so every caller and the deadline stomp's hot path behave as before. Generic stomp (`stomp_wanted()`, `stomp_blocked()`, `fire_stomp()`, `handle_stomp()`) stays in Warrior Skills.

Two encounters close the file. The `rimedjinn` spawn carries Ulric's `orb_dps` and Myras's `single_target`, `orb_dps` and `dps_chest`. The `rime shell` situation carries the hold weapon (`single`) for Ulric and Riva, decided on every call by `rime_hold_gear_wanted()`; it is live whenever a Djinn is in the entity list. Like Bscorpion.js the file is required: `must_not_touch()`, every fighter's targeting and Ulric's stomp call into it.

Still to do from the plan, once live Djinn fixtures exist: the stomp as an encounter `step`, and the shell windows on `enter`/`leave`.

#### The shell

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

**Gear while held.** The Djinns stand bunched on Myras, so with splash gear on, `splash_would_touch()` made every Djinn beside a held one untouchable, and the party stopped attacking altogether. While a held Djinn is within 400, the `rime shell` encounter answers the weapon first (Ulric and Riva: `single`), so they keep hitting the Djinns near full HP and those already past half. The same answer holds while a shell is up within 400: burn counts toward the break (broken shells all total ≥32k with direct damage as low as 21k), and over 43 shells on 10-10 those with Ulric's fireblade burn broke 70% of the time against 45% in his burnless vhammer set, Riva's firebow 54% against 40% in boom gear.

At the Djinns, Ulric wears `orb_dps` (he was in the XP skull every logged fight). Myras wears her `single_target` loadout (firestaff + mshield, so heals rise with attack and her armour is unchanged), `orb_dps` (loaded die +1) and `dps_chest` (coat +10, through a `chest` rule that only follows an override and stands down while the `fight` rule owns the slots). Weapons are left to the chooser so AoE stays on when they stack.

**Targeting the shell.** While a shell is up it is every fighter's first target (`rime_shell_casting()` in each `find_best_target()`, and `shelled_first()` at the head of Riva's list, so it is mark's and supershot's target). Riva picks her shot by the damage landing on the shelled Djinn (`choose_shell_shot()`): the arrow aimed at it plus, with explosion worn, each other arrow's hit × explosion % × its armour when that arrow's target is within splash radius of it, with other targets taken nearest to it first. That gives a plain shot in single gear (a 3shot is 0.7× on it, and the hold puts her in single gear whenever another Djinn nearby is held), and a 3shot in boom gear once two Djinns stand within ~14px of it (~1.26×). Her total-damage chooser kept firing 3shots in single gear.

**Telemetry (`rime_watch`).** Every shell, stomp and server refusal of a stomp goes to the timeline as `rime_watch` (`rime_shell_logger()`). Each shell's line names who damaged that Djinn inside the band while it should have been held (`ledger.held`, by attacker, burn separate). The hold still leaked on 10-10: wipes at 18:06 and 18:21 were each a second Djinn shelling during stomp's cooldown. Read those lines first after the next Djinn wipe.

Each shell also gets two lines when it ends (`log_shell_window()`):
- `shell … <outcome> Nms: total (direct + burn) of need, first hit, stack`
- `shell … by <attacker:source>`

The timeline caps a line at 160 chars. The window runs from the shell's first `entities` packet to the stomp, or to the packet that drops `rimeshell` (`plan.gone_at`). Measuring from the draw-frame sighting missed early hits and counted hits after the break, so stomped shells showed 32–34k and broken ones 26–30k. The outcome comes from that packet's conditions: `broken` (it carries `rimeexposed`), `stomped`, or `gone (…)` without `rimeexposed`, which is the bolt. Counters: `rime shell broken/stomped/gone`. Burn is split out because it is the prime suspect for damage the break does not count. The ability's live `G` entry is dumped once at load (`rimeshell ability …`).

### `Halloween Bosses.js`

mrpumpkin and mrgreen share one encounter, because every rule is the same for both. While either is in sight Ulric wears `single` and `orb_dps` and Riva `single` and `dps_chest` (which also keeps her off cupid). Myras tanks them (`tank`: her fight rule and boss absorb, Healer Equipment and Skills), Ulric taunts them off other players (`taunt`, Warrior Skills) and cleaves with only the boss in reach (`cleave_alone`). Until 2026-10-15 this was `BOSS_GEAR_OVERRIDES` in two Equipment files plus `tank_bosses`, `taunt_bosses` and `cleave_lone_bosses`.

### `Crabxx.js`

The kited boss (its event line is commented out, so the party ignores it today) and the crabx it spawns. While crabxx is in sight Ulric wears `double_aoe` and Riva `boom`, and Myras tanks it. Riva shoots a crabx only once it is on someone (`attack_if_targeted`) and ranks those after bosses, and Ulric agitates when exactly five untargeted crabx are in reach (`agitate_pack: 5`). The kite itself stays generic: any `EVENT_LOCATIONS` entry with `kite` is kited (Movement Positioning, Combat Utilities).

### `Porcupine.js`

Porcupines reflect damage. Ulric never targets one, his cleave and agitate refuse to fire with one within reach (`blocker_within()`, the same check as the other blockers), and he wears his single set while one is within his range + 40 (splash reach). Riva ranks them above everything else, bosses included, and shoots them whenever they are safe to touch, so they die before Ulric has to work around them. This was `Porcupine Guard.js`, a temporary file whose four call sites were `typeof`-guarded so deleting it removed the behaviour; as an encounter it is still removed by deleting its Bootstrapper line, with no guards.

### `Phoenix.js`

The on-demand phoenix hunt. `phoenix_hunt()`, in any character's console, sets the three fighters' farm targets to `phoenix` and remembers what they were (`AL_phoenix_hunt`). `phoenix_hunt_stop()` puts them back, or `bscorpion` for any that was already `phoenix`. `phoenix_status()` shows each fighter's map and goal, the last sighting and kill, and when each post was last checked. Picking `phoenix` as a farm target in ⚙️ does the same, without the restore. Each fighter's `phoenix_tick()` (250ms) switches `home` into and out of `phoenix` live with `switch_home()`, so neither direction waits for a reload. Every other farm target still changes on reload.

**The spawn.** The phoenix is one `randomrespawn` monster (`G.maps.main.monsters`). At every respawn the server picks one of five boxes at random: three on main (east of town 708,−300 → 1668,−86; south 378,1686 → 904,1920; the west strip −1358,−118 → −1010,1680), halloween's minimush box (−166,453 → 182,808) and the cave's (−375,−1287 → 14,−1041). It comes back 32s after it dies, plus under 0.9s (`respawn` 32; the server's death path reads `respawn` ≤ 200 as seconds). It isn't in `S` and nothing announces it, so the only way to find it is to look. It is coop: each contributor rolls its own drop on `share × luck`, and a share is `points^0.65` of the total, so three fighters on it earn more than one. It has 160k HP and hits for 125 magical, so any fighter is safe alone with it. The cave box is also one of mvampire's two.

**Posts and beats.** A client is sent the entities within ±700 × ±500 of it (`B.vision`). So a post in the middle of a box sees the whole box, except the 1,800px-tall west strip, which has two posts (`west_north` at y 320, `west_south` at y 1190). The doors pair the boxes: main east is 550px from the halloween door, main south 650px from the cave door, and the west strip stands alone. So each fighter owns a beat (`PHOENIX_BEATS`):
- Ulric: east + halloween. He is the strongest alone, next to the xscorpions.
- Myras: south + cave, where she can outheal mvampire.
- Riva: the two west posts.

Every post was checked as walkable against the game's geometry. Monster aggro reaches about 64px (a 32px spatial hash, then the monster's range), so a post beside a box isn't pulled into it. Mr. Pumpkin's box is 330px from the halloween post, and Ulric's taunt needs Myras within absorb range, so he never taunts it alone.

**Shared watch.** Each fighter writes what it sees to `AL_phoenix_watch_<name>`: every 500ms, and at once on a kill. The record holds its sighting (id, map, position, when first seen), the last kill it saw, and when it last stood within 60px of each post without seeing the phoenix. It is reloaded from storage at boot, so a reload doesn't forget the last kill. `phoenix_view()` merges the three records, cached for 250ms. A sighting older than 4s, or of a phoenix someone saw die, is dropped. Each record has one writer, so the three iframes never race on a key. A kill is the socket `death` of the phoenix being watched. The death carries every player's coop points, from which the kill record takes the party's share. `kill_credit` isn't used: on a coop kill it arrives before the death and has no points.

**The goal** (`phoenix_goal()`, the spawn encounter's `goal`):
1. In sight: fight it, with `{ local: "phoenix", pursuit: true, event: "phoenix" }`. `pursued_boss()` hands it to Ulric's and Myras's targeting, the pursuit keeps combat running, and Riva ranks it first (`rank`). If no straight line reaches it, travel to it.
2. Within 5s of a kill, with chests on the ground: `phoenix-loot`, a passive `loot` goal.
3. Otherwise: the post of its beat checked longest ago, nearest first on a tie.

A check only counts if it was made after the earliest respawn following the last kill anyone saw, plus a 2s margin, and no check counts while someone has the phoenix in sight. Right after a kill, or while another fighter is killing it, every check is stale, so each fighter goes to its nearest post and waits there for the respawn. Once the respawn is due, the post it stands on becomes fresh and it walks to the other one. So while nobody has the phoenix in sight, the beats patrol. With no kill seen (at the start of the hunt, or after someone else's kill), the oldest check still goes first, so the patrol covers every post.

**The finder kills it alone (10-16).** The first build gathered all three on every sighting. That was dropped the same day because a coop kill pays out about the same total however many of ours are on it. Each contributor's roll is `rate × share × luck`, and the shares sum to 1, so three rolls split one pool three ways. Gold and XP scale with share too. Per kill, what changes the pool is whose share it is: Myras's luck is 1.82 against Ulric's and Riva's 1.19, and her `luck` set (lmace+8, 4,764 attack) is also her strongest against the phoenix (resistance 160). Estimated from the set profiles, with Riva alone = 1.00:

| Who kills it | Kill time | Loot a kill |
|---|---|---|
| Ulric alone | ~47s | 1.01 |
| Riva alone | ~35s | 1.00 |
| Myras alone | ~30s | 1.54 |
| Riva, Myras joining for the last 30% | ~30s | 1.14 |
| All three from the start | ~12s | 1.21 |

Gathering helped only when it was Myras who arrived. Even then it took her off two of the five boxes for the next respawn, which costs a 20–30s patrol leg 40% of the time: about what her late share adds. Ulric and Riva joining each other add no loot. The case that could reverse this is other players on the phoenix: shares are `points^0.65`, so three of ours weigh about 1.5× one against strangers. Each kill record carries `party_share` (our weight over everyone's, with the server's 0.1 floor) and `players` to show it.

**What the hunt turns off** is answered through the `phoenix hunt` spawn encounter's `home_settings`, which follow `home` onto halloween and the cave, where a spawn encounter isn't live:
- `cohesion: false`: `leader_position()` and `party_cohesion_hold()` stand down. Ulric and Riva stop trailing Myras and copying her town teleports, and plan their own town shortcuts.
- `events: false`: no world-boss detours during the hunt.
- `looting: true` and `chest_threshold: 1`: every fighter opens chests, not just Myras. A party chest only reaches members on the map where the monster died, so a kill made before she arrived would otherwise be lost.
- Myras's `aggro_cap: 0`: she pulls nothing while standing watch. The south post is in the croc and armadillo boxes and the halloween post in the minimush box.

The `phoenix` situation encounter is live while one is within 600. It puts Ulric and Riva in `single` and Myras in `luck` (lmace + mshield; her orb is already the rabbit's foot), stops Ulric agitating it, and ranks it first for Riva. Its mob trait `panic_ignore` keeps a phoenix on a fighter out of that fighter's panic count (`panic_ignored_on_me()`, Party Management), on any map. Riva panics at one monster on her (`PANIC_THRESHOLDS.aggro: 1`), so once the finder fought alone she scared the phoenix off and disengaged: 10 panics in the first minutes of 717c6ab. Anything else on her still counts, and low health still panics; the phoenix's 125 magical hit is no threat to a fighter alone.

**Earrings and clover studs.** While any fighter's farm target is `phoenix`, neither seller vendors `vitearring` (`phoenix_keeps()`, inside `vendorable()`). The fighters ship them to Riff, who banks them. `COMBINE_PROFILE.vitearring` compounds them to +2: cscroll0 at +0 (99%), then cscroll1 at +1 (75%, raised to 91% as a grade-above scroll). `craft_targets()` always lists `cloverstud` ahead of the ⚙️ craft target, and skips it while any ingredient is short. The recipe is vitearring+2, a verdantcore, 40 ashleaf, 40 spores, 5 gslime and 280k gold. On 10-16 the bank held 263 verdantcore, 20,554 ashleaf and about 1,250 spores, but no gslime. No NPC sells gslime, goos drop it at 1 in 1,000, and it is on `SELLABLE_ITEMS`, so no stud gets crafted until Slime Cores are bought in. After the hunt, the +0s already banked are still compounded, and the +2s wait for the craft.

**Measured.** Each fighter that sees a kill archives a `phoenix` record to `phoenix.jsonl`: the id, the post, `found_s` (from the earliest respawn to the first sighting), `kill_s` (from the first sighting to the death), `party_share` and `players`. The first 7 minutes live (gathering build, 10-16 16:33) made 7 kills, a median 9s search and 27s from sighting to kill. Myras panicked five times on the way to gathers ("8 on us while travelling"), which the solo rule takes away. `python "Tools/Data Store.py" phoenix` gives kills per hour of hunting (from Myras's ledger windows at home `phoenix`), and per post the median search and kill times and how many fighters were there. `loot` gives the phoenix's drops per chest. The ledger counts all five boxes as the farm spot (Farm Ledger → at the spot vs away).

---

## Core Systems

### `Global Config.js`

Awaited first, together with `Widget Helpers.js` and `Game Log.js`, so everything may assume it. It holds:

- core config and constants, party constants (including `DUNGEON_PARTY`), and the shared fighter config defaults
- `farm_target_for()`
- the party state cache reader (`read_state_cache()`), over `Kernel/Storage.js`
- the no-op `errlog_*` stubs, plus stubs for the one-role-only `request_delivery`, `model_prediction`, `get_character_state` and `upgrade_slot_for`
- the `var` declarations of every cross-character symbol (`home`, `destination`, `CONFIG`, `cache`, `ITEMS_TO_KEEP`, `EQUIPMENT_RULES`, `PANIC_BROADCAST_TARGETS`, the panic flags), so no reader needs a `typeof` guard. Several are filled in only by the fighters, and the merchant keeps the defaults. They are `var` because the role files re-declare the same names through indirect eval, which a lexical declaration here would collide with. Declaring them here changes no ownership: `Party Management.js` is still the only writer of the panic state, and each role's config of its own.

### `Movement Goal.js`

The two movement owners are `movement_goal()` (where to go: the one priority list) and `movement_local()` (where to stand). The machinery they drive is the travel arbiter (`Travel Arbiter.js`), `smarter_move()`, `walk()` and the route resplice (`Movement Manager.js`), the town shortcut (`Town Shortcut.js`) and the stuck escape (`Stuck Escape.js`). They were one 934-line file until 10-16 (Overhaul 6.1). The split moved code without changing it, except that the town cast became one helper (`town_teleport()`) and the arbiter compares its counted failures at the call, so no file reads another's constants at load.

**Locals are looked up, not chained.** `movement_local()` finds the goal's `local` in `LOCAL_STEPS` (step, trail, passage, wait, evade, kite, event, loot, keep), then in the encounters' `steps` (`encounter_step()`), and otherwise falls back to the role's farm step. So an encounter brings its own positioning, as bscorpion brings `camp`, and core movement doesn't name it. `kite` stays in core: it's World Events' generic answer to any event with a `kite` ring in `EVENT_LOCATIONS`, of which crabxx is today's only one. A goal that's a fighting position says so with `fight: true`, which keeps combat running (`should_pause_combat_loop()`) and takes the party out of formation (`party_in_formation()`), as the camp check did by name.

### `Travel Arbiter.js`

**Escalating to the town edge.** The arbiter counts a goal's failures (no path, timeout, stall, a search over 60s). On the second failure, with nothing targeting us, it re-issues the journey with the pathfinder's town edge on. That is `smart.use_town`, set only for that journey and cleared when it ends; the BFS reads it at every node.

**Drift.** The drift that re-issues a journey scales with the distance left (30%, never under 80px) and ignores a cross-map target's coordinates. Re-searching every 3s for a leader moving 1500px away kept followers standing in searches.

**Parked routes.** A hold or a local goal parks a route that was already found (`travel_park()`: the current leg's end plus the remaining plot) and stops the character. When the same goal (same label and coordinates) comes back, the route is re-armed through `smarter_move`'s `plot` option (`travel_parked_plot()`, counted as `travel resumed parked route`) instead of being searched again. Every cohesion hold used to cost a full search on resume. While the window is visible, the game's pathfinder works 40ms in every 80ms, and the character stands still with the "Hmm…" bubble the whole time. A parked route whose first node is a door is re-armed only beside that door (`is_door_close()`), and a route that starts with a town node is never re-armed.

**Released journeys.** A journey the arbiter released itself is re-issued at once, not after the 3s floor.

**Passive goals keep a search alive.** A search is not parkable, so a local goal that releases it throws the work away. A `passive` local goal (`boss-loot`, `await-town`) leaves an unfinished search of ours running instead; once found, the next tick parks it as usual. `boss-loot` coming and going with the chest count threw a 20s cross-map search home away four times in a row on 10-11 10:55. `movement_local()` stays silent for a passive goal while the search runs, and the runner still loots under it.

**Journey cap.** `TRAVEL_JOURNEY_TIMEOUT_MS` is 300s. At 90s the walk home from halloween timed out twice on 10-11 with the followers in formation the whole way, and each timeout counted as a failure toward the town escalation.

### `Movement Manager.js`

**Native search failure.** A native search failure reaches `smarter_move` through `smart.on_done` and settles the journey as `no path` on the spot. It is told apart from the native `smart_move` re-entering (its own "Lost the path" recovery, or `stop()`) by state, not reason: `bfs()` clears `smart.moving` before calling `on_done`, the re-entry calls it while `smart.moving` is still set, and after one recovery the native closure drops the reason altogether — reading the reason produced the spurious `"home" failed (no path)` of 10-11 10:29. Settling on failure is the way out of walled pockets like the ice golem landing. The stuck escape behind it skips only real instances and the cave.

**Route resplice.** `route_resplice()` runs ahead of the game's `smart_move_logic` (wrapped by name; the game's 80ms interval calls it by global lookup). When the next node is out of line of sight it continues from the first later node in sight, up to 12 ahead, so the game's "Lost the path" (a full re-search) is the fallback rather than the rule. 10 of the 13 lost paths on 10-11 were one two-minute chain on winter_cove, a search every 5–10s.

**`walk()`.** Every local step goes through `walk()`, which is `move()` behind the game's `can_walk()`. A bare `move()` within 8s of a door transport, or while disabled, rejects with `unable`. The follow steps fired through a door crossing were the `unhandled_rejection` lines of 10-10.

Why the native town edge is not used is in [`Game API Reference.md`](Game%20API%20Reference.md).

### `Town Shortcut.js`

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

### `Combat Utilities.js`

Monster and entity queries (`monsters_matching()`, `monster_counts_near()`, `get_num_chests()`), boss and party state predicates (`is_coop_boss()`, `find_active_boss()`, `boss_engageable()`, `should_pause_combat_loop()`), and the lethal-monster rule.

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

- the game's own `damage_multiplier(defense)` (called directly since 10-16; the hand-ported copy behind it never ran in the client), `heal_delivered()`/`heal_useful()`/`partyheal_base()`, `burn_multiplier_at_dps()`, `splash_bonus()`, `time_to_kill_ms()`, `crit_multiplier()`
- `skill_mp_cost()`: the server's `mp × (100 − mp_reduction)/100`. Never read `G.skills.X.mp` raw.
- `incoming_dps()`/`projected_hp()`/`endangered()`: the game client's own estimate of what the monsters on someone deal

### `Combat Sampling.js`

Hit and heal telemetry, self-starting at load: the `hit`/`action` socket samplers and the damage/heal windows they feed.

**Each damage window belongs to one weapon pair.** A hit goes to the pair that fired it (by `pid`), or the pair worn when it landed. A burn tick carries no `pid` and lands seconds after the hit, so it goes to the burn-capable pair (an item with `ability: "burn"`) that last hit that target, kept for 10s after its last tick; a tick with no known burner is counted, not credited. `worn_s` is the time the pair was actually worn in the window, sampled every 250ms; `secs` is the window's wall time. Before 10-16 every tick went to whatever was worn when it landed (a mace with no fire showed burn/direct 0.70, `burn_mult` reached 8033), windows with only burn were dropped, and two pairs swapped within 15s both claimed the whole window, so the `weapons` report reads only records with `worn_s`.

It also keeps the party's in-flight damage ledger. Every fighter's `action` is recorded by `pid` (after the target's armour, or resistance for Myras, × 0.9) until its `hit` lands or its `eta` passes. `remaining_hp(mob)` is what targeting, `would_kill()` and Riva's skills read instead of `mob.hp`.

### `Boss Profiler.js`

A per-fight profile of every player on a cooperative boss (`is_coop_boss()`) in sight, ours and strangers. It reads the `action`/`hit` sockets and a 1s sample of each player entity.

**What is measured.** The server sends strangers `attack`, `frequency`, `range`, `speed`, `armor`, `resistance`, `level`, `s`, `slots` (full items) and `pdps`, but never crit, piercing or explosion, so those are measured from hits. The profile covers actions by type, damage by source (burn/splash/skill), crit rate and multiplier, burn procs, sugar rush, damage taken from the boss, buff and weapon time-share, distance and gear. Each fight also records the boss's own condition uptime (`boss_conditions`: marked, cursed, burned …) and each player's share of samples under 20% MP (`mp_low_pct`).

**Coop points are not damage.** The server also gives `0.25 ×` the boss's raw hit on a player (tank points) and `1.8 ×` net heals on coop fighters, with `× 5` on the character's home server and `÷ 4` with `hopsickness`. So `coop_per_explained` (coop gain over boss damage + tank points) shows which of these is moving a player's score.

**Output.** One `boss_profile` sample per fight per fighter (Riff doesn't profile: he is never on the boss) when the boss dies or has been out of sight 15s, plus a `📊` boss-dps line in the game log. The sink appends every one to `boss_profiles.jsonl`, since samples in `errors.json` age out in 2h. `al_boss_profiles("makiz")` reads the last 10 in the console.

### `Targeting.js`

`score_targets()`/`select_target()`: the one scorer every character picks targets with. Damage is valued with `context.gear` (attack, frequency, explosion, apiercing, burn chance) when the caller passes one, otherwise with the live gear. Ulric passes his swing set's measured profile (`swing_gear()`). The live cache refreshes every 50ms and often caught him mid-swap in candy canes or the bataxe, scoring every target without splash or burn.

**Farm focus.** At a clumped spawn (the targetron-sparkbot encounter's `farm_focus` setting) the party stacks its damage amplifiers on one monster: Myras curses it (+20% damage taken), Riva marks it (hunter's mark; her supershot follows the same target) and Ulric swings at it, while splash spreads the rest across the clump. Myras chooses (`choose_farm_focus()` in her `update_cache()`): the current focus while it lives, is in curse range and is on a party member, else the highest-HP monster on a party member, so the debuffs go where they have the longest to pay. It is held until it dies, because "highest HP" re-evaluated each tick would jump to the next full-HP monster the moment the first is hit. One character decides and writes the id to localStorage (`AL_farm_focus`, only on change) so the three never latch different monsters; the others read it with `farm_focus()`. Riva's attacks and multishots are untouched, only her mark. Unlike `dungeon_focus_target()`, which also redirects Riva's shots, this never narrows anyone's attacks to one target. Her curse only goes on the focus while there is one, which also covers both monster types: the generic curse only considered monsters of the farm target's own type.

### `World Events.js`

Live boss and seasonal targets, and the goal that walks the party to them.

**Toggles.** `best_event_target()` skips any boss whose ⚙️ Bosses & events box is off (`setting("boss_<name>")`). It is the only reader: the other `EVENT_LOCATIONS` lookups are fight rules and apply whenever the boss is near.

**When the boss strays.** Pursuit stops when the boss strays from its spawn area (`boss_strayed()`), and the event goal falls back to the walk to its spawn point. That is a non-pursuit `disengage` goal, so the party waits there together under cohesion. It used to return `null`, which sent Myras `home` mid-fight while the followers pursued the boss on its return.

**Pursuit.** Pursuit bypasses following and cohesion: each fighter closes to its own range. For an entry with a `spot` (franky: -19,36), every fighter first walks to within 50px of the spot while the boss is within 100px of it, then fights from there; Ulric's `engage_step` takes over inside that radius. The spot keeps the party together and away from the oneeye pen. `party_cohesion_hold(event)` does not hold for a follower whose goal is the same event.

**One stand point.** The pursuit goal and the step it hands to aim at the same place, `event_stand_point()`: the spot while it applies, otherwise the role's `engage_point()` (Global Config's default is `range × EVENT_REACH` short of the boss, and Warrior Movement overrides it with his 12px hitbox gap). The goal stays local, so `event_step()` owns the movement, while the fighter is in range, can walk straight to that point, stands within 20px of it, or stands within 60px of the event's place. Only when none of these holds is it a journey, and the journey goes to the event's place (`event_place()`: the entry's `spot`, else its `x`/`y`), never to the boss. A straight line to the stand point is what verifies the boss's position: it is recomputed from the fighter's live position and the boss's reported one every tick, so as the journey closes in, the step takes over and re-aims each tick, and the arbiter ends the journey before the step's first move. Join events without a spot journey to the boss itself, since `join` lands the party beside it.

The pathfinder must never be sent to a position the client reports for the boss: that position can be one the pathfinder cannot reach. At 20:18 on 10-15 Riva's and Myras's clients placed a moving mrpumpkin at about (−312,517), 50px north of its spawn box, while Ulric's placed it at (−400,614). The game's own search, run over the same map data, finds no route to that point from the landing, the spawn or the fight spot, and both stood re-searching at halloween's spawn for 50s. Why their clients placed it there was not established. Sending the journey to the stand point (da48aeb) failed the same way at 20:07 on spookytown: from 700px out, their point 80% of range short of mrgreen, back along the line toward them, landed behind a wall. Both spots, mrpumpkin (−217,720) and mrgreen (605,1000), are reachable from every position either character was stuck at. Until 2026-10-15 the goal tested a straight line to the boss's *centre* and sent the journey there with a radius of `range × 0.8` while the step walked to the stand point. A boss whose centre sits against a wall then turned Ulric's approach into a journey he could never finish: mrpumpkin's hitbox is wider than his 34px radius. The drift rule re-searched it every 3s, which gave 51 pathfinder searches with him within 40px of a live boss over 10-10..10-15.

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

The one file that changes what is worn: equipment sets, the single `batch_equip()` emitter, the slot arbiter, the shadow-inventory planner (`equip_plan()`/`emit_equip_ops()`) that resolves a chain of sets ahead of the server's acks, `equip_burst()`, and the rules resolver.

**Slot intent.** Every swap sent is recorded per slot for 1.5s (`slot_in_flight()`/`slot_intent()`), and `is_set_equipped()` reads that intent. So the rules loop never re-sends a swap from a stale inventory view; re-sending used stale indices and flipped the orb straight back.

**Reply alignment.** `emit_equip_ops()` queues a reply deferred for every op so the server's FIFO replies stay aligned.

**The sent view.** Every planner (`equip_plan()`, `batch_equip()`) starts from the sent view (`equip_view()`): the inventory the server will hold once every equip/unequip we have sent is answered. It is counted off `game_response` replies per event (the server sends the `player` update before the reply), with a 1.5s backstop. A bare `place: "equip"` reply only counts when `failed` (the failed form of an `equip_batch`). Potions are answered under `equip` too, and counting them settled swaps that had not landed. Matching the live inventory is no landing signal, because a swap and its restore end where they started.

**Unequip lands where the server says.** `equip_batch` swaps in place, but `unequip` puts the item in the server's first empty bag slot, and party chest loot fills that same slot at any time without the client knowing yet. The server equips whatever is at the index sent, and for `slot: "offhand"` it moves a non-weapon to its own slot (`can_equip_item()`). So restoring Ulric's offhand from a guessed index after a cleave or stomp (bataxe and wbasher are two-handed) once equipped a looted int amulet and a pumpkin helmet. His real ones, in no set, were then shipped to Riff. `shadow_unequip()` now marks the item `guess`. `best_copy()` will not pick it until the unequip reply (the `player` update arrives first) shows it at that index (`settle_landing()`). A miss is counted as `unequip landed elsewhere`.

**A restore waits for the landing.** A plan that wants an item still landing says so (`landing`). A burst restore planned in that state is parked (`burst restore waited on landing`) and sent once every unequip is answered, with a 1.5s backstop, so both hands go back in one `equip_batch`. It used to restore what it could at once and leave the offhand to the rules loop. That loop runs on its own tick, so every cleave or stomp restored the mainhand and then swapped the offhand separately. With no candy hold (sugar rush up) the offhand sat empty for that whole tick: a fireblade unequipped to nothing on every cleave. Most candy holds are under 100ms, shorter than the reply, so it happened on almost every burst. The server charges `penalty_cd` per item sent, not per batch, so one batch costs the same penalty as two; the wait only delays when it starts, and the reply (~200ms) is usually inside the free hold.

**Which copy.** `best_copy()` picks the bag copy for both planners: the set's exact level first, then its lock, and never a copy below the set's level (one above is equipped with a warning, the upgrade case). A set without a `level` takes the highest. It used to try level 0 first, so every sugar-rush burst put a freshly looted +0 candy cane in Ulric's hand. That copy was on `SELLABLE_ITEMS`, and the sale landed on the bag index the real weapon had just been swapped into.

**Bursts.** A skill that needs other equipment borrows it through `equip_burst({ owner, priority, arm, between, then, hold, restore })`: claim the slots (skill priority unless given), send the `arm` swap, run `between` (the skill), send `then`, and send the `restore` swap either at once or after `hold` ms (later if it waits on a landing). `restore` is a function, called when the restore is sent and planned on the sent view at that moment, so it puts on whatever the chooser wants then rather than what it wanted before the skill. It returns the planned arm (its `ops` say whether anything was swapped), or null when the slots are held at equal or higher priority. The claim is what stops the rules loop from swapping back mid-burst. `equip_claimable()` lets a caller check before doing work the claim would waste.

**Swap penalty.** Each item equipped adds 120ms of the server's `penalty_cd`, which is added to the next skill or attack's cooldown. So a swap belongs *after* the skill it serves.

**Overrides.** Every resolver asks `encounter_gear(group)` before its role default: the live encounters, highest tier first. The rime shell hold and a boss in sight (situation), then a porcupine nearby (hazard), then the spawn of `home` (spawn). Until 2026-10-15 this was `gear_override()` over `RIME_HOLD_GEAR`, `BOSS_GEAR_OVERRIDES` and `MONSTER_GEAR_OVERRIDES`.

Ulric's porcupine weapon used to be checked before the rime hold and boss gear. Now it comes after them; a porcupine never meets either (desertland against winter_cove and the boss maps).

Ulric and Riva wear their single-target sets (and Ulric's loaded die, Riva's coat) on mrpumpkin and mrgreen, which also keeps Riva off cupid there.

### `Equipment Valuation.js`

What each set is worth: ability procs, measured set profiles, damage maths, and the one weapon chooser (`resolve_weapon_set()`/`set_damage_value()`) every fighter uses. It returns names and numbers and equips nothing.

Set profiles pause (they are not reset) while a skill claim is held or a swap is unanswered (`equip_transient()`/`equip_pending()`), so the per-swing candy-cane swap does not starve them. They record only from the items actually in the slots (`set_worn()`), never the intended set. A profile taken from candy canes still in hand once valued `double_aoe` without its explosion, and the chooser then never wore it again to correct it. Profiles carry `schema: SET_PROFILE_SCHEMA`; one without it counts as unusable and is re-measured.

### `Party Management.js`

Panic and its broadcast (`set_panic()` is the only writer), party invites, and where home is. `scare_off()` sends the jacko swap and the scare in one burst (`equip_burst()` arms `panic`, then `fire_scare()`), claimed at panic priority so nothing outranks it, the same pattern as cleave. It never waits for the rules loop to put the orb on first.

**Monsters on us.** `monsters_targeting_me()` is the server's `character.targets` (since 10-16; before, a scan of `parent.entities`). The server counts every monster targeting the character, including ones out of view, so panic, Myras's pull cap, the town shortcut, the stuck escape and the travel arbiter's town escalation all see a chaser the client hasn't drawn yet. On the 25 live fixtures the two counts were identical, so the difference is only ever off-screen pursuers. It is a behaviour change, measured with `compare` after the reload that ships it.

### `Loot Management.js`

`loose_loot()` (what we keep, ship to the merchant, or vendor), bank withdrawal, and chest looting (`should_loot()`/`handle_looting()`, driven by each character's `CONFIG.looting`, unless the home's encounter answers `looting` or `chest_threshold`: the phoenix hunt has every fighter loot from one chest).

**Chests per pass.** A pass opens every chest on the ground up to `max_chests` (50), and never more than the call-cost headroom below `COOLDOWNS.cc`: `(160 − character.cc) / 1.2`. Each `open_chest` costs the server 1 call plus 0.1 for each of the two player resends it triggers (`server.js`: `call_modifier` 0.1), against a limit of 200 per 4s that disconnects with `limitdc`. `character.cc` is only refreshed by the server's player data, so it doesn't rise during the burst: the cap has to be counted before the loop, not checked inside it. Until 10-16 the cap was `chest_threshold × 5` (15). At 50 chests a burst is about 60 call cost, and Myras ran at 50–76 when measured, so normally the full 50 fit; started near the 160 gate, an uncapped 50 would have reached about 220.

On a `kite` goal it runs alongside the orbit step instead of in place of it (World Events → kiting).

**Reserved gear.** `reserved_gear_slots()` ranks every copy of a set item, worn and bagged (locked first, then level), and keeps the top N, where N is how many slots the sets wear it in. Bag copies in that top N are never shipped or sold. It used to count a slot as covered by any worn copy of the name, so a junk copy in the hand made the real one in the bag look spare.

**Dungeon keys.** `dungeon_protected_keys()` keeps only the key of the dungeon being run: `active_dungeon()`'s, plus the one `dungeon_choice()` resumes after a dreams visit, so crypt keys survive the interlude. Every other key ships to Riff like any loot. Until 10-16 every dungeon's key was kept at all times, a leftover of the crypt loop, so keys piled up on the fighters while they farmed. A run still tops up from the bank on start (`min_keys`), so a key shipped while no dungeon ran is withdrawn when one starts.

**The hand-off loop.** `handoff_tick()` runs every 100ms on every fighter, on its own loop, and does both jobs: it vendors every `vendorable()` item from any index, and while Riff is live on the map within 250px (400px for 15s after `send_to_merchant()`, the dungeon collection and the `send_loot` message) it ships the rest of `loose_loot(LOOT_THRESHOLD)` and the gold over `LOOT_GOLD_RESERVE`. A vendorable item is never shipped: selling needs no Riff. Each `send` and `sell` is one call-cost, so a tick sends at most 4 and stops at `COOLDOWNS.cc` (160), the line looting, the equip rules and Ulric's swing trick already stop at. Ulric runs at 125–135 per 4s, so a full bag ships in a few seconds. Nothing is awaited: each index sent is remembered for 2s, or until the slot no longer holds that item, so a slow reply never sends it twice and a lost one only delays the retry. A `send_no_space` stops shipping for 5s. Failures are counted as `hand-off failed: <reason>`.

**Waiting out swaps, per index.** An `equip_batch` moves the worn item into the bag index it took from, and the client sees that only when the reply arrives. The server handles our messages in order, so a `sell` or `send` sent now acts on the sent view (`equip_view()`), not on `character.items`. An index is handed off only when both agree on the item there, which means no swap in flight touches it. Before 10-16 the whole pass stood down while any swap was in flight (`swap_in_flight()`), and with Ulric swapping on every swing and Riva switching bows, that was most of the time: selling every 5s and sending 150ms apart from the 2s maintenance tick mostly found a swap in flight, skipped the item, and Riff had walked off before the next pass. `send_to_merchant()` also awaited each `send_item` in turn, and the game's deferred promises never time out, so one lost reply would have blocked every later hand-off until the next reload.

`inventory_sorter()` keeps `item_order` items on their bag slots. It waits out any swap in progress and moves through `inventory_move()`, so the sent view sees every move. Sorting from a stale inventory mid-swap moved the fireblades out from under the restore and left Ulric in candy canes.

### `Maintenance.js`

Potion drinking and restocking, and the periodic tab reload. HP and MP potions (and the regen skills) share one cooldown, so `potion_loop()` drinks at most one per tick, MP first while panicking without the mana to scare.

**Potions are timed from our own send.** After a drink `potion_tick()` waits the potion cooldown (`G.skills.use_hp.cooldown`, 2000ms) plus `POTION_MARGIN_MS` (50ms), counted from when it sent the drink. The server starts the cooldown when the request arrives, and our sends arrive with the same latency each time, so this is the server's own clock. The client's `is_on_cooldown("use_hp")` is not: the server reports the cooldown with `eval pot_timeout(2000)`, which arrives a round trip after the drink, so the client's cooldown ends about one ping after the server's. Gating on it (10-16, 09b6ef2) drank every ~2.3s instead of ~2.05s, and the delay was visible within minutes; the game's own `reduce_cooldown()` comment says the same thing about ping. The margin covers jitter in that latency; a send that still arrives early is refused (`not_ready`, under `place: "equip"`) and the next try is one cycle later. The thresholds (`mp_threshold`, `hp_threshold`, HP first under 50% unless the scare's mana is short) are ours; the game's `use_hp_or_mp()` drinks at any deficit and isn't used. `potions_drunk` (the ledger's potion counts) counts a drink when the server confirms it with `eval pot_timeout(...)`, not when it is sent, so a refused send isn't counted.

Regen is never worth casting: it shares that cooldown, locks it for twice as long, and is what `use("hp"/"mp")` already falls back to with no potions.

### `Party Cohesion.js`

Cohesion only: `follow_goal()`, `party_cohesion_hold()`, `leader_position()`, `behind_on_xp()`. It is a service `movement_goal()` consults and decides no movement itself.

**Off when home says so.** `cohesion_on()` is `encounter_home_setting("cohesion", true)`. When it is off, `leader_position()` returns nothing and `party_cohesion_hold()` never holds. Following, the town-teleport copy and join, the stuck-escape exemption and the follower's pursuit hold all read `leader_position()`, so the whole convoy stands down at once and each fighter moves on its own goal. The phoenix hunt is the one home that turns it off.

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

### `Character Messaging.js`

**The party state cache.** Each character writes a small record to localStorage every 500ms (`AL_char_state_<name>`; skipped when nothing changed, and rewritten at least every 5s), and `read_state_cache(name)` reads a teammate's, treating it as gone after 15s. All four pages run in one browser, so this is instant and free. It exists because the game tells a character little about its teammates: a teammate in view on our map is live in `parent.entities`, but `parent.party` has no HP and refreshes positions only every 60s (not on a map change), and nothing native carries bot state (Game API Reference → Party). The record holds what readers need from a teammate out of view (map, `in`, x, y, rip, hp, mp, level, xp, gold, cave run, town channel) and the bot state no native source has: goal, formation, disengaging, surge and stomp timing, free, loose and ship slots (`ship_slots`: what the hand-off still has to send Riff), and `mluck_until`, an absolute time, so a reader doesn't depend on the record's age. It dropped `name`, `moving`, `speed`, `max_xp` (it is `G.levels[level]`), `paused` (read the `AL_automation_paused_<name>` key with `automation_paused(name)`) and the whole of `character.s` on 10-16.

**Reading a teammate: `party_state(name)`.** The cached record, overlaid with the live entity whenever `get_player()` sees the teammate on our map: position, `going`, speed, rip, HP, MP, level, XP and the town channel come from the entity, and `live: true` marks it. Readers of position or HP use it (cohesion holds and danger, the healer's `fighter_down()`, the leader's position, the danger log's party HP, the ledger's who-is-at-the-spot, the survey's death count, Dreams' and the dungeons' entry checks, Party Frames and Riff's delivery); readers of bot state alone (goal, cave run, `in`, surge and stomp timing) read the cache. Before 10-16 `leader_position()` and `dreams_member()` each merged the two their own way and the rest read only the cache, up to 500ms old at a close call. A page that has stalled but whose character is still in view now counts as present.

**Messages between characters.** `send_cm()` already goes over localStorage between pages in the same browser (`is_character_local()`), and over the server only when the receiver's page has stalled. `cm_dispatch()` is the game's `on_cm`: it runs every listener and the `CM_HANDLERS` entry for the message type, each isolated through `catcher`, because the game calls it outside the kernel. It no longer passes the message on to the runner's default `on_cm`, which only wrote "Received a code message from: X" to the game log (seen live on 10-16).

**`send updates`.** Every 20s each character asks the server to resend every entity's position (`send_updates` → `send_all_xy`, 12 call cost), which corrects drift in the client's copy of monster and player positions that targeting and movement read. It has been there since 2025-07 with no recorded reason; it is cheap, so it stays.

### `Character Runner.js` (the action runner)

`run_action(action)` is one pass of a role's action loop, started by `start_action_loop(action)`. The preamble is shared: the gate (`combat` returns 100ms while paused, `alive` doesn't stop, as Myras heals through panic), 50ms while disabled, `update_cache()`, the role's `before` (Myras's and Riva's temporal surge, 100ms when it fires), and a caught error retries at `TICK_RATE.retry`. The role's `act(ms)` gets the attack cooldown and chooses one basic action through `run_basic_action()`; it returns a delay, or nothing for the role's cadence (`WARRIOR_ACTION` and `HEALER_ACTION` 10ms, `RANGER_ACTION` 5ms; why, in `Scheduler.js`, loop rates).

### `Skill Runner.js`

`run_skills(table, context)` is one pass over a role's skill table (`WARRIOR_SKILLS`, `HEALER_SKILLS`, `RANGER_SKILLS`, each in that role's Skills file). Each entry is `{ name, gate, wanted, cast }`, taken in order: the gate, then `wanted(context)`, then `await cast(context)`, all inside the entry's own `catcher` under its name. One skill throwing no longer skips the skills after it.

**The gate is per entry.** `combat` skips the entry while `should_pause_combat_loop()` holds (asked once per pass, at the first combat entry). `alive` is no gate beyond the tick's own preamble. Myras's party heal is `alive` on purpose: her heals are what the party survives panic on. The tick keeps its preamble (Ulric's and Riva's return 100ms while paused, every role 250ms while disabled), so the cadence is unchanged.

**Context is what the tick worked out once.** Ulric's tick passes the tank. The old tick read `cache.tank_entity` once and used it across the awaited agitate and taunt, and the context keeps that. Myras's tick passes the swap penalty it read before the heal, which absorb is gated on, as before. Her mana-for-luxuries check is now read when dark blessing is decided, after curse and absorb, instead of straight after the heal: the one place a skill now sees fresher state than it used to. Cooldown and mana checks stay in each entry's `wanted`, because they differ on purpose: dark blessing keeps no panic reserve, and a stomp on a Rime shell spends it. The zap loop keeps its own cadence (`Scheduler.js`, loop rates) and runs a one-entry table, `ZAP_SKILLS`. Riva's tick picks the target and reads both cooldowns once, then passes `{ target, allowed, ms_hunter, ms_super, committed }`. Mark and supershot both count `committed` mana against her reserve, so a pass never spends past it.

### `Experiments.js`

Overhaul 4.6, the bridge from data to changes. A setting under test is read through `experiment_value(name, fallback)`. With nothing in `EXPERIMENTS` (as shipped) it returns the fallback, exactly as before. An entry `{ variants: { label: value, ... }, block_min }` alternates its variants in blocks of the wall clock (30 minutes by default), so all three fighters run the same variant at the same time without coordinating. Alternating within one session cancels time-of-day and server-population drift, which comparing one build's day against another's cannot. Every record carries `variant` (`name=label`, through the record context). A ledger window also keeps `variant_start`, and `Data Store.py experiment NAME` counts only full windows at the spot that started and ended on the same variant, then judges the first two variants with `compare`'s bands. **Running one is a behaviour change at the farm, so it needs the user's go-ahead.**

### `Settings.js`

The registry behind the ⚙️ window: every setting's name, storage key, section, type and default, read through one `setting(name)`. It decides **what** the bot does (which farm, which bosses, which dungeon, whether to run the daily cave, what Riff does and exchanges). **How** it does it (thresholds, weights, timings, gear) stays in each file's `CONFIG`, where Design Notes can explain the numbers.

- **Defaults are what the code did before.** A setting with no stored value reads its default, so moving a hard-coded choice into the registry is a pure move: all goldens held when the merchant toggles, upgrade and craft targets and exchange list moved (2026-10-15). The old storage keys were kept (`AL_target_<name>`, `AL_merchant_*`), so nothing migrated. New settings use `AL_setting_<name>`.
- **Read live.** Every reader calls `setting()` at the decision, never at load, so **Save** applies at once on every window (localStorage is shared by all four). The exception is the farm targets: `home` is set when the role file boots, so they apply on the next reload, and their section says so.
- **A stored value that no longer fits reads as the default.** A number outside its range or a select value missing from its options (a farm target dropped from `LOCATIONS`, a removed boss) falls back, so a stale key can't send anyone somewhere the code no longer knows.
- **Stamped on every record.** `settings_stamp()` lists the settings that differ from their defaults (`boss_franky=0,dungeon=crypt`) and rides on every record through the Error Log's record context, next to `variant`. `Data Store.py` keeps it as a `settings` column, and `compare` warns when A and B ran with different settings, because a toggled boss or a dungeon changes the farm without a commit. Records from before 2026-10-15 have no stamp and are left out of that check.
- **The sections.** Bosses & events is one checkbox per `EVENT_LOCATIONS` entry (on by default), read only by `best_event_target()`: a disabled boss is never walked to, but one that walks up is still fought, and its hazard rules (`avoid`, leash, kite) still apply. The commented-out entries (icegolem, crabxx, wabbit) aren't listed until they are uncommented. Dungeons is the dungeon choice (`choose_dungeon()`: one of crypt or spider; switching straight from one to the other is refused, so choose none first; choosing none finishes the run in flight, and choosing none again stops at once). It replaced the ⚰️/🕷️/🌙 toolbar buttons on 2026-10-15 and the daily-cave toggle (see `Dreams Cave.js`). Exchange lists every item the game marks exchangeable (`G.items[name].e`, which is also the count an exchange needs, so seashell's 20 comes from the game), the 11 previous targets first and on.
- **Adding one:** an entry in `settings_registry()` with today's behaviour as the default, the reader at the decision, and nothing else. The window builds itself from the registry. `al_settings()` in the console lists every value and marks the ones that differ from the default.

### `Decision Log.js`

Overhaul 4.3 and 4.4: what each fighter chose and what came of it, summed per ledger window and archived as one `decisions` record beside the ledger record. The ledger's `ledger_close()` emits `ledger_window` on the bus, and the decision window closes on it, so the two cover the same seconds. The recorders follow the `errlog_*` contract and never throw into their caller.

| Field | Source |
|---|---|
| `casts` | every `skill_timeout` the server sends (`consume_skill()`: one per cast that started a cooldown, named by its cooldown group, so 3shot and 5shot count as `attack`), with mana and the swap penalty the server added (each item an `equip_batch` equips adds 120ms to `penalty_cd`, which the next cast pays, up to 10s). The server also sends `{name: "attack", reason: "attack_ms"}` whenever attack speed changes, which is on every weapon swap; it is not a cast and is skipped (before 10-16 it was counted, and Ulric's confirmed attacks read 2.7x his real ones) |
| `values` | the skill runner, when an entry with a `value(context)` cast (its `next_skill` changed): the value it was cast for. Riva's mark (`mark_value()`) and supershot (`supershot_value()`) |
| `actions`, `pulls` | `run_basic_action(p, label, target)`: each basic action by label. A pull is an action on a monster that had no target, and `pulls` counts them by how many monsters were already on the puller (`monsters_targeting_me()`, capped at 10) |
| `bursts`, `gear`, `panics` | `equip_burst()` by owner and ops sent, `apply_equipment_rule()` by group and sets, `set_panic()` by reason |
| `outcomes`, `taken` | every `hit`: by this character per `source` (damage, hits, kills, misses, `avoid` counting as a miss), and on it (damage, hits, biggest, by monster). A monster's damage return (`dreturn`, carried on our own hit) is damage taken from that monster; a reflected shot already arrives as a hit on us. The Danger Log counts both the same way. |
| `worn_s`, `goal_s`, `panic_s` | a 1s sample of the weapon pair worn, the goal label and panic |
| `mana_in`, `hp_in` | mana and HP coming in (10-16): `potions` is the part of each confirmed potion that fit (what the bag's last potion of that kind gives, the one the server uses, capped by what was missing when it was sent) and `potion_waste` the rest, through the bus topic `potion` from `Maintenance.js`; `manasteal` is the `manasteal` on our own hits; `mp_start`/`mp_end` are MP at the window's ends. Nothing else feeds MP, so mana out is in minus the change in MP, exactly. `casts` prices skills, but not attacks: `skill_mp_cost("attack")` is 0 (the server charges `character.mp_cost`), and Riva's 3- and 5-shots arrive under the `attack` cooldown group |
| `attack` | a 1s sample (10-16): `frequency` summed over `samples` (so mean attacks per second is `frequency / samples`), `in_range_s` (alive with a monster in attack range) and `ready_idle_s` (in range with the attack off cooldown at the sample: time an attack could have gone out and didn't). Confirmed attacks (`casts.attack.n`) against `frequency / samples × window_s` is the attack uptime |

A ring of the last 50 decisions (casts other than `attack`, pulls, bursts, gear, panics, goal changes) is attached to every danger record as `decisions`, those within the last 10s, each with `ms_ago`. A window record is about 550 bytes, about 0.5 MB/day for the three fighters. Combat Sampling keeps its own `hit` and `action` handlers, because the in-flight ledger must run exactly and first. Every `hit` handler subscribes to the socket itself; a normalised hit on the bus was tried and dropped (10-16), because each handler needs raw fields (`hid`, `pid`, `dreturn`, `heal`) a normalised record would have to carry anyway. What they share is `hit_kind(data)` in Combat Sampling: burn, splash, or the hit's source.

### `Farm Ledger.js`

One `ledger` record per fighter every 5 minutes, through `errlog_archive()` to `ledger.jsonl`.

- **At the spot vs away.** Each 1s tick decides `at_farm_spot()`: alive, inside the farm target's spawn boxes on the map the character is on (a `randomrespawn` lists boxes on several maps: the phoenix's are on main, halloween and the cave; until the phoenix hunt only the destination map counted) widened by 200px, enough to take in the far end of Riva's bscorpion rail (a 400px circle round the destination when the target has no spawn box), and no event goal (`event-*`, `boss-loot`, `holiday-tree`) on this character or on Myras. Gold, XP and kills land in `total` always and in `spot` only while at the spot, so a spot's rate is `spot` over `at_spot_s`, with travel and boss detours excluded.
- **Gold comes from chests, not the wallet.** The fighters send gold to Riff, so a wallet delta undercounts. Every party member gets its own `chest_opened` with its share of each chest (server `open_chest`), so `gold` is this character's share and `chest_gold` (`gold / share`, the Gold Meter's formula) is the whole chest. Party gold/hr is one character's `chest_gold`, never a sum across characters.
- **XP** is the `character.xp` delta carried across level-ups with `G.levels`. It is net, so XP lost on a death shows.
- **A window closes early when `home` changes**, and carries the `home` and `survey_spot` it started with. A window straddling a spot change would otherwise credit the old spot's minutes to the new one.
- **A window also closes on `pagehide`**, and `errlog_send_archive()` beacons everything archived since the last 30s push. Until 10-11 every reload (the periodic one, the watchdog's, a Settings save) dropped the open window and anything archived since the last push: Myras lost five windows in two hours that evening, and every finished survey spot showed 20–26 ledger minutes against its 30-minute clock. The beacon is a slim payload (`character`, `build`, `session`, `archive`); the sink's `merge()` leaves everything it doesn't carry untouched.
- Also per window: deaths, potions drunk (`potions_drunk`, counted in `potion_loop()`), the most foreign players seen in the spawn area, fighters on this map, `goldm`/`xpm`/`luckm`, and the gear signature when it changed since the last window (40% of a record when it was written every 5 minutes).

**Loot (10-16).** One `loot` record per party chest, to `loot.jsonl`: the monster, the chest type, the map, the items (name, quantity, level, special property, who got it), the party's gold (`chest_gold()`), the opener and their `goldm`, and the `luckm` it was rolled on. Only Myras records, so each chest is written once: every party member on the map gets the `drop` and every member gets `chest_opened`. A normal kill's drop rolls on the luck of the monster's target (`drop_something(monster.target)`: `random / share / player.luckm / …`), which at the camp is Myras, so her `luckm` at the `drop` is the one that rolled it; a coop boss rolls each contributor's own drop on their own luck, so there it is only Myras's. The monster is the `kill_credit` closest in time to the `drop` (within 500ms; a normal kill sends the drop first, a coop kill the credit first). A chest opened with no `drop` seen (before a reload) has no monster or luck.

**Tracker snapshot.** Once a day per fighter it emits the game's `tracker` call and archives `monsters` (kills per type), `monsters_diff` and `max` (`player.max_stats`) to `tracker.jsonl`. **Achievements run on monster score, not kills**: own score is `monsters + monsters_diff` (each kill adds its `calculate_monster_score()` − 1 to the diff), and the server takes the larger of that and the account best, `max.monsters[type][0]`. A kill scores 1.6 for each fighter with all three partied and Riff away; the formula is in the plan's Workstream 2. The server answers only while a `tracker` or `supercomputer` is in the bag (`computer` alone does not set `player.tracker`). The client renders the tracker window on every reply, so the handler closes it (`hide_modal`), but only for a reply within 10s of our own request.

### `Farm Survey.js`

The `*SURVEY*` farm target (`SURVEY_FARM_TARGET`). `farm_target_for()` resolves it to the survey's current spot, or to `DEFAULT_FARM_TARGET` once the survey is complete. Set it on all three fighters; Myras (`SURVEY_OWNER`) is the only writer of the state, in localStorage `AL_survey`, which every iframe shares.

**Runtime spot changes, not reloads.** Every reader of `home` and `destination` looks them up when it runs (movement, the encounters, the bscorpion camp), so `switch_home()` reassigns both and the next tick follows. The one cache is `active_dungeon()`, and no survey spot is a dungeon. The bscorpion kill logger now starts for Ulric whatever the home, since it parks itself away from the camp.

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

**Every record says what the page was doing (Overhaul 4.2).** `errlog_sample()` and `errlog_archive()` add `build`, `home`, `map`, the goal label and the live encounters (`encounters_live_names()`, the list the registry last built, so recording never triggers a refresh) to each record. The record's own fields win, so a ledger window keeps the `home` it started with. The context is rebuilt at most once a second, because `target_choice` and `burn_state` sample several times a second. Samples had no build before this.

**`game_response` replies are records only.** The `exception`/`cant`/`not_ready` replies still count in `records`, but no longer go to the timeline, so they no longer reach `errors_timeline.jsonl`. They were 63% of its bytes (50.6 of 81 MB by 10-11), mostly Myras's.

**The archive lane.** `errlog_archive(kind, data)` keeps its own ring of 100 (`_errlog.archive`) for records meant to be kept for good (`ledger`, `decisions`, `danger`, `tracker`, `survey_spot`), apart from `samples`. The sink writes each kind to its own `.jsonl` once, by a per-kind high-water mark on `t`.

**A push carries only what the sink hasn't confirmed (10-16).** Every 30s `_errlog_push()` sends the records, the counts with `counts_since`, the last heartbeat, and the timeline entries, deaths, samples and archive entries not yet delivered. When the sink answers OK, the delivered samples and archive entries leave the page and the delivered timeline entries and deaths are marked (by object, in a `WeakSet`, so two entries with the same `t` are never confused); a failed push keeps everything for the next one, backing off to 5 minutes after three failures. So the rings hold only undelivered entries and localStorage stays small; before this every push resent every ring (~345 KB), each save wrote 128 KB–1 MB per character into the shared origin quota, and with only `t` marks a noisy kind could push a kept sample out before it was delivered. A failed localStorage write is counted (`io flush failed`). On `pagehide` the undelivered archive goes by beacon.

**The sink holds the store in memory** and writes `errors.json` at most every 5s, and once more before a self-restart. It used to read and rewrite the whole file on every POST (about 8 a minute), and a reader holding the file open on Windows (`WinError 5`) threw the whole merge away. It accepts `counts_since` (a newer stamp replaces the counts, so the page's 24h reset reaches it) and a record whose `first` is newer even with a lower count (a record's own 24h reset). Before 10-16 the page never sent `counts_since`, so the sink kept the highest count ever seen for every key, dead buckets included.

**Quiet refusals are counted, not timelined** (`errlog_tally()`, 10-16): attack on cooldown and monster already dead were 30% of the timeline's volume. The `orb_equip` record (a 09-07 diagnostic on every equip of a set with an orb, 3,500 on Myras alone) is gone; the decision log records every gear change. The `disconnect` capture is gone too: the code frame is removed before it could save, so it never once reached the sink.

It records every `event`, `warn` and `error` line of `log_msg()` (Game Log calls `errlog_record("game_log", text)` itself), and wraps `game_log` only for the game's own pathfinder lines (`ERRLOG_RUNNER_LINES`: "Searching for a path", "Path found", "Path not found", "Lost the path"), which never pass through `log_msg()`. So a goal flip or a search loop shows in `errors_timeline.jsonl` as it happens. Until 10-10 the 🧭 goal changes and the searches were the one thing the recorder could not see. Until the 6.2 sweep (10-16) lines were recorded by their leading emoji (⚠️ ❌ 🛑 🎂 🚨 🧭 🌀 `[` 🍭 🎉), and the sweep gave each of those lines the `event` level or higher, so the same lines are recorded under the same keys (`game_log|⚠️ Panic: low health`).

**Snapshots.** `errlog_snapshot(label)` records everything the deciders read, so the overhaul's offline harness (`Tests/Harness.js`) can replay a live moment: the character and every entity within 600 (nearest 40), chests, party, `next_skill`, pings, `S`, the `AL_*` storage the deciders read (set profiles, farm focus, farm targets; not the error log), `home`/`destination`/goal, the panic state, the active dungeon, the clock (`t`, `performance.now()`) and the build. It is POSTed straight to the sink's `/snapshot` route, which appends it to `snapshots.jsonl` (gitignored, trimmed by the sink to the last 7 days once a day: about 100 MB a day, so about 700 MB held). It never goes through `errlog_archive()`: at tens of KB a snapshot would fill the ~5MB of localStorage the four characters share.

Two things a field copy gets wrong, both found by round-tripping a snapshot through the harness before it shipped. `parent.character` and the entities belong to the game window's realm, so their nested objects' prototype is not this iframe's `Object.prototype`. The plain-object test is therefore "a prototype whose own prototype is null", and dates are recognised by tag, not `instanceof`. And `distance()` reads width, height and position partly through PIXI getters a `for…in` copy cannot see, so each body is recorded with explicit `real_x`/`real_y`/`awidth`/`aheight` from the game's own `get_x`/`get_width`. The replay then measures the same distances the live client did.

Triggers: each ledger window closed at the farm spot (Farm Ledger), a close call opening and a death (Danger Log), a panic starting (`set_panic`, deferred one task so the serialisation never delays the panic path), and a coop boss in `ALL_BOSSES` within 400 and damaged, once on first sight and then every 60s (Danger Log). Every record through `errlog_archive()` now also carries `build`, which `Data Store.py compare` uses to judge one build against another.

A `limitdcreport` from the server (sent just before it closes the socket for call cost) is recorded as a `limitdc` record and timeline line with the per-method breakdown, the goal and the position, and flushed to localStorage at once so it survives the reload and reaches the sink with the next push.

---

## Dungeons

### `Dreams Cave.js`

`DUNGEONS.dreams`, the daily Cave of Many Dreams. Mechanics are in [`Game API Reference.md`](Game%20API%20Reference.md).

**Entry.** Myras checks `cave_info()` every 10 min (`dreams_due_visit()`) and switches the mode on when the account's visit is unused and no boss is being engaged (`dreams_boss_engaged()`). The ⚙️ **Daily Cave of Many Dreams** setting turns the automatic visit off. There is no manual start or stop any more: the 🌙 button went with the dungeon buttons, and ⏸️ pauses a visit that goes wrong.

**Between dungeon runs.** With crypt or spider on, the check runs only at a run boundary, on the leader (`dreams_handover()`): after each crypt lap (after the leave and the collection), and when the leader starts a dungeon, which for spider is the boot after the reload that ends every run. If the visit is due, the dungeon in progress is saved to `AL_dungeon_resume` and the mode switches to dreams. When the dreams run ends, by finishing or by failing to get in, `dreams_resume_dungeon()` switches back to it. The resume key is in storage because spider's reload and the x:55 reload both fall inside that cycle. While dreams runs, the ⚙️ dungeon choice edits only what resumes afterwards. Nothing interrupts a run, because a mode switch while the crypt loop is mid-route would leave its route running under another dungeon's `active_dungeon()`.

Once it is on, the mode's `ignore_events` keeps `event_goal()` (boss walks and `join` teleports) from pulling anyone out until the run ends. The `party_only` flag makes Ulric kick Riff, since the cave holds 3.

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

- the panel theme, one stylesheet (`al-theme-style`): `.al-panel` (the frame every bot panel shares: dark background, 4px #555 border, pixel font at 20px), `.al-meter` (a member of the 358px column), `.al-window`, `.al-panel-title` (a window's drag handle) and `.al-button`. A meter keeps only its own text colours and sizes. `ui_style(id, css)` writes a `<style>` once and replaces its text after, so a code-only restart picks up new CSS (Party Frames used to create its style only if it was missing, so a restart kept the old one)
- `register_widget()`: the one container and render tick that the Gold/XP/CC/DPS/Boss Contribution meters each make a single call into. Every meter is a fixed `UI_METER_WIDTH` (358px, the column's width), not `100%`, so it keeps its size once Layout floats it out of the column
- `toolbar_button(id, { label, order, title, on_click })`: every bot button registers in its file's boot step and the bar is redrawn in `order` (bank 10, reload 20, settings 30, pause 40, 📊 60, kpm/kph/kpd 80–82). A tool that is opened now and then rather than watched registers with `settings_action(id, { label, order, on_click })` instead and appears in the ⚙️ window's Tools row (🧩 arrange 10, 🍀 lucky slot 20); clicking one closes the window and runs it. The dungeon buttons (50–52), 🧩 (35) and 🍀 (70) moved off the bar on 2026-10-15. It replaced a chain where each button polled for the one before it (`when()` on `#reload-btn`, then `#settings-btn`, then `#pause-btn`), so one missing button stranded every button after it. Any element with the same id is removed first, so buttons an older iframe left directly in `#toprightcorner` don't double up. `#toprightcorner` and its `.game-controls` are the game's own DOM and exist before the code iframe runs, so the bar is placed without polling
- `CLASS_COLORS`
- the coop-point helpers `coop_contributors()`, `coop_share_weight()` and `coop_total_weight()` (the server's loot share)
- the rolling-window helpers `commas()`, `prune_before()`, `window_sum()`
- `start_drag(e, move, end)`, the one mouse-follow on the game window (`move(dx, dy)` per mousemove, `end()` on mouseup), and `make_draggable(el, handle, on_end)` on top of it for the windows

### `Layout.js`

What the player sees and where, for the game's panels and the bot's alike. One layout is shared by all four windows (the user's choice, 2026-10-15). It lives in localStorage `AL_ui_layout` as `{ panels: { id: { hidden, ax, x, ay, y, sw, sh, w } }, buttons: { id: true }, windows: { name: { left, top } } }`, and a `storage` event in another window re-reads it, so arranging one screen rearranges all four live.

**Panels.** `UI_PANELS` names each one by selector: the game's character sheet, menu, party list, server info, inventory, chat, party chat, chat input, HP/MP bars, skill bar, code windows, level bar, tutorial and event announcements; the bot's toolbar, game log, party frames and the five meters. A panel nobody has touched stays exactly where the game or the bot draws it. Toolbar buttons hide individually.

**One stylesheet.** The layout is applied as a generated `<style id="al-layout-style">` with `!important` rules, never as inline styles on elements. That is what makes it hold: the game re-renders and re-positions some of its panels (`#bottommid` sets its own `right` inline), `register_widget()` rebuilds a meter the game dropped, and Boss Contribution toggles itself with `.toggle()`. A rule matches whatever element carries the selector at the moment, and `!important` beats the game's inline values. No loop runs outside arrange mode.

**Floating.** A dragged panel becomes `position: fixed` with `margin: 0` and `transform: none` (party frames centre themselves with `translateX(-50%)`; the log shifts left with a negative margin). It is anchored to the nearest screen edge on each axis and stored as the distance from that edge, so a bottom-right panel stays bottom-right in a smaller window, and a bottom-anchored meter that grows (DPS rows, boss contributors) grows upwards. The offset is clamped in CSS (`min(x, max(0, 100vw - width))`), so a smaller window never pushes a panel off screen. A panel whose own width is a percentage of its container would go viewport-wide once fixed, so `pin: true` (server info) stores and applies its measured width. Width is otherwise left alone, because a fixed element with `width: auto` shrinks to its content. ↺ puts a panel back where it started, still hidden if it was.

**Arranging.** ⚙️ → 🧩 Arrange the screen (or `ui_arrange()`) draws a dashed outline over every visible panel, each with its name, ✕ to hide and ↺ to dock, plus the Layout window: a checkbox per panel and per toolbar button, Reset all, and Done. Smaller outlines stack above larger ones, so chat stays grabbable over the inventory. Neither the toolbar nor ⚙️ can be hidden (`keep`), so arrange mode is always reachable through the settings window; `ui_layout_reset()` in the console is the last resort. The outlines follow their panels every 250ms through one `arrange` loop, stopped on Done.

**Windows.** `remember_window(name, el, handle, left, top)` opens Settings, Stats and Layout where they were last dragged, clamped onto the screen.

**Tested** (2026-10-15) in headless Edge over a snapshot of Ulric's live page (DOM and CSS, the game's pixel font): the default layout matches the live one, a drag lands exactly under the cursor, hide/show/↺/Reset all apply at once, the layout survives a reload, a change in one tab reaches another, and booting over a page an older iframe built leaves no duplicate ids.

### `Game Log.js`

Loaded in the awaited first stage, so `al_log_push()` is guaranteed on the error path. It is the one log window: it wraps `parent.add_log`, adds timestamps, category filters (gold/kills/items/errors) and the Log/Filtered tabs, and resizes `#gamelog` 60% wider (leftward, over the canvas) and 37.5% taller. Tabs, filters and both logs sit in one `#al-log-panel`, so Layout moves them as one panel. The panel shifts left by its width less the 358px column, so it adds nothing to the column's width and its right edge meets the screen's. The game's `#gamelog` is moved into the panel, not recreated: the game finds it by id. (Until 2026-10-15 the four elements were sized separately and the log ran 30px wider than its tabs. The factors went from 1.5/1.25 to 1.6/1.375 when the log became border-box, so it is the same size on screen.) It self-starts at load. There is no `log()` any more; the bot logs through `log_msg()`, and only the loaders (`Code Loader.js`, `Bootstrapper.js`, which run before this file exists) and `log_msg()` itself call `game_log()`.


**Levels (Overhaul 4.7).** `log_msg(level, msg)` takes `debug`, `info`, `event`, `warn` or `error`, and writes through `game_log()` with that level's colour and prefix (`⚠️ ` for warn, `❌ ` for error). Warnings and errors are also counted by level (`log warn`, `log error`). `event`, `warn` and `error` lines go to the flight recorder; `debug` and `info` don't. It is not called `log` because the game's runner already defines `log(message, color)`.

Which level: `error` when something the bot set out to do failed (a craft with nothing to buy it with, a boot step that threw); `warn` when it carried on but something is wrong or was given up (a stuck merchant task, a dungeon warning, a panic); `event` for what is worth finding afterwards in the timeline (goal changes 🧭, town teleports 🌀, boss spawns, lolipop rolls 🍭, dungeon progress, panic over, settings saved); `info` for the ordinary running commentary (merchant sales, crafting steps); `debug` for console-triggered reports (`[HEAL]`, `[CHEST]`) and step-by-step chatter. A line that fires on every kill (the bscorpion surge, the sugar rush) is `info`, so it never floods the timeline. A topic emoji stays at the start of an `info` or `event` line; a `warn` or `error` line drops it for the level's own ⚠️ or ❌. The custom colours went with the sweep (10-16): the level now sets the colour. Dungeon lines go through `dungeon_log(dungeon, message, level)` (default `event`), which prefixes `[Dungeon name]`.
### `DPS Meter.js`

Each member's damage over the last 5 minutes (or since their first hit, if later), split into Base, Burn and Blast (splash). The DPS column also holds damage return. Every client sees only the hits near it, so Riff's meter, off the farm, reads zero. Checked on 10-16 against the bscorpion camp: a kill every 32.8s (last 50 kills) is 17,590 HP/s of the 576,900, and the meter's party total read 17,807.

- **Net damage, not raw.** A hit's `damage` is the whole roll. The server's own `add_pdps` counts `net`, capped at the HP left, so a killing hit is capped at the target's last broadcast HP (the client never changes `hp` on a hit). On bscorpion overkill is under 1%, but every hit on a goo (100 HP) or a mummy (12,000) is mostly overkill.
- **No `reflect`.** The server sends a reflection as a hit `{hid: caster, id: reflector, damage: 0, reflect}` with the raw pre-resistance attack, then the reflected projectile lands as the reflector's own hit. Crediting `reflect` counted it twice, the first time unresisted. Damage return has no hit of its own, so `dreturn` stays credited to the victim.
- **Party attackers only.** A stranger who healed or hit a member used to get a row.

### `Boss Contribution.js`

Coop boss contribution overlay, after Crowns3bc's. It shows every visible player's `s.coop.p` on the same boss as us (`s.coop.id`), with the loot share the server will award: `p^0.65 / (0.1 + Σp^0.65)`, from `issue_monster_awards()`. A share at or under 0.25% earns no drop and shows in red. Hidden while no one in sight has coop points.

### `Kill Tracker.js`

kpm/kph/kpd top buttons. The session kill rate is counted from the server's `kill_credit`, which is sent to every party member for every party kill, and to coop contributors over 0.25%.

### `Lucky Slot Tracker.js`

⚙️ → 🍀 Lucky slot search, and the search for Riff's lucky upgrade slot.

**The mechanic.** The server picks one slot 0–41 per character, for good (`player.p.item_num`). `imove` never moves it; only the cyberland mainframe's `swap a b` chat command does. On a scroll upgrade of the item in that slot, the server replaces 60% of rolls with `max(rand/10000, roll × 0.975 − 0.012)` (server `upgrade` handler). Only scroll upgrades count (`p.scroll` of type `uscroll`). Compounds never get it, and a grace offering (`upgrade(item, null, offeringp)`) rolls a fixed 0.999999, which the old tracker counted as a 99.99 in every slot it graced.

**Evidence.** Per slot it stores every roll (`n`), 00.00s and rolls over 96.3 in localStorage `AL_upgrade_slot_rolls`, shared by all four windows (only Riff upgrades). Each roll is evidence: a 00.00 is 74.9× likelier in the lucky slot, an over-96.3 0.4×, anything else 1.0153×. So the odds per slot are exact Bayes over a uniform prior.

**Focusing.** `upgrade_slot_for(slot)` returns the likeliest slot (a pass-through stub in `Global Config.js`, since this file is optional). Every upgrade goes where the evidence is, because a roll in the suspect slot moves its odds and a roll elsewhere barely does. Simulated, focusing reaches 99.9% in a median of ~1,850 rolls (p90 ~5,600), against ~10,900 (p90 ~20,000) for rolling every slot equally, with no wrong pick either way: the threshold's error rate does not depend on the sampling order. The label flips to "LUCKY SLOT FOUND" at 99.99% (`LUCKY_SLOT_CONFIDENCE`), ~40 rolls past 99.9% under focusing. The label is informational only, so a fluke leader keeps being rolled and sinks on its own.

**Keeping the layout.** `upgrade_in_lucky_slot()` sends the swap into the lucky slot and the upgrade together (the server applies them in order, so the upgrade's `clevel` and scroll index are computed for the bag after the swap). It doesn't swap the item back: the next item's swap carries it out to that item's old slot. The lucky slot's own occupant waits where the first item came from (`_lucky_parked`) and is swapped home by `restore_lucky_slot()` when the pass ends, or before the lucky slot moves. So a roll costs one round trip instead of three, and Riff's layout still holds at the end of every pass: tracker, computer, hpot1 and mpot1 in slots 0–3, then scrolls and primlings. `bank_items()` protects those four by name through `do_not_bank`, never by slot index. Skipping slots 0–2 by index banked the tracker and computer the first time a swap displaced them.

**Counting once.** `q_data` is sent at each roll digit and again for success/failure with the same four digits, so a roll counts once per slot until a new upgrade starts there (fewer than four digits).

### `Session Metrics.js` and `Metrics Graphs.js`

📊 popout, after Crowns3bc's: session gold, XP (carried across level-ups), party DPS by damage type, kills per mob, loot per item, and boss contribution as the server's loot share. Session Metrics collects the numbers and feeds the status page; Metrics Graphs draws them. Gold and XP samples are taken every 5s in the background, so the line charts have history when it opens. The rest renders only while it is open. They were one file until 10-16 (Overhaul 6.1). Metrics Graphs is optional and Session Metrics is not, so the status page's Session section keeps its feed if the popout fails to load.

**Live feed.** Every second each character POSTs `metrics_snapshot()` to the sink's `/live`: the same session totals, damage rates per party member and type, the top 12 coop contributors with their loot share, the last 5 minutes of gold/XP samples, and live vitals (HP/MP, level progress, map, goal, target, panic, wallet). The sink keeps only the latest per character, in memory, for the status page's Session section. The goal comes from the character's own state cache, not `current_goal_label()`: that lives in `Character Runner.js`, in the same parallel batch, and the 1s interval could reach it before it loads. A failed post pauses the feed for 30s, and a post still in flight skips the next tick.

---

## Warrior (Ulric)

### `Warrior Combat.js`

Targeting, `action_loop()`, and `weapon_burst()`. Sets `cache.tank_entity` to **Myras**.

**Farm focus at uhills** (`Targeting.js`, the targetron-sparkbot encounter's `farm_focus`). After the Rime shell, a pursued boss and any boss, he takes the party's farm focus when it is touchable within his engage radius; otherwise the normal scorer decides. At this spawn the monsters stand clumped on Myras, so his explosion reaches all of them whichever he hits, and the direct hit is best spent where it is amplified.

**The swing burst.** `weapon_burst()` is the one weapon swap each swing makes: swing → bataxe → cleave (when ready) → candy canes, held until the flight of the swing and of every cleave hit has landed → the weapon chooser's current set. It works out whether the burst is worth it and how long to hold; `equip_burst()` sends it.
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

**Stomp** stuns her attackers when she is below 35%. It does not use `endangered()`, which already fires below 60% whenever she is taking damage, so it saves the stun for real emergencies. It works only with a basher-type weapon worn or the `basher` set in the bag, swapped in and out in one burst like cleave. The burst claims at panic priority, as it always ignored other claims: a sugar-rush hold still pending never delays the stun, and the hold's own restore then finds nothing left to swap.

**Taunt** (`handle_taunt()`) pulls a boss with the `taunt` trait (mrpumpkin, mrgreen) onto him whenever it is on anyone but him, Myras or a `taunt_exempt` player (CrownTown, CrownsAnal, CrownPriest), provided she is within absorb range of him. The boss's `coop` makes every player fighting it friendly to the server's taunt check, so this steals it from other parties too.

### `Warrior Movement.js`

The reposition scorer and the farm step that keeps him engaged. He targets anything within `CONFIG.combat.engage_radius` that is attacking the party (or already in reach), walks to a 12px hitbox gap when it is out of reach, and steps back out to 12px once he is under 4px. That is `warrior_engage_step()`, which the runner also hands to `event_step()` as `engage_step`, so he holds the same gap on a boss instead of walking to `range × EVENT_REACH` and standing inside its hitbox. The gap point is his `engage_point()`, which overrides Global Config's default, so the boss pursuit goal decides between a step and a journey by that same point (World Events → one stand point). A moving target is re-closed as soon as the gap passes 20px (`WARRIOR_CHASE_GAP`), not when it leaves his range. Waiting for out-of-range left him a step behind a kited crabxx the whole fight. Every move is skipped while he is already heading there, since each `move` costs 2.5 call cost.

**Position is not a lever at a clustered spawn (measured 2026-09).** Across three scorer and orbit settings his bataxe and aoe hit rates were flat to three significant figures, because the best reachable spot covered one more monster than where he stood in 71 of 74 samples (radius 35) and 56 of 56 (radius 60). The monsters cluster on Myras and cleave's reach is wide against that cluster. The scorer stays because it does no harm and should matter at a spread-out spawn. Before revisiting positioning, check whether any spawn ever offers more than +1.

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
- `camp_fight` (firestaff, exoarm, loaded die, zapper, coat+10, two cearring+3, plus the amulet she wore, remembered and kept off the loot list) while `bscorpion_damage_window()` holds
- `camp_luck` (lmace, mshield, rabbit's foot, ring of luck, Lucky cdragon, spookyamulet+2, two cloverstud+0 (6 luck each, from 10-16); `camp_gear_set()` keeps only the pieces she holds, and she holds no ring of luck) only from then until the kill (`luck_window()`, over `luck_kill_target()`: the scorpion at the camp, the boss elsewhere, where `camp_fight` goes on without the zapper since the fight rule only zaps at the camp)

The moment the target dies she goes straight back to `camp_fight`, so that swap's penalty lands in the respawn, not the next pull.

**Why luck only at the kill.** Primlings (`offeringp`, 5%) roll on `5% × (1 + luck/100)` of the scorpion's target at the kill, which is Myras, so luck matters only at that instant. `luck_due()` switches once the scorpion's remaining HP is within `luck_lead_ms` (600) of its measured kill rate plus `luck_burst_hp` (15,000, one supershot crit), latched per scorpion. Every kill is counted as `bscorpion kill: target …, luck gear on/off`.

### `Healer Movement.js`

Runner hooks (`healer_local`, panic skip) and the circle walk. `walk_in_circle()` aims half a radian ahead on the circle (`CIRCLE_LEAD`) through `local_step()`, so she keeps walking instead of being issued a ~5px move each time she stops.

**Why a circle, and why this one (measured 2026-09).** Moving packs monsters tighter than standing still: neighbours within 12px averaged 1.67 at 1.8 rad/s against 1.33 at rest, matched at 4 engaged monsters, about 26% tighter. A still target is ringed with opposite sides two attack ranges apart; a moving one drags a trailing arc, and only the arc puts pairs inside splash reach. Within motion, geometry does nothing: a radius sweep of 30/20/12 over 5.5 hours (1,099 windows) measured 1.36/1.37/1.32 with standard error 0.024, so turn rate is a threshold, not a gradient. The reason is the monster AI's approach constant: between attacks every general monster closes to within **12px** of its target whatever its attack range, pathing to the midpoint each tick (`node_server.js` L12245). Two ideas were tried and rejected. A radius of 10, just inside 12, looked bad in game and was reverted the same session. Centring the circle on the engaged monsters' centroid made a pursuit spiral, because they chase her and their centroid is a lagged copy of her own position. `circle_radius: 30` and `circle_speed: 1.8` are the settled answer; untested is re-centring on monsters *not* already on her.

**The circle's pace follows her speed** (`CIRCLE_PACE`): the angle advances at the lower of `circle_speed` (1.8 rad/s) and 90% of her speed over the radius, so the point she chases never outruns her and the circle keeps its 30px. Fear slows her hard: the server's fear is the count of physical (or magical) attackers over her courage (or mcourage), and each level takes 20/40/70/80/90/100 off her speed. She has physical courage 2 (a priest's base; STR adds none for her), so four targetrons at uhills are fear 2 and her speed falls from 72 to 32, three more levels to ~5. At a fixed 1.8 rad/s the point ran at 54 px/s, she cut inside it, and the orbit shrank to ~18px when feared (measured 10-12). Fear costs her speed and attack only; `fear_affects_heal` is off on the server.

---

## Ranger (Riva)

### `Ranger Combat.js`

Target cache, `action_loop()`, `handle_attack()`.

**Sure kills.** Riva normally shoots only what is already on Ulric or Myras (`engage_aggroed_only`, `target_priority`), so she can't pull aggro onto herself. A mob her plain shot kills even on the lowest damage roll (`sure_kill()`: `would_kill()` at ×0.9, the server's `0.9 + random * 0.2` floor, over `remaining_hp()`) is exempt: it dies before it can target her. Without it she stood idle at the goo spawn, where nothing is ever targeted. The exemption sits below the encounter checks (`encounter_allows`, `safe_to_touch`), so a lethal or forbidden mob is still never shot.

**Armour piercing.** `shot_apiercing()` counts her own armour piercing twice, as the server does: it adds the attacker's piercing into the hit's and then subtracts both. At 226 piercing a plain shot (×0.952 vs the bscorpion's 500 armour) beats piercing shot (0.75 × 1.188), which the single count had backwards.

**Boss only.** With a cooperative boss in range the shot chooser sees only the boss (`coop_boss_only()`, over `is_coop_boss()`: cooperative *and* in `ALL_BOSSES`). The Rime Djinn is cooperative but a farm mob, and reading it as a boss left its adds unshot. The chooser scores total damage over its targets, so with two adds beside mrpumpkin a 3-shot (0.7× each) beat a plain shot. On 10-10 she fired ~336 of them: 2.26M into adds, which earn no coop points, her 200 MP each starving her into skipped shots, and her boss DPS down from ~9,500 to 7,513.

The exception is a boss that `takes_one_damage()` (crabxx behind its crabx): there the adds are the boss's shield, so the chooser sees the boss first and the adds after it. Every multishot then includes the boss, and a plain shot goes to the boss. Boss-only resumes the moment the flag drops.

Shot choice on a shelled Djinn is under Encounters → `Rime Djinn.js`.

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

### `Merchant Party.js` — delivery

**Riff waits for the hand-off.** Once in range and done with mluck, `wait_for_handoff()` holds him until no fighter within 200px has `ship_slots` left, his bag is full, or 15s pass. He used to start for home straight after the mluck, and the 50px from his stop at 200px to the edge of the fighters' 250px takes him a second or so, often before their sends were done.

`delivery_target()` is the first live fighter who wants a pickup (mluck due, a full pack with loose loot, or gold over the threshold), else the first live one. The run walks to that fighter and ends within 200px of them. Before the phoenix hunt it walked to the first live party member and ended when any was in range. With the party spread over three maps, that sent Riff to Ulric on every run while Myras or Riva filled up.

### `Merchant Gear.js`

Riff's default gear and his gathering tools are equipment sets (`default`, `rod`, `pickaxe` in Merchant Config) equipped through `equip_once()`, so `best_copy()`, the sent view and the doublehand offhand clear protect him as they do the fighters. They used to be raw `equip()`/`unequip()` calls by bag index with 400ms waits between them.

`is_default_gear()` protects only the copy Riff wears: the `default` set's name **and** level (`broom` +9, `wbookhs` +1). Matching by name alone kept every broom off the vendor list once `broom` was added to `SELLABLE_ITEMS`, because his mainhand is a broom.

**Nothing upgraded is vendored.** `vendorable()` (`Loot Management.js`) is the one test both sellers use, the fighters' `remote_sell_items()` and Riff's `sellable()`: on `SELLABLE_ITEMS` *and* below +1. `SELLABLE_ITEMS` names junk drops, and a +1 or better copy is either something Riff paid scrolls for or a lucky drop, so it's banked instead. A special property (`item.p`: shiny, glitched) doesn't exempt anything: both sellers sell it like any other copy (10-16, the user's call).

### `Merchant Upgrading.js` — scroll a grade above

Every `UPGRADE_PROFILE` uses scroll1 from +0 (`scroll0_until: 0`). The server treats a scroll of higher grade than the item as "high": the chance becomes `p×1.2 + 0.01`, the cap rises to `min(p0+0.36, 3×p0)`, and the item gains 0.4 grace, which it carries to every later level. Scroll0 on a grade-0 item gets none of that, and how far above the item the scroll is makes no difference: scroll2 at +0 scored the same as scroll1. Simulated over the profiles (2026-10-13), scroll1 from +0 instead of scroll0 raised yield 24% for pouchbow and wingedboots to +9, ~50% for coat and pants to +8, 17% for hbow and quiver, 8–9% for broom and cave_mothsteps. The reverse doesn't pay: scroll1 instead of scroll2 at pouchbow's +8 (grade 1) dropped +10s from 4.9 to 3.3 per 10k.

### `Merchant Upgrading.js` — upgrade target

The settings window's Upgrading toggle carries a target: an item, a level m and a count n (`upgrade_target()`, localStorage `AL_merchant_upgrade_target`/`_level`/`_count`). While fewer than n copies at +m or above are held (bag and bank, `upgrade_target_open()`), each upgrade run works the target before the `UPGRADE_PROFILE` items. The profile pass skips the target's name until it is met, then upgrades it as before if it has a profile.

- **Batched like everything else.** `upgrade_target_pass()` is `upgrade_pass()` over `target_plan()`: every copy goes +0→+1, then every copy +1→+2, up to +m, the same level-by-level batch as the profile items (`profile_plan()`). It can overshoot n, which is wanted: a spare at +m costs nothing. Withdrawal takes the highest copies first when the bag can't hold them all.
- **Scrolls.** The item's `UPGRADE_PROFILE` decides scrolls and primlings, ignoring its `max_level`. An item without a profile gets `target_profile()`: a scroll one grade above the item (scroll1 below its first grade boundary, scroll2 after), no primlings. A target past the grade that scroll2 covers (grade 3, e.g. lolipops beyond +10) is refused by the server, and the copy is skipped as failed.
- **Buying replaced the "Buy to upgrade" toggle and the hard-coded coat list.** With Upgrading on, Riff buys base copies of the target when an NPC sells it (`npc_sells()`, over `G.npcs[*].items`) and none below +m are left. A batch is capped by gold above `upgrade_gold_threshold`, free slots, and the copies the base odds say are still needed (`target_base_odds()`, the product of `G.upgrades` up to +m with no grace). So a coat +7 ×2 target buys ~50 at most, not a bag-full each run.
- **Never vendored.** `sellable()` exempts the target's name, so junk-list items (helmet, shoes…) aren't sold out from under it.

The Crafting toggle carries one craft target (`AL_merchant_craft_target`), which `craft_targets()` returns. `try_craft()` crafts it as far as ingredients, free slots and gold allow. The settings window lists only recipes that produce an item (`makeawishjar` has none).

**Craft, then upgrade.** After each craft batch, `upgrade_crafted()` upgrades what's in the bag (the target pass, then the profile pass) before the next batch, when Upgrading is on and the crafted item is the open upgrade target or has an `UPGRADE_PROFILE`. So a firestaff run alternates crafting and upgrading instead of banking a bag of +0s for a later upgrade run.

**Speed.** With a `computer` in the bag (Riff keeps one, `do_not_bank`) the server lets him buy and craft from anywhere, so `go_to_basics()` and `go_to_craftsman()` only step out of the bank (both are refused inside it, `cant_in_bank`). Without a computer they still walk to the NPC. The server sells a non-stackable item one per `buy()` whatever the quantity, so `buy_amount()` sends one call per copy, all at once. Buying 30 staves one per gather round was the 10-10 firestaff stall: ten rounds bought ten staves, the batch was still short, and the run banked them and blocked for 10 minutes.

**Pipelined, not awaited one by one.** The server answers every bank, craft and upgrade request exactly once, in order, so a batch is sent at once and settled with `Promise.allSettled`:
- `withdraw_item()` plans every slot first, then retrieves a floor's slots together, and saves the bank snapshot once per floor instead of per item.
- `bank_items()` plans the pack for each item itself (`plan_bank_stores()`): a stack it can merge into, else a pack on this floor with a free slot left. `bank_store()`'s own choice is made from the client's copy of the bank, so parallel stores would all pick the same first pack and overflow it. It waits for `character.bank` on arrival (`wait_for_bank()`) instead of a fixed second.
- `craft_batch()` plans every craft's grid against a simulated bag (`plan_crafts()`) and sends them together. Outputs only land in empty slots, so no planned ingredient slot is disturbed.

**The craft grid.** The server reads one grid cell per ingredient and takes the quantity from that stack's `q`, and an ingredient matches only at the recipe's level (`x[2]`, else +0: the server names an upgraded item `staff+2`). The old code put one cell per unit, so the 104 recipes with a quantity above 1 could never craft, and it accepted any level, so a stray +1 ingredient failed the craft.

The settings window saves on **Save** (applied at once, since every setting but the farm targets is read live; see `Settings.js`), **Reload All** (every character, staggered as before) or **Reload One** (this window's character only); **Close** discards.

### `Merchant Lolipop Push.js`

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

### `Error Sink.py`

Serves the bot's code from git and receives everything the pages send. What it keeps, and for how long:

| File | Kept | Why |
|---|---|---|
| `errors.json` | the store: records 12h and 2 builds, samples 2h and 250 per kind, 1.5 MB ceiling | what's happening now; held in memory, written every 5s |
| `ledger`, `decisions`, `danger`, `tracker`, `survey`, `loot`, `phoenix`, `damage`, `heal`, `target_choice`, `cc_report`, `boss_profiles` `.jsonl` | whole | the history every report reads |
| `errors_timeline.jsonl` | 7 days | what happened lately, read by people; nothing ingests it |
| `snapshots.jsonl` | 7 days (the user's call, 10-16) | the harness's fixture source; ~100 MB a day |
| `errors.log` | 1 MB, then one `.old` | the sink's own log, rotated on the 15-minute timer as well as at start |

The 7-day trim runs once a day from the maintenance loop (and when the sink starts). Every archive line begins `{"at": "YYYY-MM-DD HH:MM:SS"`, so the trim reads the stamp without parsing the line. Before 10-16 the timeline was never trimmed (103 MB from 09-29) and snapshots rotated at 200 MB into a `.old` that the next rotation overwrote, so up to 410 MB sat on disk with no age to it.

### `Data Store.py`

`al_data.sqlite`, derived from the archives and safe to delete: `ledger.jsonl`, `survey.jsonl`, `tracker.jsonl` (plus `tracker_monsters`: kills, own score and account-best score per monster), `danger.jsonl`, `decisions.jsonl`, `boss_profiles.jsonl` (one row per profile, the fight's summary only) and the kept samples. `errors_timeline.jsonl` isn't ingested (since 10-16): the status page's seconds-per-kill trend comes from the ledger (Myras's spot kills and spot time per hour at the bscorpion camp) and deaths per day from `danger.jsonl`.

**Kept samples.** The sink also keeps four sample kinds for good, one `.jsonl` each, with a per-kind high-water mark (`SAMPLE_ARCHIVES`): `damage` (Combat Sampling's 60s per-weapon windows, 15s until 10-16: direct, splash and burn damage against the prediction), `heal` (Myras's heal windows: delivered against predicted, overheal), `target_choice` (the scorer's choice against the runner-up, sampled) and `cc_report` (the server's call cost by method). They become `damage_windows`, `heal_windows`, `target_choices` and `cc_reports`, each with a column per useful field and the context columns (the whole record stays in its `.jsonl`; until 10-16 each table kept a second copy in `raw`, 50 of the database's 61 MB). Measured from the live rings when this was added: damage about 4 MB/day per fighter, heal 1.2, cc_report 0.9, target_choice 0.1. `weapon_choice` (about 46 MB/day) and `burn_state` (about 17) stay in `errors.json` only; their questions are answered by per-window rollups instead. Inserts name their columns, so `ADDED_COLUMNS` can add one to an existing database on connect. Ingest is incremental by byte offset per file; a file that shrank, or whose first 256 bytes changed (trimmed or rotated), is re-read from the start with its tables emptied, and each file is ingested under its own savepoint, so one file's SQLite error doesn't stop the rest. The sink runs `ingest` after every 15-minute sweep, in a subprocess so a slow ingest never holds the store lock; `status()` doesn't ingest (until 10-16 it did, on every 15s poll of the status page), so the page is up to 15 minutes behind the `.jsonl` files. `ingest()` opens with `BEGIN IMMEDIATE`: Python's sqlite3 only begins a transaction at the first INSERT, so two ingests at once could both read the same offsets and insert the same lines twice. The first full ingest of 81 MB took 4s; an incremental one takes half a second.

**The questions (Overhaul 4.5).** `decisions.jsonl` becomes the `decisions` table, one row per fighter per ledger window, with each section as JSON. One command per question, each taking `--hours N` (default 24), `--build SHA` or `--range A..B`, plus `--home` and `--who`:

- `skills`: per fighter and skill or shot, chosen and server-confirmed per hour, mana, swap penalty, damage, damage per use, kills, misses and pulls. For a skill with an estimate, the value it was cast for per cast and `realised_vs_predicted` (damage done ÷ value cast for). Mark does no damage itself, so it shows its predicted value only.
- `weapons`: per fighter and weapon pair, share of time worn, then damage per hit and per second worn with splash and burn shares from the `damage_windows`, counting only windows with `worn_s` (Combat Sampling: before 10-16 burn went to the wrong pair and a window's seconds were wall time).
- `pulls`: windows grouped by the most monsters already on the puller when she pulled, against the close calls in those windows, damage taken and MP potions per hour (the ledger window closed in the same 2s).
- `time`: share of seconds per goal label and in panic.
- `before-danger`: the last deaths and close calls, each with the decisions of the 10s before it.
- `mana`: per fighter per hour, mana in (the part of each potion that fit, manasteal), potion waste, mana out (in minus the change in MP), skills (confirmed casts at their cost), attacks (out minus skills: attacks and multi-shots share a cooldown group, so they can't be priced cast by cast) and the four costliest skills. From windows with `mp_end` (10-16 on).
- `uptime`: per fighter, the mean attack frequency, confirmed attacks per hour, uptime (confirmed attacks against frequency × time, over all the time and over the time a monster was in range), the share of in-range time the attack sat ready, and downtime: minutes between consecutive ledger windows past 10s, which since reloads keep their window is time the page wasn't running.

And one per kept lane, with the same `--hours`/`--build`/`--range` flags:

- `loot`: per monster, chests, party gold a chest and mean luck, then each item per 100 chests, split at the median luck (`per_100_low_luck`, `per_100_high_luck`) so luck's effect shows once there are enough chests.
- `heals`: Myras's single and party heals per hour, HP delivered, delivered against predicted, and overheal.
- `cc`: call cost per sample against the server's limit, the share of samples over 80% of it, and the methods that spend most (Ulric only: the cc report is his).
- `targets`: how often the scorer's pick traded the best value for something else, and how much value it gave up.
- `phoenix`: kills per hour of hunting, and per post the kills, median search time (`found_s`), median time from first sighting to the kill (`kill_s`), fighters there and the mean `party_share`, with each kill counted once (every fighter that saw it archives it).

The status page shows `skills`, `weapons`, `mana` and `uptime` for the last 24 hours.

**`compare A B`** judges one build or time range against another at one home (`--home`, default B's commonest; `--tier behaviour`, 12 windows a side, is the default, `neutral` needs 6). It reads **full windows**: 280–320s long and at the spot for 95% of it, where time dead after dying at the spot and walking back counts as spot time (`death_s`, from 10-16). Before that a death took the fighter off the spot, so every window with a death was dropped and a build that got people killed lost its worst windows before its rates were computed; windows from before 10-16 still lack `death_s`. The three fighters' windows that closed within a minute of each other form one **party window**.

The verdict is on three numbers: **party XP/h** (the three fighters' spot XP summed per party window; Ulric's and Riva's XP correlate at 0.52, so pooling them is about twice as sensitive as voting on each), **Myras's kills/h** (`kill_credit` is party-wide, so one fighter's count is the party's), and **party deaths/h**, compared as counts (the rate difference against its Poisson standard error, since most windows have none). A metric is `same` within `max(2 SE, 2%)`, and each line prints that band as `sees N%`: the smallest change the run could tell from noise. Any `worse` makes the verdict `worse`. Chest gold/h (the party's gold: `spot_chest_gold`, not the fighter's share added to it, which made 4/3 of party gold until 10-16) and each fighter's MP potions/h are shown, not judged. Both sides' deaths and close calls from `danger.jsonl` are printed underneath. The settings warning compares only settings a fighter reads (merchant, upgrade, craft and exchange settings are left out). `experiment NAME` judges two variants by the same rules.

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

### `Probe.py`

`python Tools/Probe.py "<expression>" [--name Myras] [--file probe.js]` evaluates an expression in each character's bot frame over the client's DevTools port (9222) and prints the result. The expression is evaluated by the frame's own eval, so it sees every global, `let`/`const` ones included (`character`, `_errlog`, `al_boot()`); a Promise is awaited. It is how the bot is checked live without a reload, and it is read-only by intent.

### The client flags

The client's WebView2 arguments live in `HKCU\Software\Policies\Microsoft\Edge\WebView2\AdditionalBrowserArguments`, value `Adventure Land.exe`: `--disable-backgrounding-occluded-windows --disable-background-timer-throttling --disable-renderer-backgrounding --disable-features=IntensiveWakeUpThrottling --remote-debugging-port=9222`. The first four stop a hidden window's timers being throttled; the port is what `Probe.py` uses. They take effect only after Steam **and** the client are fully restarted. A user-wide `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` would override them and open the port in every WebView2 app, so it must stay unset.

**The watchdog is gone (10-16).** `Watchdog.py` reloaded a window whose main loop had been silent 5 minutes and logged every navigation and network outage. In 52 reloads it rescued a window at most once: 50 were on 10-08, every ~5 minutes for 12 hours, because Riff's window was showing a docs page. The game's own reload on disconnect works (28 of 30 single-character reloads from 10-11 were running again in 4–18s), and the freeze it was built for was fixed in 5aaa328. Its logon task was removed with the flags left as they were.

---

## Decisions

Standing decisions from the overhaul (2026-10-14 to 10-16), kept here when the plan was deleted. The numbers are the plan's.

- **D2 Dungeons stay a separate system.** Dungeon flags are not folded into encounters. Inside an active dungeon its flags win over encounter answers.
- **D5, D15 Fixtures are committed; snapshots are private.** The repo is public, so `snapshots.jsonl` stays machine-local and gitignored. `node Tests/Harness.js promote <id>` copies a snapshot into `Tests/fixtures/` and strips it on the way: the account id (`owner`), `ipass`, friends, shells, code slots, PIXI internals and every underscore-prefixed key at every depth, the role cache, any storage the deciders don't read, and strangers' names (hashed).
- **D9 Gates belong to the loop or the skill entry, never to a shared runner.** The Pause Button leaves combat running and Myras heals while panicking. Both are deliberate, and both would break under one gate for every role.
- **D12 Goldens are deterministic or they are noise.** The clock, the stored values and `Math.random` come from the fixture; each fixture runs in a fresh context, and `check` runs every fixture twice.
- **D14 Snapshots are throttled per trigger.** Riva's panic trigger is one mob on her, and one night it snapshotted 903 times (about 102MB). Panics snapshot at most once per 5 minutes and close calls once a minute; farm windows, deaths and bosses are unthrottled.
- **D17 Changes are proposed from the data.** The point of the decision log, the store and the experiments is improvement measured from data, over ideas. Each behaviour change is the user's call, and is measured with `compare` or an experiment.
- **The reload deaths stay as they are (the user, 2026-10-15).** At the 23:55 self-reload the party once died mid-pull at mummies: a character stands inactive in a hostile pack for as long as its code takes to load. Faster loading was the only real fix. Loading from this PC now takes about 1s (5.5–6.5s from jsDelivr), so the exposure is much smaller than when this was decided.

## Measured constants

From 2026-09 measurement; re-derive only if gear or levels change a lot.

| Quantity | Value | Source |
|---|---|---|
| Myras heal power | about 3,023 (varies with buffs) | live |
| Myras `mp_cost` | 61 | sampled |
| Myras sustained healing ceiling | about 4,230 HP/s (`heal × 1.46/s`) | sampled |
| `partyheal` base | a flat 800 at level 80+, ignores heal power | server |
| Incoming at fireroamer ×10 | about 5,000 HP/s | death timeline |
| Heal model accuracy | 0.9966 over 437 casts | sampled |
| Cleave reach | about 160px, `attack × (0.1 + rand × 0.8)` per target | server |
| Splash reach | `explosion / 3.6`: 11.7px for Ulric's aoe set, 14.2px for Riva's pouchbow | server |
| Monster approach | every general monster closes to within 12px between attacks | server monster AI |
| Attack uptime at the bscorpion camp | 83% of the attack speed overall, 98–99% with a monster in range; a monster in range 85% of the time, the attack ready and unused 2.6% of that (10-16, 1.7 h) | `Data Store.py uptime` |
| Burn share of damage at the camp | Ulric's fireblades 34%, Myras's firestaff 29%, Riva's firebow 24% (10-16) | `Data Store.py weapons` |
| Ulric's cleave | 741 an hour, 533k MP/h (62% of his mana) for 1.76M damage/h, about 6% of his damage (10-16) | `Data Store.py skills`, `mana` |

## Considered and rejected

- **`rpiercing` as a gear direction for Myras.** The measured marginal is about 0 at her 183: she has already all but erased Ulric's and Riva's resistance.
- **Chasing the poison quarter.** The ×0.25 on a poisoned target is real, but poisoned targets measured 0.00 at both gscorpion and fireroamer.
- **Loosening the overheal threshold.** Overheal is 17% at rest but 1.6% under real load, so the `/1.33` allowance corrects itself where it matters.
- **Fear-aware aggro** (10-16, the user's call). Capping Myras's pulls by `targets_p`/`targets_m` against her courage was rejected: the pull cap stays on mana and projected HP.
- **Kill in turn** (10-16, the user's call). One shared focus target until it dies was rejected: spreading damage across the held monsters is the party's choice for DPS (splash, cleave and multi-shot all pay on more targets).
- **Ulric's burn term is 1.39× too generous** (retired 10-16). With each burn tick credited to the weapon that set the burn, measured burn against predicted is 1.06 for Ulric's fireblades (102 windows) and 1.01 for Riva's firebow: the 1.39 came from ticks filed under whatever was worn when they landed (Combat Sampling).

## Ideas not yet measured

Each is an idea with its evidence, to be weighed against the data like any other proposal.

- **Myras can't out-heal fireroamer ×10**: about 4,230 HP/s against about 5,000 incoming. Only reducing incoming changes that.
- **`skill_min_mp_pct: 0.40` cuts dark blessing during a long crisis**, and dark blessing feeds attack, which feeds heal: a self-reinforcing dip. Observed once, survived (`Healer Skills.js`).
- **Curse pricing.** `curse` casts on the highest-HP mob with no mana price or time-to-kill check, while Riva's mark is priced by `mark_value()`. Curse's amp is inherited by splash and burn (both are applied after the amp), so it wants a short time-to-kill, clustered target. A `curse_value()` modelled on `mark_value()` would price it, and keep Riva and Myras from debuffing the same mob (`Healer Skills.js`). Measured 10-16 at the camp: 615 curses an hour cost 239k MP/h, 41% of her skill mana, against zap's 229k MP/h for 0.48M damage/h (about 2 damage per MP); she drinks at the potion limit, so the two compete for the same mana (`Data Store.py mana`, `skills`).
- **Re-centre Myras's circle on monsters not already on her** (untargeted, or on Ulric or Riva). Unlike her own pack, their positions don't follow hers (`Healer Movement.js`).
- **Skip overkilled targets.** Myras ranks protect targets by raw `mob.hp` (`hp_low`), not `remaining_hp()`, so she chases monsters the party's in-flight damage already covers. On 10-05, 73 of her 102 target samples were under 1% HP, and she had 1,041 "Monster already dead" refusals against 231 for Ulric and 102 for Riva (`Targeting.js`, `Healer Config.js` `protect_weights`). On 10-16 (0d4d368) the counts were close: Myras 428, Ulric 414, Riva 302 "Monster already dead" records, so the 4× gap of 10-05 has gone; check the rate per hour before acting.
- **Leave other players' monsters alone.** `monsters_matching()` has no "targeting a non-party player" filter; Ulric's pool and Myras's last fallback take anything in range (cooperative and event monsters would be exempt) (`Combat Utilities.js`, `Warrior Combat.js`, `Healer Combat.js`).
- **Reflection from game data.** An `attack_backfires(mob)` test reading `G.monsters[mtype].reflection`/`dreturn` instead of hand-coded encounters: reflection on tiger 100, goblin 99.95, slenderman 96, sparkbot 8 and iceroamer 8; `dreturn` on porcupine 4,800 and armadillo 30. Myras (magical) farms sparkbots with no reflection check (`Targeting.js` or `Monster Rules.js`).
- **Relocate when the spawn is contested.** Switch to another spawn box when a foreign player stays in ours, with 120s between moves. It only pays at multi-area spawns (bat 6 areas, cgoo 3, mole, stoneworm, fireroamer, plantoid and iceroamer 2; bscorpion has 1). `foreign_players_in_farm_area()` is only logged today (`Farm Ledger.js`, the encounter goal).
- **A panic step-away for Riva.** When she is panicking and her scare is spent, step to the spot farthest from monsters. From 10-11 to 10-15, 3 of her 5 deaths came while panicking, 2 of them with nothing targeting her. Never for Myras (`Movement Goal.js`).
- **Walk, don't re-join, on the event's map.** `event_goal()` sends `join` every 5s whenever the boss isn't visible, even on the event's own map, and the server teleports anyone more than 200px (franky, crabxx) or 100px (icegolem) from the entry back to it (`World Events.js`).
- **Monster Hunt quests.** Take and hand in through `interact("monsterhunt")` (progress is in `character.s.monsterhunt`). Refill only when every quest has 25+ minutes left, skip a monster after a death, stop after two deaths. A new file plus a goal.
- **Compound at the item's own scroll grade.** A higher-grade compound scroll only gives ×1.1 + 0.001, which the 10-05 estimate put at −7.2M to −8.7M gold per attempt for belts at +2/+3 with `cscroll2`, and −6.8M to −7.4M for cring and cearring at +2. The 10-13 upgrade simulation that chose "a grade above" never covered compounds (`COMBINE_PROFILE`, `Merchant Upgrading.js`). Undecided alongside it: +0 rings, earrings and amulets are both on the vendor list and in `COMBINE_PROFILE`.
- **Use the bank basement.** On "No bank space on this floor", deposit to `bank_b`; count free space only on floors Riff deposits to; merge stacks with `bank_swap` rather than through the inventory. There were 168 `bank_full` lines before per-floor planning (last on 10-11) (`Merchant Inventory.js`, `Bank Sort Order.js`).
- **Giveaways.** Scan visible stands for giveaway slots and `join_giveaway`; the server allows one entry per account, same map, in range (`Merchant Upkeep.js`).
- **Riva's 300 MP potion threshold.** She drinks at 300 MP missing and an `mpot1` gives 500, so up to 200 MP of each potion can land on a full pool; the others drink at 500. `Data Store.py mana` reports the waste per hour (`waste_h`) from 10-16.
- **Value Myras's luck gear by experiment.** `Data Store.py loot` splits drops per 100 chests at the median luck, but at the camp her luck at the kill is always 1.99 (190 of 190 chests on 10-16), so luck's effect can't be read from natural variation; alternating the kill-time luck set in `EXPERIMENTS` would measure it (offeringp: 9.5 per 100 chests at 1.99).
- **Call cost for Myras and Riva.** `cc_report` samples Ulric only (mean 114 of the 200 limit on 10-16, `equip_batch` 51% of it); Myras and Riva record only `limitdc`. Sampling them too would show whose calls approach the limit.
- **One record per dungeon run.** Dungeon samples age out of `errors.json` in 2 hours, so a run leaves nothing lasting. One archive record per run (duration, outcome, kills, deaths, loot) would make dungeons comparable; low value while none runs.
- **One camp-wait helper.** Two roles each wait at the camp with their own reset; a shared helper would need keyed state and a reset call, more than the ten lines it saves. Worth it only if a third wait appears.
- **Split `dreams_floors()`.** It runs once a day and can only be tested live, so it waits, like the rest of `Dreams Cave.js`, until someone works in it.
- **Re-engage without a reload.** An `on_destroy` that runs `kernel_teardown()` and clears `parent.__AL_LOAD_STARTED__`. The game's `stop_runner` calls `on_destroy` before removing the code iframe, and today the loader refuses a second load in the tab (`Kernel.js`, `Code Loader.js`).
- **Persist the gathering cooldowns.** Save `Date.now() + ms` from the server's `cooldown` refusal and check it before fishing or mining. Fishing's cooldown is 48 minutes and the client forgets it on reload, so Riff walks out and burns 15 × 2s retries. Only matters with gathering on (`Merchant Gathering.js`).
- **The goldbooster only where it pays.** `handle_looting()` swaps to the goldbooster and opens every chest at any distance or map, and `target_count: 99` lets it loot mid-fight. Beyond 400px or 8 minutes the server's gold multiplier is 1, and each swap adds 240ms to the next skill: about 480ms of Myras's heal tempo per loot pass. Swap only for a nearby, fresh chest (`Loot Management.js`, `Global Config.js` `LOOTING_DEFAULTS`). The user chose 2026-10-16 to leave looting as it is for now.
- **Stop refetching unusable seashells.** Every exchange fetch pulls the 15 banked seashells, fewer than the 20 an exchange needs, and they are banked again ("Only retrieved 15/9999 of seashell" every ~7 minutes on 10-14) (`Merchant Exchange.js`).

# AdventureLand Game API Reference

Quick-reference for the AdventureLand game engine internals. Originally sourced from [github.com/kaansoral/adventureland](https://github.com/kaansoral/adventureland).

**Verified against the live client on 2026-09-06 (`G.version 6732`).** The public repo has not been updated since 2026-03-01, so anything below marked *unverified* was taken from that snapshot and has NOT been re-checked against the running game. Everything else — skills, conditions, classes, slots, data counts — was dumped from the live client and is exact.

**Key source files in the game repo:**
| File | Role |
|------|------|
| `js/runner_functions.js` | Bot API — all functions available to player scripts |
| `js/runner_compat.js` | Backwards-compatible helpers (`use()`, `can_use()`, `in_attack_range()`) |
| `js/common_functions.js` | Shared utilities: distance, movement, item calculations, geometry |
| `js/functions.js` | Client-side: `use_skill()` impl, UI, NPC interaction, trading, crafting |
| `js/game.js` | Game engine: socket handlers, entity management, rendering, map loading |
| `node/server.js` | Server-side: all socket event handlers and game logic |
| `node/data.js` | Full `G` data object (13MB — all items, monsters, maps, skills, NPCs) |

---

## Game API Functions

### Combat

| Function | Signature | Returns | Notes |
|----------|-----------|---------|-------|
| `attack` | `attack(target)` | Promise | Resolve: `{source, actor, target, damage, projectile, eta, pid}`. Reject: `not_found`, `too_far`, `cooldown`, `no_mp`, `disabled`, `friendly`, `failed`, `miss` |
| `heal` | `heal(target)` | Promise | Same as attack but heals. Priests only. |
| `use_skill` | `use_skill(name, target, extra_arg)` | Promise | See skill payloads below |
| `can_attack` | `can_attack(target)` | boolean | Checks cooldown, range, disabled state |
| `can_heal` | `can_heal(target)` | boolean | Same but rejects monsters |
| `is_in_range` | `is_in_range(target, skill?)` | boolean | skill: "attack", "heal", "mentalburst", etc. |
| `is_on_cooldown` | `is_on_cooldown(skill)` | boolean | Respects shared cooldowns via `G.skills[skill].share` |
| `reduce_cooldown` | `reduce_cooldown(name, ms)` | void | Adjusts `parent.next_skill[name]` |
| `use_hp_or_mp` | `use_hp_or_mp()` | Promise | Auto-uses potions based on thresholds |

### Movement

| Function | Signature | Returns | Notes |
|----------|-----------|---------|-------|
| `move` | `move(x, y)` | Promise | Direct movement, checks `can_walk` |
| `smart_move` | `smart_move(destination, on_done?)` | Promise | BFS pathfinding. dest: `{x,y,map}`, `{to:"monster_type"}`, `{to:"map_name"}`, `{to:"npc_id"}`, `{to:"upgrade"}`, `{to:"compound"}`, `{to:"exchange"}`, `{to:"potions"}`, `{to:"scrolls"}`, or string |
| `xmove` | `xmove(x, y)` | Promise | Tries `move()` first, falls back to `smart_move()` |
| `can_move_to` | `can_move_to(x, y)` | boolean | Also accepts entity |
| `stop` | `stop(action?)` | Promise | `stop()`, `stop("move")`, `stop("smart")`, `stop("invis")`, `stop("teleport")`/`stop("town")`, `stop("revival")` |
| `transport` | `transport(map, spawn)` | Promise | Teleport to map at spawn point |
| `town` | `town()` | Promise | Town scroll — waits for `character.c.town` to clear |
| `cruise` | `cruise(speed)` | Promise | Speed cap. `cruise(500)` to revert |
| `leave` | `leave()` | Promise | Leave cyberland/jail |

### Items & Inventory

| Function | Signature | Returns | Notes |
|----------|-----------|---------|-------|
| `buy` | `buy(name, quantity?)` | Promise | Resolve: `{name, num, q, cost}` |
| `buy_with_gold` | `buy_with_gold(name, quantity?)` | Promise | |
| `buy_with_shells` | `buy_with_shells(name, quantity?)` | Promise | |
| `sell` | `sell(num, quantity?)` | Promise | num = inventory index 0-41 |
| `equip` | `equip(num, slot?)` | Promise | slot optional (e.g., "ring1") |
| `unequip` | `unequip(slot)` | Promise | |
| `equip_batch` | `equip_batch(data)` | Promise | `[{num, slot}]`, max 15 |
| `consume` | `consume(num)` | Promise | Use/consume inventory item |
| `swap` | `swap(a, b)` | Promise | Inventory swap between slots |
| `split` | `split(num, quantity)` | Promise | Split stack |
| `locate_item` | `locate_item(name)` | number | Returns inventory index or -1 |
| `quantity` | `quantity(name)` | number | Total quantity across all slots |
| `item_properties` | `item_properties(item)` | object | Full item properties including level bonuses |
| `item_grade` | `item_grade(item)` | number | 0=Normal, 1=High, 2=Rare |
| `item_value` | `item_value(item)` | number | Gold value |
| `destroy` | `destroy(num)` | Promise | |
| `lock_item` | `lock_item(num)` | Promise | |
| `seal_item` | `seal_item(num)` | Promise | Can't unlock for 2 days |
| `unlock_item` | `unlock_item(num)` | Promise | |
| `activate` | `activate(num)` | Promise | Activate booster |
| `shift` | `shift(num, name)` | Promise | `shift(0,'xpbooster')` / `'luckbooster'` / `'goldbooster'` |

### Upgrading & Crafting

| Function | Signature | Returns | Notes |
|----------|-----------|---------|-------|
| `upgrade` | `upgrade(item_num, scroll_num, offering_num?, only_calculate?)` | Promise | Resolve: `{success, level, num}` |
| `compound` | `compound(item0, item1, item2, scroll_num, offering_num?, only_calculate?)` | Promise | 3 same items + scroll |
| `craft` | `craft(i0,i1,...,i8)` | Promise | 3x3 grid (inventory indices, null for empty) |
| `auto_craft` | `auto_craft(name)` | Promise | Auto-picks items |
| `dismantle` | `dismantle(item_num)` | Promise | |
| `exchange` | `exchange(item_num)` | Promise | Returns `{success, reward, num}` |
| `exchange_buy` | `exchange_buy(token, name)` | Promise | e.g., `exchange_buy('funtoken','confetti')` |

### Banking

| Function | Signature | Returns | Notes |
|----------|-----------|---------|-------|
| `bank_deposit` | `bank_deposit(gold)` | Promise | Must be at bank |
| `bank_withdraw` | `bank_withdraw(gold)` | Promise | |
| `bank_store` | `bank_store(num, pack?, pack_num?)` | Promise | `bank_store(0)` auto-finds slot |
| `bank_retrieve` | `bank_retrieve(pack, pack_num, num?)` | Promise | |
| `bank_swap` | `bank_swap(pack, a, b)` | Promise | |

### Trading

| Function | Signature | Returns | Notes |
|----------|-----------|---------|-------|
| `trade` | `trade(num, trade_slot, price, quantity?)` | Promise | trade_slot: 1-16 |
| `trade_buy` | `trade_buy(target, trade_slot, quantity?)` | Promise | |
| `trade_sell` | `trade_sell(target, trade_slot, quantity?)` | Promise | |
| `wishlist` | `wishlist(trade_slot, name, price, level, quantity?)` | Promise | "Want to Buy" |
| `open_stand` | `open_stand(num?)` | Promise | |
| `close_stand` | `close_stand()` | Promise | |

### Sending

| Function | Signature | Returns | Notes |
|----------|-----------|---------|-------|
| `send_gold` | `send_gold(receiver, gold)` | Promise | name or entity |
| `send_item` | `send_item(receiver, num, quantity?)` | Promise | |
| `send_mail` | `send_mail(to, subject, message, item?)` | Promise | item=true sends slot 0 |

### Communication

| Function | Signature | Returns | Notes |
|----------|-----------|---------|-------|
| `say` | `say(message)` | Promise | Public chat |
| `party_say` | `party_say(message)` | Promise | |
| `pm` | `pm(name, message)` | Promise | |
| `send_cm` | `send_cm(to, message)` | Promise | Code message. to = name or array. Received via `character.on("cm", fn)` |

### Party

| Function | Signature | Returns | Notes |
|----------|-----------|---------|-------|
| `send_party_invite` | `send_party_invite(name)` | Promise | |
| `send_party_request` | `send_party_request(name)` | Promise | |
| `accept_party_invite` | `accept_party_invite(name)` | Promise | |
| `accept_party_request` | `accept_party_request(name)` | Promise | |
| `leave_party` | `leave_party()` | Promise | |
| `kick_party_member` | `kick_party_member(name)` | Promise | |
| `accept_magiport` | `accept_magiport(name)` | Promise | |

### Targeting & Entity Lookup

| Function | Signature | Returns | Notes |
|----------|-----------|---------|-------|
| `get_target` | `get_target()` | entity/null | |
| `get_targeted_monster` | `get_targeted_monster()` | entity/null | Only alive monsters |
| `change_target` | `change_target(target)` | void | Sends to server |
| `change_target_privately` | `change_target_privately(target)` | void | Local only |
| `get_target_of` | `get_target_of(entity)` | entity/null | |
| `get_monster` | `get_monster(id)` | entity/null | By monster ID |
| `get_player` | `get_player(name)` | entity/null | |
| `get_entity` | `get_entity(id)` | entity/null | |
| `get_nearest_monster` | `get_nearest_monster(args?)` | entity/null | args: `{max_att, min_xp, target, no_target, path_check, type}` |
| `get_nearest_hostile` | `get_nearest_hostile(args?)` | entity/null | args: `{friendship, exclude}` |
| `find_npc` | `find_npc(npc_id)` | `{map, in, x, y}` | |

### Character Management

| Function | Signature | Returns | Notes |
|----------|-----------|---------|-------|
| `start_character` | `start_character(name, code_slot)` | Promise | |
| `stop_character` | `stop_character(name)` | void | |
| `command_character` | `command_character(name, code_snippet)` | void | Execute code on another character |
| `get_active_characters` | `get_active_characters()` | object | States: "self", "starting", "loading", "active", "code" |
| `change_server` | `change_server(region, name)` | void | e.g., `change_server("EU","I")` |
| `respawn` | `respawn()` | Promise | |

### Persistent Storage

| Function | Signature | Returns | Notes |
|----------|-----------|---------|-------|
| `set` | `set(name, value)` | boolean | localStorage |
| `get` | `get(name)` | any | |

### Drawing

| Function | Signature | Returns | Notes |
|----------|-----------|---------|-------|
| `draw_line` | `draw_line(x,y,x2,y2,size?,color?)` | PIXI.Graphics | |
| `draw_circle` | `draw_circle(x,y,radius,size?,color?)` | PIXI.Graphics | |
| `clear_drawings` | `clear_drawings()` | void | |

### Utility

| Function | Signature | Returns | Notes |
|----------|-----------|---------|-------|
| `loot` | `loot(id_or_arg?)` | Promise | `loot()` nearby, `loot(id)` specific, `loot(true)` commander |
| `interact` | `interact("monsterhunt")` | Promise | Start/complete monster hunt |
| `enter` | `enter(place, name?)` | Promise | Instance: "duelland", "crypt", "winter_instance" |
| `is_monster` | `is_monster(entity)` | boolean | |
| `is_character` | `is_character(entity)` | boolean | |
| `is_moving` | `is_moving(entity)` | boolean | |
| `is_transporting` | `is_transporting(entity)` | boolean | |
| `in_pvp` | `in_pvp()` | boolean | |
| `game_log` | `game_log(message, color?)` | void | |
| `log` | `log(message, color?)` | void | Stringifies objects |
| `set_message` | `set_message(text, color?)` | void | Status message display |
| `show_json` | `show_json(obj)` | void | |

### Compat Helpers (`runner_compat.js`)

| Function | Signature | Returns | Notes |
|----------|-----------|---------|-------|
| `can_use` | `can_use(name)` | boolean | Checks class + cooldown |
| `use` | `use(name, target?)` | void | String = skill, integer = equip slot |
| `in_attack_range` | `in_attack_range(target)` | boolean | |
| `handle_death` | `handle_death()` | void | Override for custom death behavior |

### Common Functions (`common_functions.js`)

| Function | Notes |
|----------|-------|
| `distance(a, b)` | Rectangle-to-rectangle using entity dimensions. 99999999 for different maps |
| `simple_distance(a, b)` | Point-to-point |
| `point_distance(x0,y0,x1,y1)` | Raw Euclidean |
| `can_move({map, x, y, going_x, going_y, base?})` | Tests collision geometry |
| `mssince(date)` | ms since date |
| `ssince(date)` | seconds since |
| `msince(date)` | minutes since |
| `future_ms(ms)` | `new Date(Date.now() + ms)` |
| `sleep(ms)` | Returns Promise |
| `clone(obj)` | Deep clone |

### Present in the live client, not yet documented above

Confirmed to exist as globals in the code frame (`G.version 6732`) but **names only** — the dump captured the function list, not signatures, so parameters and return values here are unknown and must be checked in-game before use. Listed because several are directly useful and were absent from this reference entirely.

- **Keybinds, skillbar & custom UI** — `set_keymap` `unmap_key` `reset_mappings` `map_key` `set_skillbar` `add_top_button` `add_bottom_button` `set_button_value` `set_button_color` `set_button_onclick` `clear_buttons` `code_draw` `plot`
- **Social & PvP** — `send_friend_request` `accept_friend_request` `unfriend` `send_duel_challenge` `accept_duel_challenge` `enter_duel` `get_pvp_history` `is_pvp`
- **Economy & venues** — `buy_lost_and_found` `get_lost_and_found` `buy_secondhand` `get_secondhands` `donate_gold` `bet_dice` `play_slots` `giveaway` `join_giveaway` `get_tavern_info` `take_mail_item` `open_bank_pack`
- **Item inspection & disposal** — `destat_item` `destroy_item` `preview_item` `calculate_item_grade` `calculate_item_value` `calculate_item_properties` `can_add_item` `can_add_items` `can_stack` `throw_item`
- **Lookup & code slots** — `get_characters` `get_servers` `get_socket` `get_map` `get_party` `get_chests` `get_nearest_npc` `get_active_code_slot` `get_edited_code_slot` `load_code` `upload_code`
- **State predicates** — `is_disabled` `is_silenced` `is_paused` `is_npc` `is_player` `is_character_local` `is_in_front` `is_point_inside` `is_door_close` `can_use_door` `can_move` `can_transport`
- **Movement internals** — `use_nearest_door` `smooth_path` `calculate_move` `calculate_move_v2` `unstuck_logic`
- **Async & events** — `sleep` `wait_for` `wait_for_event` `deferred` `push_deferred` `resolve_deferred` `reject_deferred` `trigger_event` `trigger_character_event`
- **Messaging** — `send_local_cm` `send_server_cm`
- **Misc** — `api_call` `bless_server` `pause` `set_home` `set_base`
---

## Socket Events

> **Unverified.** Socket event names are not enumerable from `G`, so this section still reflects the 2026-03-01 repo snapshot and was not re-checked against the live client. Treat as a starting point, not ground truth.

### Client -> Server (`parent.socket.emit`)

#### Core Actions
| Event | Payload | Notes |
|-------|---------|-------|
| `attack` | `{id}` | |
| `heal` | `{id}` | |
| `move` | `{x, y, going_x, going_y, m}` | |
| `skill` | varies — see skill payloads | |
| `transport` | `{to: map, s: spawn}` | |
| `town` | (none) | Town scroll |
| `respawn` | (none) | |
| `stop` | `{action}` | "town", "invis", "revival" |
| `use` | `{item: "hp"/"mp"}` | Potions |

#### Items
| Event | Payload |
|-------|---------|
| `equip` | `{num, slot?, consume?}` |
| `equip_batch` | `[{num, slot}, ...]` (max 15) |
| `unequip` | `{slot}` |
| `buy` | `{name, quantity}` |
| `sell` | `{num, quantity}` |
| `upgrade` | `{item_num, scroll_num, offering_num?, clevel, calculate?}` |
| `compound` | `{items:[i0,i1,i2], scroll_num, offering_num?, clevel, calculate?}` |
| `craft` | `{items: [9 slots]}` |
| `dismantle` | `{num}` |
| `exchange` | `{item_num, q}` |
| `imove` | `{a, b}` — inventory swap |
| `destroy` | `{num, q?, statue?}` |
| `split` | `{num, quantity}` |
| `booster` | `{num, action, to?}` — "activate", "shift" |

#### Banking
| Event | Payload |
|-------|---------|
| `bank` | `{operation, amount?, pack?, str?, inv?, a?, b?}` — "deposit", "withdraw", "swap", "move" |

#### Communication
| Event | Payload |
|-------|---------|
| `say` | `{message, code?, party?, name?}` |
| `cm` | `{to, message}` — code message (JSON string) |

#### Social
| Event | Payload |
|-------|---------|
| `party` | `{event, name?, id?}` — "invite", "accept", "request", "raccept", "leave", "kick" |
| `send` | `{name, gold?, num?, q?, cx?}` — gold/items/cosmetics |
| `mail` | `{to, subject, message, item?}` |
| `target` | `{id, xid}` |
| `trade_buy` | `{slot, id, rid, q}` |
| `trade_sell` | `{slot, id, rid, q}` |
| `merchant` | `{num}` or `{close:1}` |
| `enter` | `{place, name?}` |
| `join` | `{name}` |
| `monsterhunt` | (none) |
| `interaction` | string (e.g., "the_lever") |
| `property` | `{afk?, typing?}` |
| `harakiri` | (none) — suicide |

#### Skill Payloads (`socket.emit("skill", {...})`)

| Skill | Payload |
|-------|---------|
| Generic targeted | `{name, id}` |
| Generic untargeted | `{name}` |
| `blink` | `{name:"blink", x, y}` |
| `dash` | `{name:"dash", x, y}` |
| `3shot` | `{name:"3shot", ids:[id1,id2,id3]}` |
| `5shot` | `{name:"5shot", ids:[...]}` |
| `cburst` | `{name:"cburst", targets:[[id,mp],...]}` |
| `pcoat` | `{name:"pcoat", num}` (poison slot) |
| `revive` | `{name:"revive", num, id}` (essenceoflife slot) |
| `entangle` | `{name:"entangle", num, id}` |
| `poisonarrow` | `{name:"poisonarrow", num, id}` |
| `throw` | `{name:"throw", num, id}` (item slot) |
| `energize` | `{name:"energize", id, mp}` |

### Server -> Client Events

| Event | Data | Notes |
|-------|------|-------|
| `welcome` | `{S, map, ...}` | Initial connection |
| `start` | Full character + entities + server info | Game start |
| `new_map` | `{name, in, x, y, entities, ...}` | Map transition |
| `player` | Partial character data | State updates |
| `entities` | `{type, players:{}, monsters:{}}` | Entity batch |
| `correction` | `{x, y}` | Position correction |
| `action` | `{attacker, target, source, projectile, damage?, heal?, pid, eta}` | Attack/heal animation |
| `hit` | `{id, hid, damage?, heal?, crit?, kill?, evade?, miss?, reflect?, ...}` | Damage resolution |
| `death` | `{id, place?, reason?}` | |
| `disappear` | `{id, place?, reason?}` | |
| `game_response` | `{response, ...}` | Universal response — see response types below |
| `game_log` | `{message, color?}` | |
| `game_error` | `{message}` | |
| `cm` | `{name, message}` | Code message (JSON string) |
| `pm` | `{owner, message}` | |
| `invite` | `{name}` | Party invite |
| `request` | `{name}` | Party request |
| `magiport` | `{name}` | |
| `party_update` | `{list?, party?, leave?}` | |
| `drop` | chest/loot data | |
| `chest_opened` | loot result | |
| `skill_timeout` | `{name, ms}` | Cooldown info |
| `q_data` | `{q, num, p}` | Upgrade/compound/exchange progress |
| `game_event` | `{name, ...}` | pinkgoo, goblin, etc. |

#### Key `game_response` Types
`upgrade_success`, `upgrade_fail`, `upgrade_no_item`, `upgrade_in_progress`, `upgrade_no_scroll`, `upgrade_mismatch`, `upgrade_cant`, `upgrade_chance`, `compound_success`, `compound_fail`, `compound_no_scroll`, `compound_in_progress`, `compound_mismatch`, `compound_cant`, `compound_chance`, `max_level`, `exchange_existing`, `exchange_notenough`, `cooldown`, `too_far`, `miss`, `disabled`, `no_mp`, `friendly`, `no_target`, `inventory_full`, `storage_full`, `bank_unavailable`, `locked`, `receiver_unavailable`, `not_ready`, `cant`

---

## Character Object Properties

### Core State
```
name, id, ctype, owner, skin, level
x, y, real_x, real_y
from_x, from_y, going_x, going_y
moving, vx, vy, move_num
hp, mp, max_hp, max_mp, xp
range, attack, speed, frequency
rip                          // dead?
map, in                      // current map/instance
gold, esize                  // gold on hand, empty inventory slots
ping, cc                     // latency, call costs remaining
```

### Stats
```
str, int, dex, vit, for
armor, resistance
evasion, reflection
lifesteal, manasteal
crit, critdamage
dreturn                      // damage return %
apiercing, rpiercing         // armor/resistance piercing
pnresistance, firesistance, fzresistance, phresistance, stresistance
luck, output, courage, mcourage, pcourage
blast, explosion, stun
mp_cost, mp_reduction
```

### Equipment (`character.slots`)
```
mainhand, offhand, helmet, chest, pants, shoes, gloves, cape
ring1, ring2, earring1, earring2, amulet, belt, orb, elixir
trade1-trade48               // merchant trade slots
```
Each slot: `{name, level?, q?, rid?, ...}` or null.

### Inventory (`character.items`)
42 slots (0-41). Each: `{name, level?, q?, p?, l?, ...}` or null.

### Status Effects (`character.s`)
Object where each key = effect name, value = `{ms: remaining_ms, ...}`. All 78 live conditions from `G.conditions` (`G.version 6732`):

- **Disabling / control** — `stunned` `fingered` `stoned` `deepfreezed` `sleeping` `frozen` `charmed` `tangled` `woven` `shocked` `slowness` `dampened` `weakness`
- **Damage over time** — `burned` `eburn` `poisoned` `poisonous` `sanguine`
- **Defensive** — `invincible` `hardshell` `mshield` `aether_shield` `fullguard` `fullguardx` `block` `reflection` `sheltered` `phasedout` `invis`
- **Paladin** — `paladin_aura_bulwark` `paladin_aura_sanctuary` `paladin_aura_warding` `paladin_aura_zeal` `guardians_oath` `beacon_of_resolve` `purifier`
- **Offensive buffs** — `power` `xpower` `warcry` `darkblessing` `mcourage` `mfrenzy` `marked` `xshotted` `energized` `charging` `dash` `rspeed` `stack`
- **Merchant** — `massproduction` `massproductionpp` `massexchange` `massexchangepp` `mluck` `mlifesteal` `pickpocket` `fishing` `mining`
- **Healing / regen** — `eheal` `sugarrush` `patronsgrace` `newcomersblessing`
- **Event / seasonal** — `easterluck` `halloween0` `halloween1` `halloween2` `holidayspirit` `hopsickness`
- **Meta / account** — `monsterhunt` `penalty_cd` `licenced` `town` `authfail` `notverified` `realmfatigue` `withdrawal` `blink` `cursed`

`monsterhunt` carries `{id, ms, sn}`. Skill-granted buffs share the skill's name (see the Skills table), so `character.s.warcry` etc. double as "is the buff up" checks.

### Channeling (`character.c`)
```
town                         // town scroll in progress
```

### Bank (`character.bank`) — only at bank
```
gold                         // banked gold
items0-items47               // bank pack arrays
```

### Queue (`character.q`)
```
upgrade, compound, exchange  // present during those operations
```

### Party
```
character.party              // party name
parent.party                 // {memberName: {share, ...}}
parent.party_list            // array of member names
```

---

## Entity Properties (`parent.entities`)

### Common (Players + Monsters)
```
id, type, name
x, y, real_x, real_y, moving, speed
hp, max_hp, level, s
visible, dead, map, in
```

### Monster-Specific
```
mtype                        // monster type key (e.g., "goo", "bee")
target                       // who they're targeting
attack, xp, armor, resistance, rage
```

### Player-Specific
```
ctype, owner, party, guild, team
slots, stand, afk, rip, npc
```

---

## Skills (`G.skills`)

`G.skills` holds 127 entries, 84 of them actual skills (the rest are UI actions like `move_up`, `toggle_code`). Listed below are the 55 relevant to this party — every skill our scripts call, plus all warrior/priest/ranger/merchant and all-class skills. Values are exact as of `G.version 6732`.

`share` is the shared-cooldown group `is_on_cooldown()` respects — note the ranger's multi-shots share the `attack` cooldown, which is why they belong in `action_loop` rather than `skill_loop`.

| skill | class | lvl | mp | cooldown | range | share | wtype | notes |
|---|---|---|---|---|---|---|---|---|
| `boop` | all |  | 20 | 15000 | 120 |  |  | target player |
| `charm` | all |  | 40 | 60000 |  |  |  | dur 30000; target monster; cond charmed; use_range |
| `drop_egg` | all |  |  | 2000 |  |  |  |  |
| `fart` | all |  | 20 | 2000 |  |  |  |  |
| `headwiggle` | all |  |  | 2000 |  |  |  |  |
| `hearts_single` | all |  |  | 2000 |  |  |  |  |
| `highfive` | all |  | 30 | 20000 | 80 |  |  | target player |
| `joy` | all |  |  | 25000 |  |  |  |  |
| `jump` | all |  |  | 4000 |  |  |  |  |
| `mirrordance` | all |  | 250 | 120000 |  |  |  |  |
| `pocketstorm` | all |  | 100 | 60000 |  |  |  |  |
| `power` | all |  | 320 | 500 |  |  |  | dur 4000; cond power |
| `scare` | all |  | 50 | 5000 |  |  |  |  |
| `shelter` | all |  | 240 | 60000 |  |  |  | dur 6000; cond sheltered |
| `snowball` | all |  | 120 | 180 | 720 |  |  | dur 5000; target True; cond frozen |
| `spotlight` | all |  | 150 | 90000 | 240 |  |  | target player |
| `superjump` | all |  | 10 | 10000 |  |  |  |  |
| `tangle` | all |  | 40 | 60000 |  |  |  | target True; use_range |
| `temporalsurge` | all |  | 1000 | 60000 |  |  |  |  |
| `warp` | all |  | 40 | 200 |  |  |  |  |
| `wiggle` | all |  |  | 2000 |  |  |  |  |
| `xpower` | all |  | 320 | 500 |  |  |  | dur 6000; cond xpower |
| `zapperzap` | all |  | 140 | 200 | 420 |  |  | target True |
| `fishing` | merchant | 16 | 120 |  | 15 |  | rod |  |
| `massexchange` | merchant | 40 | 30 | 50 |  |  |  | dur 10000; cond massexchange |
| `massexchangepp` | merchant | 70 | 200 | 50 |  |  |  | dur 10000; cond massexchangepp |
| `massproduction` | merchant | 30 | 20 | 50 |  |  |  | dur 10000; cond massproduction |
| `massproductionpp` | merchant | 60 | 200 | 50 |  |  |  | dur 10000; cond massproductionpp |
| `mcourage` | merchant | 70 | 2400 | 2000 |  |  |  | dur 10000; cond mcourage |
| `mfrenzy` | merchant | 85 | 400 | 20000 |  |  |  | dur 5000; cond mfrenzy |
| `mining` | merchant | 16 | 120 |  | 15 |  | pickaxe |  |
| `mluck` | merchant | 40 | 10 | 100 | 320 |  |  | dur 3600000; target player; cond mluck |
| `throw` | merchant | 60 | 200 | 400 | 200 |  |  | target True |
| `absorb` | priest | 55 | 200 | 400 | 240 |  |  | target player |
| `curse` | priest |  | 400 | 5000 | 200 |  |  | dur 5000; target True; cond cursed |
| `darkblessing` | priest | 70 | 900 | 60000 | 600 |  |  | dur 8000; cond darkblessing |
| `partyheal` | priest |  | 400 | 200 |  |  |  | multi |
| `phaseout` | priest | 64 | 200 | 4000 |  |  |  | dur 5000; cond phasedout |
| `revive` | priest |  | 500 | 200 | 240 |  |  | target player |
| `3shot` | ranger | 60 | 200 |  |  | attack | bow,crossbow | dmg x 0.7; cd x 1; multi; use_range |
| `4fingers` | ranger | 64 | 260 | 40000 | 120 |  |  | dur 5000; target player; cond fingered |
| `5shot` | ranger | 75 | 320 |  |  | attack | bow,crossbow | dmg x 0.5; cd x 1; multi; use_range |
| `huntersmark` | ranger |  | 240 | 10000 |  |  |  | dur 10000; target True; cond marked; use_range |
| `piercingshot` | ranger | 72 | 64 |  |  | attack | bow,crossbow | dmg x 0.75; cd x 1; target True; use_range |
| `poisonarrow` | ranger |  | 360 | 300 |  |  | bow,crossbow | dur 5000; target True; cond poisoned; use_range |
| `supershot` | ranger |  | 400 | 30000 |  |  | bow,crossbow | dmg x 1.5; target True; use_range |
| `track` | ranger |  | 80 | 1600 | 1440 |  |  |  |
| `agitate` | warrior | 68 | 420 | 2200 | 320 |  |  |  |
| `charge` | warrior |  | 0 | 40000 |  |  |  | dur 3200; cond charging |
| `cleave` | warrior | 52 | 720 | 1200 | 160 |  | axe,scythe |  |
| `dash` | warrior |  | 120 | 0 |  |  |  |  |
| `hardshell` | warrior | 60 | 480 | 16000 |  |  |  | dur 8000; cond hardshell |
| `stomp` | warrior | 52 | 120 | 24000 | 400 |  | basher | dur 3200; cond stunned |
| `taunt` | warrior |  | 40 | 3000 | 200 |  |  | target True |
| `warcry` | warrior | 70 | 320 | 60000 | 600 |  |  | dur 8000; cond warcry |

---
## Game Data (`parent.G`)

Live totals (`G.version 6732`): **580 items, 129 monsters, 54 maps, 133 NPCs, 127 skill entries, 78 conditions.**

| Key | Content |
|-----|---------|
| `G.items` | All items. Props: `name, id, g (gold), type, wtype, tier, grade, grades[], upgrade{}, compound{}, damage_type, range, attack, armor, class[], set, s (stack size), ...` |
| `G.monsters` | All monsters. Props: `name, hp, attack, speed, range, xp, armor, resistance, frequency, damage_type, respawn, aggro, rage, ...` |
| `G.maps` | All maps. Props: `name, spawns[][], doors[][], npcs[{id, position}], monsters[{type, count, boundary}], pvp, safe, instance, ...` |
| `G.skills` | All skills. Props: `name, class[], mp, cooldown, range, share, wtype, level, consume, slot, requirements, ...` |
| `G.npcs` | NPCs. Notable: `G.npcs.transporter.places` = map destinations |
| `G.craft` | Crafting recipes |
| `G.dismantle` | Dismantle recipes |
| `G.conditions` | Status conditions/buffs |
| `G.geometry` | Map collision: `{x_lines[], y_lines[]}` per map |
| `G.classes` | Class definitions |
| `G.sets` | Equipment set bonuses |
| `G.levels` | XP requirements by level |
| `G.titles` | Title/property bonuses |

### Server Data (`parent.S`)
Live event/boss status. Keys = event names when active:
```
S.holidayseason, S.pinkgoo, S.goblin, S.dragold, ...
```
Each has: `live`, `hp`, `x`, `y`, `map` (when applicable).

---

## Event System

### `character.on(event, callback)`

| Event | Callback | Notes |
|-------|----------|-------|
| `cm` | `({name, message})` | Code message |
| `hit` | `({actor, target, damage?, heal?, crit?})` | Character was hit |
| `target_hit` | `({actor, target, damage?})` | Your attack landed |
| `death` | `({})` | Character died |
| `level_up` | `({level})` | |
| `new_map` | `({name, in, x, y})` | |
| `loot` | `(data)` | Chest opened |
| `stacked` | `({method, ids})` | Multiple mobs same spot |
| `mobbing` | `({intensity})` | Being mobbed |
| `gold_sent/received` | `({amount, to/from})` | |
| `item_sent/received` | `({name, q, num, to/from})` | |

### Overridable Callbacks
```javascript
on_party_invite(name)
on_party_request(name)
on_magiport(name)
on_map_click(x, y)          // return true to cancel default
on_destroy()                 // before CODE destroyed
on_draw()                    // each frame (60fps)
handle_death()               // custom death behavior
```

---

## Combat System

### Damage Flow
1. `attack(target)` -> `socket.emit("attack", {id})`
2. Server validates: range, cooldown, MP, disabled, PVP
3. Server emits `action` (projectile animation)
4. On arrival, server emits `hit` (damage resolution)

### Damage Reduction
- `damage_multiplier(defense)`: 100 armor/resistance = ~10% reduction (diminishing returns)
- Physical attacks reduced by armor, magical by resistance
- `apiercing`/`rpiercing` bypass defense
- Priests: heal at full power, attack at 40%

### Cooldowns
- `parent.next_skill[name]` = Date objects
- `G.skills[name].cooldown` = base ms
- `G.skills[name].share` = shared cooldown group

### Disable Checks
- `is_disabled(entity)` — `rip`, `stunned`, `fingered`, `stoned`, `deepfreezed`, `sleeping`
- `is_silenced(entity)` — disabled OR `s.silenced`
- `can_walk(entity)` — not disabled, not dashing, not transporting

---

## Movement System

### Smart Move Internals
- BFS with 15px steps (5px near start/target)
- Tests `G.geometry[map]` collision data (x_lines, y_lines)
- Handles map transitions via doors and transporters
- Runs on 80ms interval
- `smart.moving`, `smart.plot`, `smart.flags`

### Map Geometry
- `G.geometry[map].x_lines` — vertical collision: `[x, y_start, y_end]`
- `G.geometry[map].y_lines` — horizontal collision: `[y, x_start, x_end]`
- Doors: `G.maps[map].doors` = `[x, y, w, h, target_map, target_spawn, ...]`

---

## Item System

### Upgrade Multipliers Per Level
| Property | Per Level |
|----------|-----------|
| armor/resistance | +2.25 |
| str/int/dex/vit/for | +1 |
| attack (via stat) | varies |
| speed | +0.325 |
| frequency | +0.325 |
| evasion | +0.325 |
| crit | +0.125 |
| lifesteal | +0.15 |
| mp_cost | -0.6 |
| output | +0.175 |

### Level Multiplier Bonuses
**Upgrade:** 7 (1.25x), 8 (1.5x), 9 (2x), 10 (3x), 11 (1.25x), 12 (1.25x)
**Compound:** 5 (1.25x), 6 (1.5x), 7 (2x), 8+ (3x)

### Item Grades
Defined by `G.items[name].grades` (default `[9,10,11,12]`):
- 0 = Normal, 1 = High, 2 = Rare, 3/4 = higher

### Scroll Types
- Upgrade: `scroll0`, `scroll1`, `scroll2` (grade 0/1/2)
- Compound: `cscroll0`, `cscroll1`, `cscroll2` (grade 0/1/2)

### Special Properties (`item.p`)
`"shiny"`, `"glitched"`, `"legacy"` — bonus stats

---

## Constants & Enums

### Character Classes

| class | main stat | attack |
|---|---|---|
| `warrior` | str | physical |
| `paladin` | str | physical |
| `rogue` | dex | physical |
| `ranger` | dex | physical |
| `mage` | int | magical |
| `priest` | int | magical |
| `merchant` | int | none |

### Equipment Slots
```javascript
["ring1","ring2","earring1","earring2","belt","mainhand","offhand",
 "helmet","chest","pants","shoes","gloves","amulet","orb","elixir","cape"]
```

### Weapon Types
```javascript
"sword", "short_sword", "great_sword", "axe", "wblade", "basher",
"dartgun", "bow", "crossbow", "rapier", "spear", "fist", "dagger",
"stars", "mace", "pmace", "staff", "wand"
// Two-handed: "axe", "basher", "great_staff"
// Off-hand types: "quiver", "shield", "misc_offhand", "source"
```

### Bank Packs
- `items0-items7`: "bank" map
- `items8-items23`: "bank_b" map
- `items24-items47`: "bank_u" map

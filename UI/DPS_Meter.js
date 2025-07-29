// All currently supported damageTypes: "Base", "Blast", "Burn", "HPS", "MPS", "DR", "RF", "DPS", "Dmg Taken"
// Displaying too many "Types" will result in a really wide meter that will effect the game_log window. i recommend only tracking 4/5 things at a time for general use
const damageTypes = ["Base", "Burn", "Blast", "DPS"];

// Toggle settings
let displayClassTypeColors = true;
let displayDamageTypeColors = true;
let showOverheal = false;
let showOverManasteal = true;

// Color mapping
const damageTypeColors = {
    Base: '#A92000',
    Blast: '#782D33',
    Burn: '#FF7F27',
    HPS: '#9A1D27',
    MPS: '#353C9C',
    DR: '#E94959',
    RF: '#D880F0',
    DPS: '#FFD700',
    "Dmg Taken": '#FF4C4C'
};

// Initialize the class color mapping
const classColors = {
    mage: '#3FC7EB',
    paladin: '#F48CBA',
    priest: '#FFFFFF',
    ranger: '#AAD372',
    rogue: '#FFF468',
    warrior: '#C69B6D'
};

// Overall-sums variables (optional use)
let damage = 0, burnDamage = 0, blastDamage = 0, baseDamage = 0;
let baseHeal = 0, lifesteal = 0, manasteal = 0, dreturn = 0, reflect = 0;
const METER_START = performance.now();

// Per-member tracking
let playerDamageSums = {};

function getPlayerEntry(id) {
    if (!playerDamageSums[id]) {
        playerDamageSums[id] = {
            startTime: performance.now(),
            sumDamage: 0,
            sumBurnDamage: 0,
            sumBlastDamage: 0,
            sumBaseDamage: 0,
            sumHeal: 0,
            sumLifesteal: 0,
            sumManaSteal: 0,
            sumDamageReturn: 0,
            sumReflection: 0,
            sumDamageTakenPhys: 0,
            sumDamageTakenMag: 0,
            // Rolling‐window event buffers:
            damageEvents: [],
            burnEvents: [],
            blastEvents: [],
            baseEvents: [],
            healEvents: [],
            manaStealEvents: [],
            dreturnEvents: [],
            reflectEvents: [],
            dmgTakenPhysEvents: [],
            dmgTakenMagEvents: []
        };
    }
    return playerDamageSums[id];
}

function getFormatted(val) {
    return val.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function initDPSMeter() {
    const $ = parent.$;
    const brc = $('#bottomrightcorner');
    brc.find('#dpsmeter').remove();
    const container = $("<div id='dpsmeter'></div>").css({
        fontSize: '20px', color: 'white', textAlign: 'center', display: 'table',
        overflow: 'hidden', marginBottom: '-3px', width: '100%', backgroundColor: 'rgba(0,0,0,0.6)'
    });
    container.append(
        $("<div id='dpsmetercontent'></div>").css({
            display: 'table-cell', verticalAlign: 'middle', padding: '2px',
            border: '4px solid grey'
        })
    );
    brc.children().first().after(container);
}

// Handle all hit events
parent.socket.on('hit', data => {
    const isParty = id => parent.party_list.includes(id);
    try {
        // == Party-only filter ==
        const attackerInParty = isParty(data.hid);
        const targetInParty   = isParty(data.id);
        if (!attackerInParty && !targetInParty) return;

        // == Overall sums ==
        if (data.damage) {
            damage += data.damage;
            if (data.source === 'burn') burnDamage  += data.damage;
            else if (data.splash)   blastDamage += data.damage;
            else                     baseDamage  += data.damage;
        }
        if (data.heal || data.lifesteal) {
            baseHeal    += (data.heal    ?? 0) + (data.lifesteal ?? 0);
            lifesteal   += data.lifesteal ?? 0;
        }
        if (data.manasteal) manasteal += data.manasteal;

        // == Damage Return attribution (only mob→player) ==
        if (data.dreturn && get_player(data.id) && !get_player(data.hid)) {
            dreturn += data.dreturn;
            const e = getPlayerEntry(data.id);
            if (e.sumDamageReturn == null) e.sumDamageReturn = 0;
            e.sumDamageReturn += data.dreturn;
            // Rolling window
            e.dreturnEvents.push({ t: performance.now(), v: data.dreturn });
            e.damageEvents.push ({ t: performance.now(), v: data.dreturn });
        }

        // == Reflection attribution (only mob→player) ==
        if (data.reflect && get_player(data.id) && !get_player(data.hid)) {
            reflect += data.reflect;
            const e = getPlayerEntry(data.id);
            if (e.sumReflection == null) e.sumReflection = 0;
            e.sumReflection += data.reflect;
            // Rolling window
            e.reflectEvents.push({ t: performance.now(), v: data.reflect });
            e.damageEvents.push ({ t: performance.now(), v: data.reflect });
        }

        // == Damage taken by character ==
        if (data.damage && get_player(data.id)) {
            const e = getPlayerEntry(data.id);
            if (data.damage_type === 'physical') {
                e.sumDamageTakenPhys += data.damage;
                e.dmgTakenPhysEvents.push({ t: performance.now(), v: data.damage });
            } else {
                e.sumDamageTakenMag += data.damage;
                e.dmgTakenMagEvents.push({ t: performance.now(), v: data.damage });
            }
        }
        // — self-damage from hitting a dreturn mob (physical)
        if (data.dreturn && get_player(data.hid)) {
            const e = getPlayerEntry(data.hid);
            e.sumDamageTakenPhys += data.dreturn;
            e.dmgTakenPhysEvents.push({ t: performance.now(), v: data.dreturn });
        }
        // — self-damage from hitting a reflect mob (magical)
        if (data.reflect && get_player(data.hid)) {
            const e = getPlayerEntry(data.hid);
            e.sumDamageTakenMag += data.reflect;
            e.dmgTakenMagEvents.push({ t: performance.now(), v: data.reflect });
        }

        // == Character actions – Heal / Lifesteal ==
        if (get_player(data.hid) && (data.heal || data.lifesteal)) {
            const e = getPlayerEntry(data.hid);
            const healer = get_player(data.hid);
            const target = get_player(data.id);
            const totalHeal = (data.heal ?? 0) + (data.lifesteal ?? 0);
            if (showOverheal) {
                e.sumHeal += totalHeal;
                e.healEvents.push({ t: performance.now(), v: totalHeal });
            } else {
                const actualHeal =
                    (data.heal ? Math.min(data.heal, (target?.max_hp ?? 0) - (target?.hp ?? 0)) : 0)
                  + (data.lifesteal ? Math.min(data.lifesteal, healer.max_hp - healer.hp) : 0);
                e.sumHeal += actualHeal;
                e.healEvents.push({ t: performance.now(), v: actualHeal });
            }
        }

        // == Mana steal ==
        if (get_player(data.hid) && data.manasteal) {
            const e = getPlayerEntry(data.hid);
            const p = get_entity(data.hid);
            const amount = showOverManasteal
                ? data.manasteal
                : Math.min(data.manasteal, p.max_mp - p.mp);
            e.sumManaSteal += amount;
            e.manaStealEvents.push({ t: performance.now(), v: amount });
        }

        // == Other damage done (per-player breakdown) ==
        if (data.damage && get_player(data.hid)) {
            const e = getPlayerEntry(data.hid);
            e.sumDamage += data.damage;
            if (data.source === 'burn') {
                e.sumBurnDamage += data.damage;
                e.burnEvents.push({ t: performance.now(), v: data.damage });
            } else if (data.splash) {
                e.sumBlastDamage += data.damage;
                e.blastEvents.push({ t: performance.now(), v: data.damage });
            } else {
                e.sumBaseDamage += data.damage;
                e.baseEvents.push({ t: performance.now(), v: data.damage });
            }
            // Rolling window
            e.damageEvents.push({ t: performance.now(), v: data.damage });
        }
    } catch (err) {
        console.error('hit handler error', err);
    }
});

// Compute stat value for type using a 5-minute rolling window
function getTypeValue(type, entry) {
    const now = performance.now();
    const windowStart = Math.max(entry.startTime, now - 5 * 60 * 1000);
    const windowMs = now - windowStart;
    if (windowMs <= 0) return 0;

    function sumEvents(arr) {
        return arr.reduce((sum, ev) => ev.t >= windowStart ? sum + ev.v : sum, 0);
    }

    switch (type) {
        case 'DPS': {
            const total = sumEvents(entry.damageEvents);
            return Math.floor(total * 1000 / windowMs);
        }
        case 'Burn': {
            const total = sumEvents(entry.burnEvents);
            return Math.floor(total * 1000 / windowMs);
        }
        case 'Blast': {
            const total = sumEvents(entry.blastEvents);
            return Math.floor(total * 1000 / windowMs);
        }
        case 'Base': {
            const total = sumEvents(entry.baseEvents);
            return Math.floor(total * 1000 / windowMs);
        }
        case 'HPS': {
            const total = sumEvents(entry.healEvents);
            return Math.floor(total * 1000 / windowMs);
        }
        case 'MPS': {
            const total = sumEvents(entry.manaStealEvents);
            return Math.floor(total * 1000 / windowMs);
        }
        case 'DR': {
            const total = sumEvents(entry.dreturnEvents);
            return Math.floor(total * 1000 / windowMs);
        }
        case 'RF': {
            const total = sumEvents(entry.reflectEvents);
            return Math.floor(total * 1000 / windowMs);
        }
        case 'Dmg Taken': {
            const phys = sumEvents(entry.dmgTakenPhysEvents);
            const mag  = sumEvents(entry.dmgTakenMagEvents);
            return {
                phys: Math.floor(phys * 1000 / windowMs),
                mag:  Math.floor(mag  * 1000 / windowMs)
            };
        }
        default:
            return 0;
    }
}

// Calculate DPS for sorting (also rolling window)
function calculateDPSForEntry(entry) {
    const now = performance.now();
    const windowStart = Math.max(entry.startTime, now - 5 * 60 * 1000);
    const windowMs = now - windowStart;
    if (windowMs <= 0) return 0;
    const total = entry.damageEvents.reduce((sum, ev) => ev.t >= windowStart ? sum + ev.v : sum, 0);
    return Math.floor(total * 1000 / windowMs);
}

// Render the DPS meter UI
function updateDPSMeterUI() {
    const $ = parent.$;
    const c = $('#dpsmetercontent');
    if (!c.length) return;

    // Elapsed time display
    const elapsedMs = performance.now() - METER_START;
    const hrs = Math.floor(elapsedMs / 3600000);
    const mins = Math.floor((elapsedMs % 3600000) / 60000);

    let html = `<div>👑 Elapsed Time: ${hrs}h ${mins}m 👑</div>` +
        '<table border="1" style="width:100%"><tr><th></th>';

    // Header row
    damageTypes.forEach(t => {
        const col = displayDamageTypeColors ? damageTypeColors[t] || 'white' : 'white';
        html += `<th style='color:${col}'>${t}</th>`;
    });
    html += '</tr>';

    // Player rows
    const sorted = Object.entries(playerDamageSums)
        .map(([id, e]) => ({ id, dps: calculateDPSForEntry(e), e }))
        .sort((a, b) => b.dps - a.dps);

    sorted.forEach(({ id, e }) => {
        const p = get_player(id);
        if (!p) return;
        const nameCol = displayClassTypeColors
            ? classColors[p.ctype.toLowerCase()] || '#FFFFFF'
            : '#FFFFFF';
        html += `<tr><td style='color:${nameCol}'>${p.name}</td>`;
        damageTypes.forEach(t => {
            if (t === 'Dmg Taken') {
                const { phys, mag } = getTypeValue(t, e);
                html += `<td><span style='color:#FF4C4C'>${getFormatted(phys)}</span> | <span style='color:#6ECFF6'>${getFormatted(mag)}</span></td>`;
            } else {
                const val = getTypeValue(t, e);
                html += `<td>${getFormatted(val)}</td>`;
            }
        });
        html += '</tr>';
    });

    // Total row (unchanged logic)
    html += `<tr><td style='color:${damageTypeColors['DPS']}'>Total DPS</td>`;
    damageTypes.forEach(t => {
        if (t === 'Dmg Taken') {
            let totP = 0, totM = 0;
            Object.values(playerDamageSums).forEach(e => {
                const { phys, mag } = getTypeValue(t, e);
                totP += phys; totM += mag;
            });
            html += `<td><span style='color:#FF4C4C'>${getFormatted(totP)}</span> | <span style='color:#6ECFF6'>${getFormatted(totM)}</span></td>`;
        } else if (t === 'DPS') {
            let totalDmg = 0;
            Object.values(playerDamageSums).forEach(e => {
                totalDmg += e.damageEvents.reduce((sum, ev) => sum + ev.v, 0)
                           + e.dreturnEvents .reduce((sum, ev) => sum + ev.v, 0)
                           + e.reflectEvents .reduce((sum, ev) => sum + ev.v, 0);
            });
            const elapsed = performance.now() - METER_START;
            const totalDPS = Math.floor(totalDmg * 1000 / Math.max(elapsed, 1));
            html += `<td>${getFormatted(totalDPS)}</td>`;
        } else {
            let tot = 0;
            Object.values(playerDamageSums).forEach(e => tot += getTypeValue(t, e));
            html += `<td>${getFormatted(tot)}</td>`;
        }
    });

    html += '</tr></table>';
    c.html(html);
}

// Initialize and run
initDPSMeter();
setInterval(updateDPSMeterUI, 250);

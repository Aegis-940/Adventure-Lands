// === CONFIGURATION === //
const damageTypes = ["Base", "Burn", "Blast", "DPS"];
let displayClassTypeColors = true;
let displayDamageTypeColors = true;
let showOverheal = false;
let showOverManasteal = true;

const damageTypeColors = {
    Base: '#A92000', Blast: '#782D33', Burn: '#FF7F27', HPS: '#9A1D27',
    MPS: '#353C9C', DR: '#E94959', RF: '#D880F0', DPS: '#FFD700', "Dmg Taken": '#FF4C4C'
};

const classColors = {
    mage: '#3FC7EB', paladin: '#F48CBA', priest: '#FFFFFF',
    ranger: '#AAD372', rogue: '#FFF468', warrior: '#C69B6D'
};

// === ROLLING TRACKING === //
const ROLLING_WINDOW = 5 * 60 * 1000; // 5 minutes
let playerDamageLogs = {};

// === HELPERS === //
function getPlayerLog(id) {
    if (!playerDamageLogs[id]) playerDamageLogs[id] = [];
    return playerDamageLogs[id];
}

function getFormatted(val) {
    return val.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function getTypeValue(type, logs) {
    const now = performance.now();
    const recent = logs.filter(e => now - e.timestamp <= ROLLING_WINDOW);

    switch (type) {
        case 'DPS': {
            const total = recent
                .filter(e => ['damage', 'reflect', 'dreturn'].includes(e.type))
                .reduce((sum, e) => sum + e.value, 0);
            return Math.floor(total * 1000 / ROLLING_WINDOW);
        }
        case 'Burn':
            return Math.floor(recent.filter(e => e.type === 'burn').reduce((sum, e) => sum + e.value, 0) * 1000 / ROLLING_WINDOW);
        case 'Blast':
            return Math.floor(recent.filter(e => e.type === 'blast').reduce((sum, e) => sum + e.value, 0) * 1000 / ROLLING_WINDOW);
        case 'Base':
            return Math.floor(recent.filter(e => e.type === 'base').reduce((sum, e) => sum + e.value, 0) * 1000 / ROLLING_WINDOW);
        default:
            return 0;
    }
}

function calculateDPSForEntry(logs) {
    const now = performance.now();
    const recent = logs.filter(e => now - e.timestamp <= ROLLING_WINDOW);
    const total = recent
        .filter(e => ['damage', 'reflect', 'dreturn'].includes(e.type))
        .reduce((sum, e) => sum + e.value, 0);
    return Math.floor(total * 1000 / ROLLING_WINDOW);
}

// === UI INITIALIZATION === //
function initDPSMeter() {
    const $ = parent.$;
    const brc = $('#bottomrightcorner');
    brc.find('#dpsmeter').remove();
    const container = $("<div id='dpsmeter'></div>").css({
        fontSize: '20px', color: 'white', textAlign: 'center',
        display: 'table', overflow: 'hidden', marginBottom: '-3px',
        width: '100%', backgroundColor: 'rgba(0,0,0,0.6)'
    });
    container.append(
        $("<div id='dpsmetercontent'></div>").css({
            display: 'table-cell', verticalAlign: 'middle',
            padding: '2px', border: '4px solid grey'
        })
    );
    brc.children().first().after(container);
}

// === HIT EVENT HANDLER === //
parent.socket.on('hit', data => {
    const isParty = id => parent.party_list.includes(id);
    try {
        const now = performance.now();
        if (!isParty(data.hid) && !isParty(data.id)) return;

        if (data.damage && get_player(data.hid)) {
            const logs = getPlayerLog(data.hid);
            if (data.source === 'burn') logs.push({ type: 'burn', value: data.damage, timestamp: now });
            else if (data.splash) logs.push({ type: 'blast', value: data.damage, timestamp: now });
            else logs.push({ type: 'base', value: data.damage, timestamp: now });
            logs.push({ type: 'damage', value: data.damage, timestamp: now });
        }

        if (data.dreturn && get_player(data.id) && !get_player(data.hid)) {
            const logs = getPlayerLog(data.id);
            logs.push({ type: 'dreturn', value: data.dreturn, timestamp: now });
        }

        if (data.reflect && get_player(data.id) && !get_player(data.hid)) {
            const logs = getPlayerLog(data.id);
            logs.push({ type: 'reflect', value: data.reflect, timestamp: now });
        }

    } catch (err) {
        console.error('hit handler error', err);
    }
});

// === DPS METER UI RENDER === //
function updateDPSMeterUI() {
    const $ = parent.$;
    const c = $('#dpsmetercontent');
    if (!c.length) return;

    const now = performance.now();
    const mins = Math.floor(ROLLING_WINDOW / 60000);
    let html = `<div>⏳ Rolling Window: ${mins} min</div><table border="1" style="width:100%"><tr><th></th>`;

    damageTypes.forEach(t => {
        const col = displayDamageTypeColors ? damageTypeColors[t] || 'white' : 'white';
        html += `<th style='color:${col}'>${t}</th>`;
    });
    html += '</tr>';

    const sorted = Object.entries(playerDamageLogs)
        .map(([id, logs]) => ({ id, logs, dps: calculateDPSForEntry(logs) }))
        .sort((a, b) => b.dps - a.dps);

    sorted.forEach(({ id, logs }) => {
        const p = get_player(id);
        if (!p) return;
        const nameCol = displayClassTypeColors ? classColors[p.ctype.toLowerCase()] || '#FFFFFF' : '#FFFFFF';
        html += `<tr><td style='color:${nameCol}'>${p.name}</td>`;
        damageTypes.forEach(t => {
            const val = getTypeValue(t, logs);
            html += `<td>${getFormatted(val)}</td>`;
        });
        html += '</tr>';
    });

    html += `<tr><td style='color:${damageTypeColors['DPS']}'>Total DPS</td>`;
    damageTypes.forEach(t => {
        let tot = 0;
        Object.values(playerDamageLogs).forEach(logs => tot += getTypeValue(t, logs));
        html += `<td>${getFormatted(tot)}</td>`;
    });
    html += '</tr></table>';
    c.html(html);
}

// === START === //
initDPSMeter();
setInterval(updateDPSMeterUI, 250);

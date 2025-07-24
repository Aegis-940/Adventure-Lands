// === XP Tracker with 5-Minute Rolling Average === //

let xp_history = [];
let xp_interval = 'minute'; // Options: 'second', 'minute', 'hour'
let target_xp_rate = 40000; // Customize your goal
const XP_TRACK_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

// === Init UI === //
const initXpTracker = () => {
    const $ = parent.$;
    $('#bottomrightcorner').find('#xptimer').remove();

    const xp_container = $('<div id="xptimer"></div>').css({
        background: 'black',
        border: 'solid gray',
        borderWidth: '4px 4px',
        width: "98%",
        height: '66px',
        fontSize: '25px',
        color: '#00FF00',
        textAlign: 'center',
        display: 'table',
        overflow: 'hidden',
        marginBottom: '-5px',
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
    });

    $('<div id="xptimercontent"></div>')
        .css({ display: 'table-cell', verticalAlign: 'middle' })
        .html('Rolling XP Rate:<br><span id="xpcounter" style="font-size: 30px;">Loading...</span><br><span id="xprate">(Waiting for data)</span>')
        .appendTo(xp_container);

    $('#bottomrightcorner').children().first().after(xp_container);
};

// === Format XP Rate Display === //
const updateXpTracker = () => {
    const now = Date.now();
    const $ = parent.$;

    // Track current XP
    xp_history.push({ time: now, xp: character.xp });

    // Clean history to 5-minute window
    xp_history = xp_history.filter(entry => entry.time >= now - XP_TRACK_WINDOW_MS);

    if (xp_history.length < 2) return;

    const first = xp_history[0];
    const last = xp_history.at(-1);
    const elapsed_sec = (last.time - first.time) / 1000;
    const gained_xp = last.xp - first.xp;

    let rate = 0;
    switch (xp_interval) {
        case 'second':
            rate = gained_xp / elapsed_sec;
            break;
        case 'minute':
            rate = gained_xp / (elapsed_sec / 60);
            break;
        case 'hour':
            rate = gained_xp / (elapsed_sec / 3600);
            break;
    }

    // Format & Display
    const color = getXpRateColor(rate, target_xp_rate);
    $('#xpcounter').css('color', '#87CEEB').text(`${(elapsed_sec / 60).toFixed(1)} min tracked`);
    $('#xprate').css('color', color).html(`${ncomma(Math.round(rate))} XP/${xp_interval}`);
};

// === Color Indicator === //
const getXpRateColor = (avg, target) => {
    if (avg < target * 0.5) return '#FF0000';      // Red
    if (avg < target) return '#FFA500';            // Orange
    if (avg <= target * 1.2) return '#FFFF00';      // Yellow
    if (avg <= target * 1.5) return '#90EE90';      // Light Green
    return '#00FF00';                              // Bright Green
};

// === Helper: Comma Format === //
const ncomma = (x) => x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

// === External: Change Interval if needed === //
const setXpInterval = (interval) => {
    if (['second', 'minute', 'hour'].includes(interval)) {
        xp_interval = interval;
        console.log(`XP interval set to '${interval}'.`);
    } else {
        console.warn(`Invalid interval: ${interval}`);
    }
};

// === Activate Tracker === //
initXpTracker();
setInterval(updateXpTracker, 1000); // update every second

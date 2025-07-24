let xp_history = []; // Store XP data over time
const XP_ROLLING_WINDOW = 5 * 60 * 1000; // 5 minutes
let target_xp_rate = 40000; // Your goal XP rate (per minute)

const init_xp_timer = () => {
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
        .html('Estimated time until level up:<br><span id="xpcounter" style="font-size: 30px;">Loading...</span><br><span id="xprate">(Kill something!)</span>')
        .appendTo(xp_container);

    $('#bottomrightcorner').children().first().after(xp_container);
};

const update_xp_timer = () => {
    const $ = parent.$;
    const now = Date.now();

    // Push current XP state
    xp_history.push({ t: now, xp: character.xp });

    // Keep only the last 5 minutes
    xp_history = xp_history.filter(entry => entry.t >= now - XP_ROLLING_WINDOW);

    if (xp_history.length < 2) return; // Not enough data

    const first_entry = xp_history[0];
    const last_entry = xp_history[xp_history.length - 1];
    const elapsed_time = (last_entry.t - first_entry.t) / 1000; // seconds
    const xp_gain = last_entry.xp - first_entry.xp;

    if (elapsed_time <= 0 || xp_gain <= 0) return;

    const xp_per_minute = xp_gain / (elapsed_time / 60);
    const xp_remaining = parent.G.levels[character.level] - character.xp;
    const seconds_remaining = Math.round(xp_remaining / (xp_gain / elapsed_time));

    $('#xpcounter').css('color', '#87CEEB').text(format_remaining_time(seconds_remaining));

    const color = get_xp_rate_color(xp_per_minute, target_xp_rate);
    $('#xprate').css('color', color).html(`<span class="xprate-container">${ncomma(Math.round(xp_per_minute))} XP/min</span>`);
};

const format_remaining_time = (seconds) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${minutes}min`;
};

const get_xp_rate_color = (avg, target) => {
    if (avg < target * 0.5) return '#FF0000';
    if (avg < target) return '#FFA500';
    if (avg <= target * 1.2) return '#FFFF00';
    if (avg <= target * 1.5) return '#90EE90';
    return '#00FF00';
};

const ncomma = (x) => x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

// Initialize and loop
init_xp_timer();
setInterval(update_xp_timer, 500);

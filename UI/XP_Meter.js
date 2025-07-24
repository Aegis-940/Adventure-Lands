let xpHistory = []; // Store XP data over time
const XP_ROLLING_WINDOW = 5 * 60 * 1000; // 5 minutes in milliseconds
let largestXPGain = 0;
let xpInterval = 'minute'; // Keep this for display; it's now always a 5-min rolling window
let targetXpRate = 40000; // Set your target XP rate

// Initialize the XP timer display
const initXpTimer = () => {
    const $ = parent.$;
    $('#bottomrightcorner').find('#xptimer').remove();
    
    const xpContainer = $('<div id="xptimer"></div>').css({
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
        .appendTo(xpContainer);
    
    $('#bottomrightcorner').children().first().after(xpContainer);
};

// Update the XP timer display
const updateXpTimer = () => {
    const $ = parent.$;
    const now = Date.now();

    // Update XP history and trim to last 5 minutes
    xpHistory.push({ t: now, xp: character.xp });
    xpHistory = xpHistory.filter(entry => entry.t >= now - XP_ROLLING_WINDOW);

    if (xpHistory.length < 2) return; // Not enough data to calculate

    const elapsedTime = (xpHistory.at(-1).t - xpHistory[0].t) / 1000;
    const xpGain = xpHistory.at(-1).xp - xpHistory[0].xp;

    if (elapsedTime <= 0 || xpGain <= 0) return;

    const averageXP = xpGain / (elapsedTime / 60); // XP per minute

    const xpMissing = parent.G.levels[character.level] - character.xp;
    const secondsRemaining = Math.round(xpMissing / (xpGain / elapsedTime));
    const counter = formatRemainingTime(secondsRemaining);

    $('#xpcounter').css('color', '#87CEEB').text(counter);

    const xpRateColor = getXpRateColor(averageXP, targetXpRate);
    $('#xprate').css('color', xpRateColor).html(`<span class="xprate-container">${ncomma(Math.round(averageXP))} XP/min</span>`);
};

// Format remaining time
const formatRemainingTime = (seconds) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${minutes}min`;
};

// Determine XP color
const getXpRateColor = (averageXP, targetXpRate) => {
    if (averageXP < targetXpRate * 0.5) return '#FF0000';
    if (averageXP < targetXpRate) return '#FFA500';
    if (averageXP <= targetXpRate * 1.2) return '#FFFF00';
    if (averageXP <= targetXpRate * 1.5) return '#90EE90';
    return '#00FF00';
};

const ncomma = (x) => x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

// Optional interval selector (no longer used directly, but preserved for compatibility)
const setXPInterval = (newInterval) => {
    if (['second', 'minute', 'hour', 'day'].includes(newInterval)) {
        xpInterval = newInterval;
        console.log(`XP interval label set to ${xpInterval} (logic is now fixed at 5 min)`);
    } else {
        console.warn(`Invalid interval: ${newInterval}`);
    }
};

// Init and start
initXpTimer();
setInterval(updateXpTimer, 500);

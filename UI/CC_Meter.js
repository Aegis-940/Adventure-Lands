// --------------------------------------------------------------------------------------------------------------------------------- //
// CC METER DISPLAY (0 - 200) with rolling min/max markers (60s)
// --------------------------------------------------------------------------------------------------------------------------------- //

const MAX_CC = 200;
const CC_HISTORY = []; // { timestamp: number, value: number }

const cc_meter = () => {
	const $ = parent.$;
	const brc = $('#bottomrightcorner');
	brc.find('#ccmeter').remove();

	const cc_container = $('<div id="ccmeter"></div>').css({
		width:        '100%',
		marginTop:    '4px',
		marginBottom: '-4px',
		fontSize:     '20px',
		color:        'white',
		textAlign:    'center',
		display:      'table',
	});

	const cc_bar = $('<div id="ccbar"></div>').css({
		display:       'table-cell',
		verticalAlign: 'middle',
		width:         '100%',
		height:        '28px',
		background:    'rgba(0,0,0,0.3)',
		border:        '2px solid gray',
		position:      'relative',
	});

	const cc_fill = $('<div id="ccfill"></div>').css({
		position:   'absolute',
		top:        0,
		left:       0,
		height:     '100%',
		width:      '0%',
		background: 'linear-gradient(to right, #1e90ff, #4169e1)',
	});

	const cc_text = $('<div id="cctext"></div>').css({
		position:       'absolute',
		top:            0,
		left:           0,
		width:          '100%',
		height:         '100%',
		display:        'flex',
		alignItems:     'center',
		justifyContent: 'center',
		fontWeight:     'bold',
		color:          '#FFFFFF',
		textShadow:     '1px 1px 2px black',
		pointerEvents:  'none',
	});

	// Marker for lowest value
	const low_mark = $('<div id="low_mark"></div>').css({
		position:       'absolute',
		top:            '0px',
		width:          '2px',
		height:         '100%',
		background:     'red',
		opacity:        0.6,
		pointerEvents:  'none',
	});

	// Marker for highest value
	const high_mark = $('<div id="high_mark"></div>').css({
		position:       'absolute',
		top:            '0px',
		width:          '2px',
		height:         '100%',
		background:     'lime',
		opacity:        0.6,
		pointerEvents:  'none',
	});

	cc_bar.append(cc_fill).append(low_mark).append(high_mark).append(cc_text);
	cc_container.append(cc_bar);
	brc.children().first().after(cc_container);
};

const update_cc_display = () => {
	const $ = parent.$;
	const now = Date.now();
	const current_cc = Math.min(character.cc, MAX_CC);
	const percent = Math.floor((current_cc / MAX_CC) * 100);

	// Update fill and text
	$('#ccfill').css('width', `${percent}%`);
	$('#cctext').text(`CC: ${Math.floor(current_cc)}/${MAX_CC}`);

	// Update history: add new value, remove old
	CC_HISTORY.push({ timestamp: now, value: current_cc });
	while (CC_HISTORY.length && CC_HISTORY[0].timestamp < now - 60000) {
		CC_HISTORY.shift();
	}

	// Determine min/max in last 60s
	const values = CC_HISTORY.map(e => e.value);
	const min = Math.min(...values);
	const max = Math.max(...values);

	const min_percent = Math.floor((min / MAX_CC) * 100);
	const max_percent = Math.floor((max / MAX_CC) * 100);

	$('#low_mark').css('left', `${min_percent}%`);
	$('#high_mark').css('left', `${max_percent}%`);
};

// Refresh the CC bar 10 times per second
setInterval(update_cc_display, 100);

// Start
cc_meter();

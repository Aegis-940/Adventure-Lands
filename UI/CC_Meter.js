// --------------------------------------------------------------------------------------------------------------------------------- //
// CC METER DISPLAY (0 - 200)
// --------------------------------------------------------------------------------------------------------------------------------- //

const MAX_CC = 200;

// Initialize the CC meter UI
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

	cc_bar.append(cc_fill).append(cc_text);
	cc_container.append(cc_bar);
	brc.children().first().after(cc_container);
};

// Update the cc meter display
const update_cc_display = () => {
	const $ = parent.$;
	const current_cc = Math.min(character.cc, MAX_CC);
	const percent = Math.floor((current_cc / MAX_CC) * 100);

	$('#ccfill').css('width', `${percent}%`);
	$('#cctext').text(`CC: ${Math.floor(current_cc)}/${MAX_CC}`);
};

// Refresh the CC bar 10 times per second
setInterval(update_cc_display, 100);

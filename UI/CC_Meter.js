// --------------------------------------------------------------------------------------------------------------------------------- //
// CC METER DISPLAY (0 - 200)
// --------------------------------------------------------------------------------------------------------------------------------- //

const MAX_CC = 200;

// Initialize the CC meter UI
const cc_meter = () => {
	const $ = parent.$;
	const brc = $('#bottomrightcorner');
	brc.find('#ccmeter').remove();

	const ccContainer = $('<div id="ccmeter"></div>').css({
		width:        '100%',
		marginTop:    '4px',
		marginBottom: '-4px',
		fontSize:     '20px',
		color:        'white',
		textAlign:    'center',
		display:      'table',
	});

	const ccBar = $('<div id="ccbar"></div>').css({
		display:       'table-cell',
		verticalAlign: 'middle',
		width:         '100%',
		height:        '28px',
		background:    'rgba(0,0,0,0.3)',
		border:        '2px solid gray',
		position:      'relative',
	});

	const ccFill = $('<div id="ccfill"></div>').css({
		position: 'absolute',
		top:      0,
		left:     0,
		height:   '100%',
		width:    '0%',
		background: 'linear-gradient(to right, #1e90ff, #4169e1)',
	});

	const ccText = $('<div id="cctext"></div>').css({
		position:     'absolute',
		width:        '100%',
		height:       '100%',
		lineHeight:   '28px',
		fontWeight:   'bold',
		color:        '#FFFFFF',
		textShadow:   '1px 1px 2px black',
	});

	ccBar.append(ccFill).append(ccText);
	ccContainer.append(ccBar);
	brc.children().first().after(ccContainer);
};

// Update the cc meter display
const update_cc_display = () => {
	const $ = parent.$;
	const currentCc = Math.min(character.cc, MAX_CC);
	const percent = (currentCc / MAX_CC * 100).toFixed(1);

	$('#ccfill').css('width', `${percent}%`);
	$('#cctext').text(`CC: ${currentCc}/${MAX_CC}`);
};

// Refresh the CC bar 10 times per second
setInterval(update_cc_display, 100);

// Kick things off
cc_meter();

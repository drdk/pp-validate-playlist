// --------------------------------------------------------------
// Requirements
// --------------------------------------------------------------
const moment = require('moment');
const setTitle = require('node-bash-title');
const fs = require('fs');
const util = require('util');

setTitle('pp-validate-playlist');

// data.js
const appInfo = require('./data.js').appInfo;
const event_type = require('./data.js').event_type;

// http.js
const httpGetWithTimeout = require('./http.js').httpGetWithTimeout;

const myLastRan = moment().format('[pp-validate-playlist last ran at ]HH:mm:ss[ on ]YYYY-MM-DD');
const myLogFilenameBase = appInfo.loggingPath + moment().format('YYYY-MM-DD');
const log_file = fs.openSync(myLogFilenameBase + '_console.log', 'a'); // Append daily log file
const log_stdout = process.stdout;

console.log = function (d) {
	fs.writeSync(log_file, util.format(d) + '\n');
	log_stdout.write(util.format(d) + '\n');
};

console.log('\n==================================================================');
tsConsoleLog('Starting application...');
// console.log(JSON.stringify(appInfo, null, 2));

validatePlaylists(appInfo);
// Main program ends

async function validatePlaylists(appInfo) {
	for (const e of appInfo.channel) {
		console.log('==================================================================');
		const channel = e.name;

		// ----------------------------------------------------------------------------------------------------
		// Get Gallium events from the liveEpgAPI REST API
		// ----------------------------------------------------------------------------------------------------
		let galliumEvents = [];
		let ipAddressGallium = '';
		let currentBroadcastDay = moment().format('YYYY-MM-DD'); // Default

		for (let i = 0; i < appInfo.liveEpgApiIpAddress.length && galliumEvents.length == 0; i++) {
			const cmdIpAddressGallium = `http://${appInfo.liveEpgApiIpAddress[i]}:8000/api/masterIpAddress/${channel}`;
			const cmdBroadcastDay     = `http://${appInfo.liveEpgApiIpAddress[i]}:8000/api/currentBroadcastDay/${channel}`;
			const commandEpgFull      = `http://${appInfo.liveEpgApiIpAddress[i]}:8000/api/epgFull/${channel}`;

            try {
                ipAddressGallium = await httpGetWithTimeout(cmdIpAddressGallium, { timeout: 10000, type: 'text' });
                currentBroadcastDay = await httpGetWithTimeout(cmdBroadcastDay, { timeout: 10000, type: 'text' });
                galliumEvents = await httpGetWithTimeout(commandEpgFull, { timeout: 10000, type: 'json' });
            } catch (err) {
                tsConsoleLog(`WARNING: Failed to get LiveEPG information for ${channel} from ${appInfo.liveEpgApiIpAddress[i]}`);
                // console.log(err);
            }

			if (Array.isArray(galliumEvents) === false) {
				tsConsoleLog(commandEpgFull + ' - ' + galliumEvents);
				galliumEvents = [];
			}
		}

		// currentBroadcastDay will be invalid if the length of galliumEvents is zero, or no events include the custom parameter
		if (galliumEvents.length == 0 || moment(currentBroadcastDay, 'YYYY-MM-DD', true).isValid() === false) {
			const currentDay = moment().format('YYYY-MM-DD');
			const currentHour = parseInt(moment().format('HH'));
			const bDayOffset = currentHour < 5 ? 1 : 0; // Assume broadcast day rolls-over at 05:00
			currentBroadcastDay = moment(currentDay, 'YYYY-MM-DD').subtract(bDayOffset, 'day').format('YYYY-MM-DD');
		}

		const nextBroadcastDay = moment(currentBroadcastDay, 'YYYY-MM-DD').add(1, 'day').format('YYYY-MM-DD');

		tsConsoleLog(channel + ': Broadcast days: ' + currentBroadcastDay + ', ' + nextBroadcastDay);
		tsConsoleLog('- ' + galliumEvents.length + ' Gallium events' + (galliumEvents.length > 0 ? ', starting with ' + galliumEvents[0].startDate + ' ' + galliumEvents[0].startTime + ' ' + galliumEvents[0].title : ''));

		// Determine if there are any gaps in the Gallium playlist
		for (let i = 0; i < galliumEvents.length; i++) {
			galliumEvents[i].gap = i < galliumEvents.length - 1 ? getStartTimeOffset(galliumEvents[i].locEndDateTimeMs, galliumEvents[i + 1].locStartDateTimeMs) : '';
		}

		// ----------------------------------------------------------------------------------------------------
		// Get WhatsOn events for current and next broadcast day
		// ----------------------------------------------------------------------------------------------------
        const url_1 = `http://localhost:8001/api/schedules/${channel}/${currentBroadcastDay}?events=0x7&time=now`;
        const url_2 = `http://localhost:8001/api/schedules/${channel}/${nextBroadcastDay}?events=0x7&time=now`;
        let woEvents_1 = [];
        let woEvents_2 = [];

        try {
            woEvents_1 = await httpGetWithTimeout(url_1, { timeout: 10000, type: 'json' });
            woEvents_2 = await httpGetWithTimeout(url_2, { timeout: 10000, type: 'json' });
        } catch (err) {
            tsConsoleLog(`ERROR: Failed to get day schedule for ${channel}`);
            console.log(err);
        }

		let woEvents = [...woEvents_1, ...woEvents_2];

		// console.log(JSON.stringify(woEvents, null, 2));

		tsConsoleLog('- ' + woEvents.length + ' WhatsOn events' + (woEvents.length > 0 ? ', starting with ' + woEvents[0].wonStartDateTime + ' ' + woEvents[0].title : ''));

		// Determine if there are any gaps in the WhatsOn playlist
		for (let i = 0; i < woEvents.length; i++) {
			woEvents[i].gap = i < woEvents.length - 1
						 	 ? getStartTimeOffset(woEvents[i].wonStopDateTime, woEvents[i + 1].wonStartDateTime)
							 : '';
		}

		// Compare the lists and look for discontinuities
		let masterEvents = [];
		let gIdx_next = 0;

		for (let i = 0; i < woEvents.length; i++) {
			// First check if the woEvent exists in galliumEvents, checking txEventId and starting from gIdx_next
			let gIdx = undefined;
			for (let j = gIdx_next; j < galliumEvents.length; j++) {
				if (woEvents[i].txEventId == galliumEvents[j].txEventId) {
					gIdx = j;
					break; // EXIT the j loop
				}
			}

			// NOTE: ValidateAsRun requires extra checks here for matching production

			if (gIdx === undefined) {
				// woEvents[i] was not found in galliumEvents[]
				myItem = {};
				copyWonParameters(myItem, woEvents, i);
				copyGalliumParameters(myItem, undefined, undefined);
				masterEvents.push(myItem);
				// Do not increment gIdx_next
			} else if (gIdx == gIdx_next) {
				// woEvents and galliumEvents have incremented together
				myItem = {};
				copyWonParameters(myItem, woEvents, i);
				copyGalliumParameters(myItem, galliumEvents, gIdx);
				masterEvents.push(myItem);
				gIdx_next++;
			} else if (gIdx > gIdx_next) {
				// One or more galliumEvents are out of order before woEvents[i]
				for (let j = gIdx_next; j < gIdx; j++) {
					myItem = {};
					copyWonParameters(myItem, undefined, undefined);
					copyGalliumParameters(myItem, galliumEvents, j);
					masterEvents.push(myItem);
					gIdx_next++;
				}

				// Now add the galliumEvents match with woEvents[i]
				myItem = {};
				copyWonParameters(myItem, woEvents, i);
				copyGalliumParameters(myItem, galliumEvents, gIdx);
				masterEvents.push(myItem);
				gIdx_next = gIdx + 1;
			}
		}

		// We have finished looping through WhatsOn events, but there might be some Gallium events left
		for (let j = gIdx_next; j < galliumEvents.length; j++) {
			myItem = {};
			copyWonParameters(myItem, undefined, undefined);
			copyGalliumParameters(myItem, galliumEvents, j);
			masterEvents.push(myItem);
			gIdx_next++;
		}

		// ----------------------------------------------------------------------------------------------------
		// Calculate the startTimeOffset and durationDiff for each object in masterEvents
		// ----------------------------------------------------------------------------------------------------
        for (const event of masterEvents) {
			event.startTimeOffset = getStartTimeOffset(event.wonStartDateTime, event.galliumStartDateTime);
			event.durationDiff = getDurationDiff(event.wonDuration, event.galliumDuration);
        }
		// console.log(JSON.stringify(masterEvents, null, 2));

		// ----------------------------------------------------------------------------------------------------
		// Write the array into a json file
		// ----------------------------------------------------------------------------------------------------
		const myFilenameJson = appInfo.monitoringPath + channel + '.json';
		fs.writeFileSync(myFilenameJson, JSON.stringify(masterEvents, null, 2), 'utf-8');
		tsConsoleLog('JSON information saved to ' + myFilenameJson);

		// ----------------------------------------------------------------------------------------------------
		// Create a web page
		// ----------------------------------------------------------------------------------------------------
		const myFilenameHtml = appInfo.monitoringPath + channel + '.html';
		const htmlData = createHtmlPage(masterEvents, channel, ipAddressGallium);
		fs.writeFileSync(myFilenameHtml, htmlData, 'utf-8');
		tsConsoleLog('HTML table saved to ' + myFilenameHtml);
	}

	console.log('==================================================================');
	tsConsoleLog('Console saved to ' + myLogFilenameBase + '_console.log');
	console.log('==================================================================');
	tsConsoleLog('Application completed successfully');
}

function copyGalliumParameters(myItem, galliumEvents, i) {
	if (galliumEvents !== undefined && i < galliumEvents.length) {
		myItem.galliumIdx 			= i + 1;
		myItem.galliumStartDateTime = galliumEvents[i].locStartDateTimeMs;
		myItem.galliumStartTime 	= getTimeFrames(galliumEvents[i].locStartDateTimeMs.split(' ')[1]);
		myItem.galliumStopDateTime 	= galliumEvents[i].locEndDateTimeMs;
		myItem.galliumStopTime 		= getTimeFrames(galliumEvents[i].locEndDateTimeMs.split(' ')[1]);
		myItem.galliumType 			= galliumEvents[i].isLive ? event_type.live : galliumEvents[i].isProgram ? event_type.program : event_type.junction;
		myItem.galliumTitle 		= galliumEvents[i].title.trim();
		myItem.galliumProduction 	= galliumEvents[i].production;
		myItem.galliumTxEventId 	= galliumEvents[i].txEventId;
		myItem.galliumBlockId 		= galliumEvents[i].blockId;
		myItem.galliumDuration 		= galliumEvents[i].duration;
		myItem.galliumRouterSource 	= galliumEvents[i].routerSource !== undefined ? galliumEvents[i].routerSource : '';
		myItem.galliumGap 			= galliumEvents[i].gap;
		myItem.galliumStartMode 	= galliumEvents[i].startMode == 'Fixed' ? 'Fixed' : '';
	} else {
		myItem.galliumIdx 			= '';
		myItem.galliumStartDateTime = '';
		myItem.galliumStartTime 	= '';
		myItem.galliumStopDateTime 	= '';
		myItem.galliumStopTime 		= '';
		myItem.galliumType 			= '';
		myItem.galliumTitle 		= '';
		myItem.galliumProduction 	= '';
		myItem.galliumTxEventId 	= '';
		myItem.galliumBlockId 		= '';
		myItem.galliumDuration 		= '';
		myItem.galliumRouterSource 	= '';
		myItem.galliumGap 			= '';
		myItem.galliumStartMode 	= '';
	}
}

function copyWonParameters(myItem, woEvents, i) {
	if (woEvents !== undefined && i < woEvents.length) {
		myItem.wonIdx 				= i + 1;
		myItem.wonStartDateTime 	= woEvents[i].wonStartDateTime;
		myItem.wonStartTime 		= getTimeFrames(woEvents[i].wonStartDateTime.split(' ')[1]);
		myItem.wonStopDateTime 		= woEvents[i].wonStopDateTime;
		myItem.wonStopTime 			= getTimeFrames(woEvents[i].wonStopDateTime.split(' ')[1]);
		myItem.wonType 				= woEvents[i].type;
		myItem.wonTitle 			= woEvents[i].title.trim();
		myItem.wonProduction 		= woEvents[i].productionNumber;
		myItem.wonTxEventId 		= woEvents[i].txEventId;
		myItem.wonDuration 			= getTimeFrames(woEvents[i].wonDuration);
		myItem.wonGap 				= woEvents[i].gap;
	} else {
		myItem.wonIdx 				= '';
		myItem.wonStartDateTime 	= '';
		myItem.wonStartTime 		= '';
		myItem.wonStopDateTime 		= '';
		myItem.wonStopTime 			= '';
		myItem.wonType 				= '';
		myItem.wonTitle 			= '';
		myItem.wonProduction 		= '';
		myItem.wonTxEventId 		= '';
		myItem.wonDuration 			= '';
		myItem.wonGap 				= '';
	}
}

function getStartTimeOffset(startDateTime_1, startDateTime_2) {
	let returnOffset = ''; // Default return

	if (startDateTime_1 != '' && startDateTime_2 != '') {
		const moment_1 = moment(startDateTime_1, 'YYYY-MM-DD HH:mm:ss.SSS');
		const moment_2 = moment(startDateTime_2, 'YYYY-MM-DD HH:mm:ss.SSS');
		const offsetMs = moment_2.diff(moment_1);

		if (offsetMs == 0) {
			returnOffset = '';
		} else if (offsetMs > 0) {
			returnOffset = getTimeFrames(moment.utc(offsetMs).format('HH:mm:ss.SSS'));
		} else { // offsetMs < 0
			returnOffset = '-' + getTimeFrames(moment.utc(-offsetMs).format('HH:mm:ss.SSS'));
		}
	}

	return returnOffset;
}

function getDurationDiff(duration_1, duration_2) {
	let returnDiff = ''; // Default return

	if (duration_1 != '' && duration_2 != '') {
		const mySplit_1 = duration_1.split(':');
		const mySplit_2 = duration_2.split(':');

		const durationMs_1 = ((parseInt(mySplit_1[0]) * 60 + parseInt(mySplit_1[1])) * 60 + parseInt(mySplit_1[2])) * 1000 + parseInt(mySplit_1[3]) * 40;
		const durationMs_2 = ((parseInt(mySplit_2[0]) * 60 + parseInt(mySplit_2[1])) * 60 + parseInt(mySplit_2[2])) * 1000 + parseInt(mySplit_2[3]) * 40;
		const diffMs = durationMs_2 - durationMs_1;

		if (diffMs == 0) {
			returnDiff = '';
		} else if (diffMs > 0) {
			returnDiff = getTimeFrames(moment.utc(diffMs).format('HH:mm:ss.SSS'));
		} else {
			returnDiff = '-' + getTimeFrames(moment.utc(-diffMs).format('HH:mm:ss.SSS'));
		}
	}

	return returnDiff;
}

function getTimeFrames(durationMs) {
	return durationMs.substr(0, 8) + ':' + ('00' + parseInt(durationMs.split('.')[1]) / 40).slice(-2);
}

function createHtmlPage(masterEvents, channel, ipAddressGallium)
{	
	const header = 	'<!doctype html>' +
					'<html lang="en">' +
						'<head>' + 
							'<meta charset="utf-8">' +
							'<title>' + channel + ' pp-validate-playlist</title>' +
							'<meta name="description" content="pp-validate-playlist (' + channel + ')">' +
							'<meta name="author" content="pp-validate-playlist">' +
							'<meta http-equiv="refresh" content="60">' + // Refresh every minute 
							'<link rel="stylesheet" href="css/styles.css?v=1.0">' +
						'</head>' +
						'<body>' +
							'<h2>' + channel + ' (' + ipAddressGallium + '): WhatsOn vs - Gallium Playlist</h2>' +
							'<p>' + myLastRan + '</p>' +
							'<script src="js/scripts.js"></script>' +
							'<table id="tablify" class="tablify" border="1" cellspacing="1" cellpadding="3">';

	let colorGroup = 			'<colgroup>';
    for (const table of appInfo.table) {
		colorGroup +=				'<col span="1" style="background-color:' + table.backgroundColor + '">';
    }
	colorGroup += 			'</colgroup>';

	let tableHeader =			'<tr>';
    for (const table of appInfo.table) {
		tableHeader +=				'<th>' + table.header + '</th>';
	}
	tableHeader +=				'</tr>';

	let tableBody = '';
    for (const event of masterEvents) {
		const isLive     = (event.wonType & event_type.live)     || (event.galliumType & event_type.live)     ? true : false;
		const isJunction = (event.wonType & event_type.junction) || (event.galliumType & event_type.junction) ? true : false;

		tableBody += isJunction ? 	'<tr>' : isLive ? '<tr style="background-color:#efd8f6">' : '<tr style="background-color:#f2eada">';
        for (const table of appInfo.table) {
			let isBold   = (table.name == 'wonTitle' || table.name == 'galliumTitle') && !isJunction;
			let isPadded = (table.name == 'wonTitle' || table.name == 'galliumTitle') && isJunction
			let isLeft   = (table.name == 'wonTitle' || table.name == 'galliumTitle');
			let isRed = false;  // Default
			
			if (table.name == 'startTimeOffset' && event.startTimeOffset != '') {
				if (getMsFromHHMMSSFF(event.startTimeOffset) >= 60000) {
					isRed = true;  // Highlight start times offset by more than 1 minute
					isBold = true;
				}
			} else if (table.name == 'durationDiff' && event.durationDiff != '') {
				if (isJunction) {
					if (getMsFromHHMMSSFF(event.durationDiff) >= 10000) {
						isRed = true;  // Highlight junction durations which are different by more than 10 seconds
					}
				} else {
					isRed = true;  // Highlight program/live durations which are different
					isBold = true;
				}
			} else if (table.name == 'wonTitle' || table.name == 'galliumTitle') {
				if (event.wonTitle != event.galliumTitle) {
					isRed = true;  // Highlight titles which are different
				}
			} else if (table.name == 'wonDuration' || table.name == 'galliumDuration') {
				if (event.wonDuration != '' && event.galliumDuration != '' && 
				    event.wonDuration != event.galliumDuration) {
					if (isJunction) {
						if (getMsFromHHMMSSFF(event.durationDiff) >= 10000) {
							isRed = true;  // Highlight junction durations which are different by more than 10 seconds
						}
					} else {
						isRed = true;  // Highlight program/live durations which are different
						isBold = true;
					}
				}
			} else if (table.name == 'wonProduction' || table.name == 'galliumProduction') {
				if (event.wonProduction != '' && event.galliumProduction != '' && event.wonProduction != event.galliumProduction) {
					isRed = true;  // Highlight productions which are different
					isBold = true;
				}
			} else if (table.name == 'wonTxEventId' || table.name == 'galliumTxEventId') {
				if (event.wonTxEventId != '' && event.galliumTxEventId != '' && event.wonTxEventId != event.galliumTxEventId) {
					isRed = true;  // Highlight txEventIds which are different
					isBold = isJunction ? false : true;  // Not bold for junctions, because these are often different
				}
			} else if (table.name == 'galliumGap' && event.galliumGap != '') {
				isRed = true;  // Hightlight gaps in the Gallium playlist
				isBold = true;
			} else if (table.name == 'wonGap' && event.wonGap != '') {
				isRed = true;  // Hightlight gaps in the WhatsOn playlist
				isBold = true;
			}
			
			const myStyle = (isRed ? 'color:red;' : '') + (isLeft ? 'text-align:left;' : 'text-align:center;');

			tableBody += 		'<td style="' + myStyle + '">' + (isBold ? '<b>' : '') +  (isPadded ? '&nbsp;&nbsp;' : '' ) + 
										event[table.name] + (isBold ? '</b>' : '') + '</td>';
		}
		tableBody +=			'</tr>';
	}		

	const footer =			'</table>' +
						'</body>' +
					'</html>';

	return (header + colorGroup + tableHeader + tableBody + footer);	
}

function getMsFromHHMMSSFF(myTime) {
	const mySplit = myTime.split(':');
	const hours = parseInt(mySplit[0]);
	const minutes = parseInt(mySplit[1]);
	const seconds = parseInt(mySplit[2]);
	const millisec = parseInt(mySplit[3]) * 40;

	return ((hours * 60 + minutes) * 60 + seconds) * 1000 + millisec;
}

function tsConsoleLog(string) {
	let timestamp = moment().format('YYYY-MM-DD HH:mm:ss.SSS');
	console.log(timestamp + ': ' + string);
}

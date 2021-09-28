// --------------------------------------------------------------
// Requirements
// --------------------------------------------------------------
const wait = require('wait.for');
const moment = require("moment");
const setTitle = require('node-bash-title');
const fs = require('fs');
const util = require('util');

setTitle('ValidatePlaylist');

// http.js
var getWhatsOnEventsForChannel = require('./http.js').getWhatsOnEventsForChannel;
var getHttpCommand = require('./http.js').getHttpCommand;

// data.js
var event_type = require('./data.js').event_type;

const wonBackgroundColor     = "#e6ffe6";
const galliumBackgroundColor = "#e6e6ff";

const app_info =
{
	loggingPath:    '\\\\pp01\\system$\\Logs\\ValidatePlaylist\\',
	monitoringPath: '\\\\pp01\\system$\\Monitoring\\ValidatePlaylist\\',
	liveEpgApiIpAddress:
	[
		"10.117.120.254",  // SK1 - main
		"10.117.120.201"   // SK2 - backup
	],
	channelInfo: 
	[
		{
			channel: "DR1",
			woChannel: "DR1"
		},
		{
			channel: "DR2",
			woChannel: "DR2"
		},
		{
			channel: "DRR",
			woChannel: "TVR"
		},
		{
			channel: "TEGN",
			woChannel: "TSK"
		},
		{
			channel: "EVA",
			woChannel: "EVA"
		},
		{
			channel: "EVB",
			woChannel: "EVB"
		},
		{
			channel: "EVC",
			woChannel: "EVC"
		}
	],
	tableHeader:  // Enable parameters to see in the table
	[
		{name: "startTimeOffset",      header: "Start Offset",    backgroundColor: "#ffffff"},
		{name: "durationDiff",         header: "Duration Offset", backgroundColor: "#ffffff"},
		{name: "wonIdx",               header: "#",               backgroundColor: wonBackgroundColor},
//		{name: "wonStartDateTime",     header: "Start DateTime",  backgroundColor: wonBackgroundColor},
		{name: "wonStartTime",         header: "Start Time",      backgroundColor: wonBackgroundColor},
//		{name: "wonStopDateTime",      header: "Stop DateTime",   backgroundColor: wonBackgroundColor},
//		{name: "wonStopTime",          header: "Stop Time",       backgroundColor: wonBackgroundColor},
//		{name: "wonType",              header: "Type",            backgroundColor: wonBackgroundColor},
		{name: "wonTitle",             header: "WHATSON",         backgroundColor: wonBackgroundColor},
		{name: "wonDuration",          header: "Duration",        backgroundColor: wonBackgroundColor},
		{name: "wonProduction",        header: "Production",      backgroundColor: wonBackgroundColor},
		{name: "wonTxEventId",         header: "TxEventId",       backgroundColor: wonBackgroundColor},
		{name: "wonGap",               header: "Gap",       	  backgroundColor: wonBackgroundColor},
		{name: "galliumIdx",           header: "#",               backgroundColor: galliumBackgroundColor},
//		{name: "galliumStartDateTime", header: "Start DateTime",  backgroundColor: galliumBackgroundColor},
		{name: "galliumStartTime",     header: "Start Time",      backgroundColor: galliumBackgroundColor},
//		{name: "galliumStopDateTime",  header: "Stop DateTime",   backgroundColor: galliumBackgroundColor},
//		{name: "galliumStopTime",      header: "Stop Time",       backgroundColor: galliumBackgroundColor},
//		{name: "galliumType",          header: "Type",            backgroundColor: galliumBackgroundColor},
		{name: "galliumTitle",         header: "GALLIUM",         backgroundColor: galliumBackgroundColor},
		{name: "galliumDuration",      header: "Duration",        backgroundColor: galliumBackgroundColor},
		{name: "galliumProduction",    header: "Production",      backgroundColor: galliumBackgroundColor},
		{name: "galliumTxEventId",     header: "TxEventId",       backgroundColor: galliumBackgroundColor},
//		{name: "galliumBlockId",       header: "BlockId",         backgroundColor: galliumBackgroundColor},
		{name: "galliumGap",           header: "Gap",       	  backgroundColor: galliumBackgroundColor},
		{name: "galliumStartMode",     header: "Start Mode",  	  backgroundColor: galliumBackgroundColor},
		{name: "galliumRouterSource",  header: "Source",		  backgroundColor: galliumBackgroundColor},
	]
};

const myLastRan = moment().format("[ValidatePlaylist last ran at ]HH:mm:ss[ on ]YYYY-MM-DD");
const myLogFilenameBase = app_info.loggingPath + moment().format("YYYY-MM-DD");	

var log_file = fs.openSync(myLogFilenameBase + '_console.log', 'a');  // Append daily log file
var log_stdout = process.stdout;

console.log = function(d) { //
	fs.writeSync(log_file, util.format(d) + '\n');
	log_stdout.write(util.format(d) + '\n');
};

console.log("\n==================================================================");	                
tsConsoleLog('Starting application...');
console.log(JSON.stringify(app_info, null, 2));

wait.launchFiber(runMainFiber);
// Main program ends


function runMainFiber()
{
	for (var chIdx = 0; chIdx < app_info.channelInfo.length; chIdx++)
	{
		var myChannel = app_info.channelInfo[chIdx].woChannel;

		// ----------------------------------------------------------------------------------------------------
		// Get Gallium events from the liveEpgAPI REST API 
		// ----------------------------------------------------------------------------------------------------
		var galliumEvents = [];
		var ipAddressGallium = "";
		var currentBroadcastDay = moment().format("YYYY-MM-DD");  // Default
		
		for (var i = 0; i < app_info.liveEpgApiIpAddress.length && galliumEvents.length == 0; i++)
		{
			const cmdLiveEpgApiBase = "http://" + app_info.liveEpgApiIpAddress[i] + ":8000/api/";
			
			const cmdIpAddressGallium = cmdLiveEpgApiBase + "masterIpAddress/" + myChannel;
			ipAddressGallium = wait.for(getHttpCommand, cmdIpAddressGallium);

			const cmdBroadcastDay = cmdLiveEpgApiBase + "currentBroadcastDay/" + myChannel;
			currentBroadcastDay = wait.for(getHttpCommand, cmdBroadcastDay);
			
			const commandEpgFull = cmdLiveEpgApiBase + "epgFull/" + myChannel;
			galliumEvents = JSON.parse(wait.for(getHttpCommand, commandEpgFull), 'utf-8');

			if (Array.isArray(galliumEvents) === false)
			{
				tsConsoleLog(commandEpgFull + " - " + galliumEvents);
				galliumEvents = [];
			}	
		}

		// currentBroadcastDay will be invalid if the length of galliumEvents is zero, or no events include the custom parameter
		if (galliumEvents.length == 0 || moment(currentBroadcastDay, "YYYY-MM-DD", true).isValid() === false)
		{
			const currentDay  = moment().format("YYYY-MM-DD");
			const currentHour = parseInt(moment().format("HH"));
			const bDayOffset = (currentHour < 5) ? 1 : 0;  // Assume broadcast day rolls-over at 05:00
			currentBroadcastDay = moment(currentDay, "YYYY-MM-DD").subtract(bDayOffset, 'day').format("YYYY-MM-DD");
		}
		
		const nextBroadcastDay = moment(currentBroadcastDay, "YYYY-MM-DD").add(1, 'day').format("YYYY-MM-DD");

		console.log("==================================================================");	                
		tsConsoleLog(myChannel + ": Broadcast days: " + currentBroadcastDay + ", " + nextBroadcastDay);
		tsConsoleLog("- " + galliumEvents.length + " Gallium events" + (galliumEvents.length > 0 ? ", starting with " + galliumEvents[0].startDate + " " + galliumEvents[0].startTime + " " + galliumEvents[0].title : ""));
		
		// Determine if there are any gaps in the Gallium playlist
		for (var i = 0; i < galliumEvents.length; i++)
		{
			galliumEvents[i].gap = (i < galliumEvents.length - 1) ? getStartTimeOffset(galliumEvents[i].locEndDateTimeMs, galliumEvents[i + 1].locStartDateTimeMs) : "";
		}

		// ----------------------------------------------------------------------------------------------------
		// Get WhatsOn events for current and next broadcast day
		// ----------------------------------------------------------------------------------------------------
		var woEvents_1 = wait.for(getWhatsOnEventsForChannel, myChannel, currentBroadcastDay);
		var woEvents_2 = wait.for(getWhatsOnEventsForChannel, myChannel, nextBroadcastDay);
		var woEvents = [...woEvents_1, ...woEvents_2];

		console.log(JSON.stringify(woEvents, null, 2));
		
		tsConsoleLog("- " + woEvents.length + " WhatsOn events" + (woEvents.length > 0 ? ", starting with " + woEvents[0].wonStartDateTime + " " + woEvents[0].title : ""));
		
		// Determine if there are any gaps in the WhatsOn playlist
		for (var i = 0; i < woEvents.length; i++)
		{
			woEvents[i].gap = (i < woEvents.length - 1) ? 
							  getStartTimeOffset(woEvents[i].wonStopDateTime, woEvents[i + 1].wonStartDateTime) : "";
		}

		// Compare the lists and look for discontinuities
		var masterEvents = [];
		var gIdx_next = 0;

		for (var i = 0; i < woEvents.length; i++)
		{
			// First check if the woEvent exists in galliumEvents, checking txEventId and starting from gIdx_next
			var gIdx = undefined;
			for (var j = gIdx_next; j < galliumEvents.length; j++)
			{
				if (woEvents[i].txEventId == galliumEvents[j].txEventId)
				{
					gIdx = j;
					break;  // EXIT the j loop
				}
			}

			// NOTE: ValidateAsRun requires extra checks here for matching production

			if (gIdx === undefined)
			{
				// woEvents[i] was not found in galliumEvents[]
				myItem = {};
				copyWonParameters(myItem, woEvents, i);
				copyGalliumParameters(myItem, undefined, undefined);
				masterEvents.push(myItem);
				// Do not increment gIdx_next
			}
			else if (gIdx == gIdx_next)
			{
				// woEvents and galliumEvents have incremented together
				myItem = {};
				copyWonParameters(myItem, woEvents, i);
				copyGalliumParameters(myItem, galliumEvents, gIdx);
				masterEvents.push(myItem);
				gIdx_next++;
			}
			else if (gIdx > gIdx_next)
			{
				// One or more galliumEvents are out of order before woEvents[i]
				for (var j = gIdx_next; j < gIdx; j++)
				{
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
		for (var j = gIdx_next; j < galliumEvents.length; j++)
		{
			myItem = {};
			copyWonParameters(myItem, undefined, undefined);
			copyGalliumParameters(myItem, galliumEvents, j);
			masterEvents.push(myItem);
			gIdx_next++;
		}
		
		// ----------------------------------------------------------------------------------------------------
		// Calculate the startTimeOffset and durationDiff for each object in masterEvents
		// ----------------------------------------------------------------------------------------------------
		for (var i = 0; i < masterEvents.length; i++)
		{
			masterEvents[i].startTimeOffset = getStartTimeOffset(masterEvents[i].wonStartDateTime, masterEvents[i].galliumStartDateTime);
			masterEvents[i].durationDiff = getDurationDiff(masterEvents[i].wonDuration, masterEvents[i].galliumDuration);
		}
		
		// console.log(JSON.stringify(masterEvents, null, 2));

		// ----------------------------------------------------------------------------------------------------
		// Write the array into a json file
		// ----------------------------------------------------------------------------------------------------
		var myFilenameJson = app_info.monitoringPath + myChannel + '_ValidatePlaylist.json';
		fs.writeFileSync(myFilenameJson, JSON.stringify(masterEvents, null, 2), 'utf-8');
		tsConsoleLog("JSON information saved to " + myFilenameJson);

		// ----------------------------------------------------------------------------------------------------
		// Create a web page
		// ----------------------------------------------------------------------------------------------------
		var myFilenameHtml = app_info.monitoringPath + myChannel + '_ValidatePlaylist.html';
		var htmlData = createHtmlPage(masterEvents, myChannel, ipAddressGallium);
		fs.writeFileSync(myFilenameHtml, htmlData, 'utf-8');
		tsConsoleLog("HTML table saved to " + myFilenameHtml);
	}
	
	console.log("==================================================================");	                
	tsConsoleLog("Console saved to " + myLogFilenameBase + "_console.log");
	console.log("==================================================================");	                
	tsConsoleLog("Application completed successfully");
}


function copyGalliumParameters(myItem, galliumEvents, i)
{
	if (galliumEvents !== undefined && i < galliumEvents.length)
	{
		myItem.galliumIdx           = i + 1;
		myItem.galliumStartDateTime = galliumEvents[i].locStartDateTimeMs;
		myItem.galliumStartTime 	= getTimeFrames(galliumEvents[i].locStartDateTimeMs.split(" ")[1]);
		myItem.galliumStopDateTime  = galliumEvents[i].locEndDateTimeMs;
		myItem.galliumStopTime   	= getTimeFrames(galliumEvents[i].locEndDateTimeMs.split(" ")[1]);
		myItem.galliumType			= galliumEvents[i].isLive ? event_type.live : (galliumEvents[i].isProgram ? event_type.program : event_type.junction);
		myItem.galliumTitle         = galliumEvents[i].title.trim();
		myItem.galliumProduction    = galliumEvents[i].production;
		myItem.galliumTxEventId		= galliumEvents[i].txEventId;
		myItem.galliumBlockId       = galliumEvents[i].blockId;
		myItem.galliumDuration      = galliumEvents[i].duration;
		myItem.galliumRouterSource  = galliumEvents[i].routerSource !== undefined ? galliumEvents[i].routerSource : "";
		myItem.galliumGap           = galliumEvents[i].gap;
		myItem.galliumStartMode		= galliumEvents[i].startMode == "Fixed" ? "Fixed" : "";
	}
	else
	{
		myItem.galliumIdx           = "";
		myItem.galliumStartDateTime = "";
		myItem.galliumStartTime 	= "";
		myItem.galliumStopDateTime  = "";
		myItem.galliumStopTime   	= "";
		myItem.galliumType			= "";
		myItem.galliumTitle         = "";
		myItem.galliumProduction    = "";
		myItem.galliumTxEventId		= "";
		myItem.galliumBlockId       = "";
		myItem.galliumDuration      = "";
		myItem.galliumRouterSource  = "";
		myItem.galliumGap           = "";
		myItem.galliumStartMode		= "";
	}
}


function copyWonParameters(myItem, woEvents, i)
{
	if (woEvents !== undefined && i < woEvents.length)
	{
		myItem.wonIdx				= i + 1;
		myItem.wonStartDateTime     = woEvents[i].wonStartDateTime;
		myItem.wonStartTime         = getTimeFrames(woEvents[i].wonStartDateTime.split(" ")[1]);
		myItem.wonStopDateTime      = woEvents[i].wonStopDateTime;
		myItem.wonStopTime          = getTimeFrames(woEvents[i].wonStopDateTime.split(" ")[1]);
		myItem.wonType				= woEvents[i].type;
		myItem.wonTitle             = woEvents[i].title.trim();
		myItem.wonProduction        = woEvents[i].productionNumber;
		myItem.wonTxEventId			= woEvents[i].txEventId;
		myItem.wonDuration          = getTimeFrames(woEvents[i].wonDuration);
		myItem.wonGap               = woEvents[i].gap;
	}
	else
	{
		myItem.wonIdx				= "";
		myItem.wonStartDateTime     = "";
		myItem.wonStartTime         = "";
		myItem.wonStopDateTime      = "";
		myItem.wonStopTime          = "";
		myItem.wonType				= "";
		myItem.wonTitle             = "";
		myItem.wonProduction        = "";
		myItem.wonTxEventId			= "";
		myItem.wonDuration          = "";
		myItem.wonGap               = "";
	}		
}


function getStartTimeOffset(startDateTime_1, startDateTime_2)
{
	var returnOffset= "";  // Default return
	
	if (startDateTime_1 != "" && startDateTime_2 != "")
	{
		var moment_1 = moment(startDateTime_1, "YYYY-MM-DD HH:mm:ss.SSS");
		var moment_2 = moment(startDateTime_2, "YYYY-MM-DD HH:mm:ss.SSS");
		var offsetMs = moment_2.diff(moment_1);
				
		if (offsetMs == 0)
		{
			returnOffset = "";
		}
		else if (offsetMs > 0)
		{
			returnOffset = getTimeFrames(moment.utc(offsetMs).format("HH:mm:ss.SSS"));
		}
		else  // offsetMs < 0
		{
			returnOffset = "-" + getTimeFrames(moment.utc(-offsetMs).format("HH:mm:ss.SSS"));
		}
	}

	return returnOffset;
}


function getDurationDiff(duration_1, duration_2)
{
	var returnDiff = "";  // Default return
	
	if (duration_1 != "" && duration_2 != "")
	{
		const mySplit_1 = duration_1.split(":");
		const mySplit_2 = duration_2.split(":");
		
		const durationMs_1 = ( ( parseInt(mySplit_1[0]) * 60 + parseInt(mySplit_1[1]) ) * 60 + parseInt(mySplit_1[2]) ) * 1000 + (parseInt(mySplit_1[3]) * 40);
		const durationMs_2 = ( ( parseInt(mySplit_2[0]) * 60 + parseInt(mySplit_2[1]) ) * 60 + parseInt(mySplit_2[2]) ) * 1000 + (parseInt(mySplit_2[3]) * 40);
		const diffMs = durationMs_2 - durationMs_1;
		
		if (diffMs == 0)
		{
			returnDiff = "";
		}
		else if (diffMs > 0)
		{
			returnDiff = getTimeFrames(moment.utc(diffMs).format("HH:mm:ss.SSS"));
		}
		else
		{
			returnDiff = "-" + getTimeFrames(moment.utc(-diffMs).format("HH:mm:ss.SSS"));
		}
	}

	return returnDiff;
}


function getTimeFrames(durationMs)
{
	return durationMs.substr(0, 8) + ":" + ("00" + parseInt(durationMs.split(".")[1]) / 40).slice(-2);
}

function createHtmlPage(masterEvents, myChannel, ipAddressGallium)
{	
	const header = 	'<!doctype html>' +
					'<html lang="en">' +
						'<head>' + 
							'<meta charset="utf-8">' +
							'<title>' + myChannel + ' ValidatePlaylist</title>' +
							'<meta name="description" content="ValidatePlaylist (' + myChannel + ')">' +
							'<meta name="author" content="ValidatePlaylist">' +
							'<meta http-equiv="refresh" content="60">' + // Refresh every minute 
							'<link rel="stylesheet" href="css/styles.css?v=1.0">' +
						'</head>' +
						'<body>' +
							'<h2>' + myChannel + ' (' + ipAddressGallium + '): WhatsOn vs - Gallium Playlist</h2>' +
							'<p>' + myLastRan + '</p>' +
							'<script src="js/scripts.js"></script>' +
							'<table id="tablify" class="tablify" border="1" cellspacing="1" cellpadding="3">';

	var colorGroup = 			'<colgroup>';
	for (var i = 0; i < app_info.tableHeader.length; i++)
	{
		colorGroup +=				'<col span="1" style="background-color:' + app_info.tableHeader[i].backgroundColor + '">';
	}
	colorGroup += 			'</colgroup>';

	var tableHeader =			'<tr>';
	for (var i = 0; i < app_info.tableHeader.length; i++)
	{
		tableHeader +=				'<th>' + app_info.tableHeader[i].header + '</th>';
	}
	tableHeader +=				'</tr>';

	var table = "";
	for (var j = 0; j < masterEvents.length; j++)
	{
		const isLive     = (masterEvents[j].wonType & event_type.live)     || (masterEvents[j].galliumType & event_type.live)     ? true : false;
		const isJunction = (masterEvents[j].wonType & event_type.junction) || (masterEvents[j].galliumType & event_type.junction) ? true : false;

		table += isJunction ? 	'<tr>' : isLive ? '<tr style="background-color:#efd8f6">' : '<tr style="background-color:#f2eada">';
		for (var i = 0; i < app_info.tableHeader.length; i++)
		{
			var isBold   = (app_info.tableHeader[i].name == "wonTitle" || app_info.tableHeader[i].name == "galliumTitle") && !isJunction;
			var isPadded = (app_info.tableHeader[i].name == "wonTitle" || app_info.tableHeader[i].name == "galliumTitle") && isJunction
			var isLeft   = (app_info.tableHeader[i].name == "wonTitle" || app_info.tableHeader[i].name == "galliumTitle");
			var isRed = false;  // Default
			
			if (app_info.tableHeader[i].name == "startTimeOffset" && masterEvents[j].startTimeOffset != "")
			{
				if (getMsFromHHMMSSFF(masterEvents[j].startTimeOffset) >= 60000)
				{
					isRed = true;  // Highlight start times offset by more than 1 minute
					isBold = true;
				}
			}
			else if (app_info.tableHeader[i].name == "durationDiff" && masterEvents[j].durationDiff != "")
			{
				if (isJunction)
				{
					if (getMsFromHHMMSSFF(masterEvents[j].durationDiff) >= 10000)
					{
						isRed = true;  // Highlight junction durations which are different by more than 10 seconds
					}
				}
				else
				{
					isRed = true;  // Highlight program/live durations which are different
					isBold = true;
				}
			}
			else if (app_info.tableHeader[i].name == "wonTitle" || app_info.tableHeader[i].name == "galliumTitle")
			{
				if (masterEvents[j].wonTitle != masterEvents[j].galliumTitle)
				{
					isRed = true;  // Highlight titles which are different
				}
			}
			else if (app_info.tableHeader[i].name == "wonDuration" || app_info.tableHeader[i].name == "galliumDuration")
			{
				if (masterEvents[j].wonDuration != "" && masterEvents[j].galliumDuration != "" && 
				    masterEvents[j].wonDuration != masterEvents[j].galliumDuration)
				{
					if (isJunction)
					{
						if (getMsFromHHMMSSFF(masterEvents[j].durationDiff) >= 10000)
						{
							isRed = true;  // Highlight junction durations which are different by more than 10 seconds
						}
					}
					else
					{
						isRed = true;  // Highlight program/live durations which are different
						isBold = true;
					}
				}
			}
			else if (app_info.tableHeader[i].name == "wonProduction" || app_info.tableHeader[i].name == "galliumProduction")
			{
				if (masterEvents[j].wonProduction != "" && masterEvents[j].galliumProduction != "" && masterEvents[j].wonProduction != masterEvents[j].galliumProduction)
				{
					isRed = true;  // Highlight productions which are different
					isBold = true;
				}
			}
			else if (app_info.tableHeader[i].name == "wonTxEventId" || app_info.tableHeader[i].name == "galliumTxEventId")
			{
				if (masterEvents[j].wonTxEventId != "" && masterEvents[j].galliumTxEventId != "" && masterEvents[j].wonTxEventId != masterEvents[j].galliumTxEventId)
				{
					isRed = true;  // Highlight txEventIds which are different
					isBold = isJunction ? false : true;  // Not bold for junctions, because these are often different
				}
			}
			else if (app_info.tableHeader[i].name == "galliumGap" && masterEvents[j].galliumGap != "")
			{
				isRed = true;  // Hightlight gaps in the Gallium playlist
				isBold = true;
			}
			else if (app_info.tableHeader[i].name == "wonGap" && masterEvents[j].wonGap != "")
			{
				isRed = true;  // Hightlight gaps in the WhatsOn playlist
				isBold = true;
			}
			
			const myStyle = (isRed ? "color:red;" : "") + (isLeft ? "text-align:left;" : "text-align:center;");

			table += 				'<td style="' + myStyle + '">' + (isBold ? '<b>' : '') +  (isPadded ? '&nbsp;&nbsp;' : '' ) + 
										masterEvents[j][app_info.tableHeader[i].name] + (isBold ? '</b>' : '') + '</td>';
		}
		table +=				'</tr>';
	}		

	const footer =			'</table>' +
						'</body>' +
					'</html>';

	return (header + colorGroup + tableHeader + table + footer);	
}

function getMsFromHHMMSSFF(myTime)
{
	const mySplit  = myTime.split(":");
	const hours    = parseInt(mySplit[0]);
	const minutes  = parseInt(mySplit[1]);
	const seconds  = parseInt(mySplit[2]);
	const millisec = parseInt(mySplit[3]) * 40;
	
	return ((hours * 60 + minutes) * 60 + seconds) * 1000 + millisec;
}


function tsConsoleLog(string)
{
	let timestamp = moment().format("YYYY-MM-DD HH:mm:ss.SSS");
	console.log(timestamp + ": " + string);	
}


import moment from 'moment';
import * as fs from 'fs';
import { format } from 'util';

import { httpGetWithTimeout } from './http.js';
import { appInfo, event_type, Item } from './data.js';

const lastRan = moment().format('[pp-validate-playlist last ran at ]HH:mm:ss[ on ]YYYY-MM-DD');
const logFilename = `${appInfo.loggingPath}${moment().format('YYYY-MM-DD')}_console.log`;
const log_file = fs.openSync(logFilename, 'a'); // Append daily log file
const log_stdout = process.stdout;

console.log = (d) => {
    fs.writeSync(log_file, format(d) + '\n');
    log_stdout.write(format(d) + '\n');
};

console.log('==================================================================');
tsConsoleLog('Starting application...');
// console.log(JSON.stringify(appInfo, null, 2));

validatePlaylists();
// Main program ends

async function validatePlaylists(): Promise<void> {
    for (const channel of appInfo.channel) {
        console.log('==================================================================');

        // ----------------------------------------------------------------------------------------------------
        // Get Gallium events from the liveEpgAPI REST API
        // ----------------------------------------------------------------------------------------------------
        let galliumEvents = [];
        let ipAddressGallium = '';
        let currentBroadcastDay = moment().format('YYYY-MM-DD'); // Default

        for (let i = 0; i < appInfo.liveEpgApiIpAddress.length && galliumEvents.length == 0; i++) {
            const cmdIpAddressGallium = `http://${appInfo.liveEpgApiIpAddress[i]}:8000/api/masterIpAddress/${channel.name}`;
            const cmdBroadcastDay     = `http://${appInfo.liveEpgApiIpAddress[i]}:8000/api/currentBroadcastDay/${channel.name}`;
            const commandEpgFull      = `http://${appInfo.liveEpgApiIpAddress[i]}:8000/api/epgFull/${channel.name}`;

            try {
                ipAddressGallium    = await httpGetWithTimeout(cmdIpAddressGallium, { timeout: 10000, type: 'text' });
                currentBroadcastDay = await httpGetWithTimeout(cmdBroadcastDay, { timeout: 10000, type: 'text' });
                galliumEvents       = await httpGetWithTimeout(commandEpgFull, { timeout: 10000, type: 'json' });
            } catch (err) {
                tsConsoleLog(`WARNING: Failed to get LiveEPG information for ${channel.name} from ${appInfo.liveEpgApiIpAddress[i]}`);
                // console.log(err);
            }

            if (Array.isArray(galliumEvents) === false) {
                tsConsoleLog(commandEpgFull + ' - ' + galliumEvents);
                galliumEvents = [];
            }
        }

        // ----------------------------------------------------------------------------------------------------
        // currentBroadcastDay will be invalid if the length of galliumEvents is zero, or no events include the custom parameter
        // ----------------------------------------------------------------------------------------------------
        if (galliumEvents.length == 0 || moment(currentBroadcastDay, 'YYYY-MM-DD', true).isValid() === false) {
            const currentDay = moment().format('YYYY-MM-DD');
            const currentHour = parseInt(moment().format('HH'));
            const bDayOffset = currentHour < 5 ? 1 : 0; // Assume broadcast day rolls-over at 05:00
            currentBroadcastDay = moment(currentDay, 'YYYY-MM-DD').subtract(bDayOffset, 'day').format('YYYY-MM-DD');
        }

        const nextBroadcastDay = moment(currentBroadcastDay, 'YYYY-MM-DD').add(1, 'day').format('YYYY-MM-DD');

        tsConsoleLog(channel.name + ': Broadcast days: ' + currentBroadcastDay + ', ' + nextBroadcastDay);
        tsConsoleLog('- ' + galliumEvents.length + ' Gallium events' + (galliumEvents.length > 0 ? ', starting with ' + galliumEvents[0].startDate + ' ' + galliumEvents[0].startTime + ' ' + galliumEvents[0].title : ''));

        // ----------------------------------------------------------------------------------------------------
        // Determine if there are any gaps in the Gallium playlist
        // ----------------------------------------------------------------------------------------------------
        for (let i = 0; i < galliumEvents.length; i++) {
            galliumEvents[i].gap = i < galliumEvents.length - 1 ? getStartTimeOffset(galliumEvents[i].locEndDateTimeMs, galliumEvents[i + 1].locStartDateTimeMs) : '';
        }

        // ----------------------------------------------------------------------------------------------------
        // Get WhatsOn events for current and next broadcast day
        // ----------------------------------------------------------------------------------------------------
        const url_1 = `http://localhost:8001/api/schedules/${channel.name}/${currentBroadcastDay}?events=0x7&time=now&caller=pp-validate-playlist`;
        const url_2 = `http://localhost:8001/api/schedules/${channel.name}/${nextBroadcastDay}?events=0x7&time=now&caller=pp-validate-playlist`;
        let wonEvents_1 = [];
        let wonEvents_2 = [];

        try {
            wonEvents_1 = await httpGetWithTimeout(url_1, { timeout: 10000, type: 'json' });
            wonEvents_2 = await httpGetWithTimeout(url_2, { timeout: 10000, type: 'json' });
        } catch (err) {
            tsConsoleLog(`ERROR: Failed to get day schedule for ${channel.name}`);
            console.log(err);
        }

        let wonEvents = [...wonEvents_1, ...wonEvents_2];

        // console.log(JSON.stringify(wonEvents, null, 2));

        tsConsoleLog('- ' + wonEvents.length + ' WhatsOn events' + (wonEvents.length > 0 ? ', starting with ' + wonEvents[0].wonStartDateTime + ' ' + wonEvents[0].title : ''));

        // ----------------------------------------------------------------------------------------------------
        // Determine if there are any gaps in the WhatsOn playlist
        // ----------------------------------------------------------------------------------------------------
        for (let i = 0; i < wonEvents.length; i++) {
            wonEvents[i].gap = i < wonEvents.length - 1
                             ? getStartTimeOffset(wonEvents[i].wonStopDateTime, wonEvents[i + 1].wonStartDateTime)
                             : '';
        }

        // ----------------------------------------------------------------------------------------------------
        // Compare the lists and look for discontinuities
        // ----------------------------------------------------------------------------------------------------
        const masterEvents = calculateMasterEvents(wonEvents, galliumEvents);

        // ----------------------------------------------------------------------------------------------------
        // Write the array into a json file
        // ----------------------------------------------------------------------------------------------------
        const filenameJson = `${appInfo.monitoringPath}${channel.name}.json`;
        fs.writeFileSync(filenameJson, JSON.stringify(masterEvents, null, 2), 'utf-8');
        tsConsoleLog(`JSON information saved to ${filenameJson}`);

        // ----------------------------------------------------------------------------------------------------
        // Create a web page
        // ----------------------------------------------------------------------------------------------------
        const filenameHtml = `${appInfo.monitoringPath}${channel.name}.html`;
        const htmlData = createHtmlPage(masterEvents, channel.name, ipAddressGallium);
        fs.writeFileSync(filenameHtml, htmlData, 'utf-8');
        tsConsoleLog(`HTML table saved to ${filenameHtml}`);
    }

    console.log('==================================================================');
    tsConsoleLog(`Console saved to ${logFilename}`);
    console.log('==================================================================');
    tsConsoleLog('Application completed successfully');
}

function calculateMasterEvents(wonEvents: any[], galliumEvents: any[]): Item[] {
    let masterEvents: Item[] = [];
    let gIdx_next = 0;

    for (let i = 0; i < wonEvents.length; i++) {
        // First check if the wonEvents[] event exists in galliumEvents, checking txEventId and starting from gIdx_next
        let gIdx = undefined;
        for (let j = gIdx_next; j < galliumEvents.length; j++) {
            if (wonEvents[i].txEventId === galliumEvents[j].txEventId) {
                gIdx = j;
                break; // EXIT the j loop on a match
            }
        }

        // NOTE: pp-validate-asrun requires extra checks here for matching production

        if (gIdx === undefined) {
            // wonEvents[i] match was not found in galliumEvents[]
            let item: Item = {};
            mergeWonParameters(item, wonEvents, i);
            mergeGalliumParameters(item, undefined, 0);
            masterEvents.push(item);
            // Do not increment gIdx_next
        } else if (gIdx === gIdx_next) {
            // wonEvents and galliumEvents have incremented together
            let item: Item = {};
            mergeWonParameters(item, wonEvents, i);
            mergeGalliumParameters(item, galliumEvents, gIdx);
            masterEvents.push(item);
            gIdx_next++;
        } else if (gIdx > gIdx_next) {
            // One or more galliumEvents are out of order before wonEvents[i]
            for (let j = gIdx_next; j < gIdx; j++) {
                let item: Item = {};
                mergeWonParameters(item, undefined, 0);
                mergeGalliumParameters(item, galliumEvents, j);
                masterEvents.push(item);
                gIdx_next++;
            }

            // Now add the galliumEvents match with wonEvents[i]
            let item: Item = {};
            mergeWonParameters(item, wonEvents, i);
            mergeGalliumParameters(item, galliumEvents, gIdx);
            masterEvents.push(item);
            gIdx_next = gIdx + 1;
        }
    }

    // We have finished looping through WhatsOn events, but there might be some Gallium events left
    for (let j = gIdx_next; j < galliumEvents.length; j++) {
        let item: Item = {};
        mergeWonParameters(item, undefined, 0);
        mergeGalliumParameters(item, galliumEvents, j);
        masterEvents.push(item);
        gIdx_next++;
    }

    // ----------------------------------------------------------------------------------------------------
    // Calculate the startTimeOffset and durationDiff for each object in masterEvents
    // ----------------------------------------------------------------------------------------------------
    for (const item of masterEvents) {
        item.startTimeOffset = getStartTimeOffset(item.wonStartDateTime ?? '', item.galliumStartDateTime ?? '');
        item.durationDiff = getDurationDiff(item.wonDuration ?? '', item.galliumDuration ?? '');
    }

    return masterEvents;
}

function mergeGalliumParameters(item: Item, galliumEvents: any[] | undefined, i: number): void {
    if (galliumEvents !== undefined && i < galliumEvents.length) {
        item.galliumIdx           = i + 1;
        item.galliumStartDateTime = galliumEvents[i].locStartDateTimeMs;
        item.galliumStartTime     = getTimeFrames(galliumEvents[i].locStartDateTimeMs.split(' ')[1]);
        item.galliumStopDateTime  = galliumEvents[i].locStopDateTimeMs;
        item.galliumStopTime      = getTimeFrames(galliumEvents[i].locStopDateTimeMs.split(' ')[1]);
        item.galliumType          = galliumEvents[i].isLive ? event_type.live : (galliumEvents[i].isProgram ? event_type.program : event_type.junction);
        item.galliumTitle         = galliumEvents[i].title.trim();
        item.galliumProduction    = galliumEvents[i].production;
        item.galliumTxEventId     = galliumEvents[i].txEventId;
        item.galliumBlockId       = galliumEvents[i].blockId;
        item.galliumDuration      = galliumEvents[i].duration;
        item.galliumRouterSource  = galliumEvents[i].routerSource !== undefined ? galliumEvents[i].routerSource : '';
        item.galliumGap           = galliumEvents[i].gap;
        // item.splitCount           = galliumEvents[i].splitCount > 0 ? galliumEvents[i].splitCount : '';
        // item.galliumIpAddress     = galliumEvents[i].ipAddress;
        // item.galliumHostname      = galliumEvents[i].hostname;
        item.galliumStartMode     = galliumEvents[i].startMode === 'Fixed' ? 'Fixed' : '';
    } else {
        item.galliumIdx           = '';
        item.galliumStartDateTime = '';
        item.galliumStartTime     = '';
        item.galliumStopDateTime  = '';
        item.galliumStopTime      = '';
        item.galliumType          = event_type.unknown;
        item.galliumTitle         = '';
        item.galliumProduction    = '';
        item.galliumTxEventId     = '';
        item.galliumBlockId       = '';
        item.galliumDuration      = '';
        item.galliumRouterSource  = '';
        item.galliumGap           = '';
        // item.splitCount           = '';
        // item.galliumIpAddress     = '';
        // item.galliumHostname      = '';
        item.galliumStartMode     = '';
    }
}

function mergeWonParameters(item: Item, wonEvents: any[] | undefined, i: number): void {
    if (wonEvents !== undefined && i < wonEvents.length) {
        item.wonIdx               = i + 1;
        item.wonStartDateTime     = wonEvents[i].wonStartDateTime;
        item.wonStartTime         = getTimeFrames(wonEvents[i].wonStartDateTime.split(' ')[1]);
        item.wonStopDateTime      = wonEvents[i].wonStopDateTime;
        item.wonStopTime          = getTimeFrames(wonEvents[i].wonStopDateTime.split(' ')[1]);
        item.wonType              = wonEvents[i].type;
        item.wonTitle             = wonEvents[i].title.trim();
        item.wonProduction        = wonEvents[i].productionNumber;
        item.wonTxEventId         = wonEvents[i].txEventId;
        item.wonDuration          = getTimeFrames(wonEvents[i].wonDuration);
        item.wonGap               = wonEvents[i].gap;
    } else {
        item.wonIdx               = '';
        item.wonStartDateTime     = '';
        item.wonStartTime         = '';
        item.wonStopDateTime      = '';
        item.wonStopTime          = '';
        item.wonType              = event_type.unknown;
        item.wonTitle             = '';
        item.wonProduction        = '';
        item.wonTxEventId         = '';
        item.wonDuration          = '';
        item.wonGap               = '';
    }
}

function getStartTimeOffset(startDateTime_1: string, startDateTime_2: string): string {
    let returnOffset = ''; // Default return

    if (startDateTime_1 !== '' && startDateTime_2 !== '') {
        const offsetMs = moment(startDateTime_2).diff(moment(startDateTime_1));

        if (offsetMs === 0) {
            returnOffset = '';
        } else if (offsetMs > 0) {
            returnOffset = getDurationFfFromDurationMs(offsetMs);
        } else { // offsetMs < 0
            returnOffset = '-' + getDurationFfFromDurationMs(-offsetMs);
        }
    }

    return returnOffset;
}

function getDurationDiff(duration_1: string, duration_2: string): string {
    let returnDiff = ''; // Default return

    if (duration_1 !== '' && duration_2 !== '') {
        const split_1 = duration_1.split(':');
        const split_2 = duration_2.split(':');

        const durationMs_1 = ( ( parseInt(split_1[0] ?? '') * 60 + parseInt(split_1[1] ?? '') ) * 60 + parseInt(split_1[2] ?? '') ) * 1000 + parseInt(split_1[3] ?? '') * 40;
        const durationMs_2 = ( ( parseInt(split_2[0] ?? '') * 60 + parseInt(split_2[1] ?? '') ) * 60 + parseInt(split_2[2] ?? '') ) * 1000 + parseInt(split_2[3] ?? '') * 40;
        const diffMs = durationMs_2 - durationMs_1;

        if (diffMs === 0) {
            returnDiff = '';
        } else if (diffMs > 0) {
            returnDiff = getDurationFfFromDurationMs(diffMs);
        } else {
            returnDiff = '-' + getDurationFfFromDurationMs(-diffMs);
        }
    }

    return returnDiff;
}

function getDurationFfFromDurationMs(durationMs: number): string {
    if (durationMs < 0) {
        tsConsoleLog(`ERROR: Unexpected durationMs ${durationMs} in getDurationFfFromDurationMs`);
        return '00:00:00:00' // ** BREAK **
    }

    const HH = Math.floor((durationMs / 1000 / 3600 ) % 24);
    const MM = Math.floor((durationMs / 1000 / 60) % 60);
    const SS = Math.floor((durationMs / 1000) % 60);
    const mS = Math.round(durationMs - 1000 * (HH * 3600 + MM * 60 + SS));
    const FF = Math.round(mS * 25 / 1000);

    return `${('0' + HH).slice(-2)}:${('0' + MM).slice(-2)}:${('0' + SS).slice(-2)}:${('0' + FF).slice(-2)}`;
}

function getTimeFrames(durationMs: string): string {
    return durationMs.slice(0, 8) + ':' + ('00' + parseInt(durationMs.split('.')[1] ?? '') / 40).slice(-2);
}

function createHtmlPage(masterEvents: any[], channel: string, ipAddressGallium: string): string {    
    const header =  '<!doctype html>' +
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
                            '<p>' + lastRan + '</p>' +
                            '<script src="js/scripts.js"></script>' +
                            '<table id="tablify" class="tablify" border="1" cellspacing="1" cellpadding="3">';

    let colorGroup =            '<colgroup>';
    for (const e of appInfo.tableHeader) {
        colorGroup +=               '<col span="1" style="background-color:' + e.backgroundColor + '">';
    }
    colorGroup +=           '</colgroup>';

    let tableHeader =           '<tr>';
    for (const e of appInfo.tableHeader) {
        tableHeader +=              '<th>' + e.header + '</th>';
    }
    tableHeader +=              '</tr>';

    let tableBody = '';
    for (const item of masterEvents) {
        const isLive     = (item.wonType & event_type.live)     || (item.galliumType & event_type.live)     ? true : false;
        const isJunction = (item.wonType & event_type.junction) || (item.galliumType & event_type.junction) ? true : false;

        tableBody += isJunction ? '<tr>' : isLive ? '<tr style="background-color:#efd8f6">' : '<tr style="background-color:#f2eada">';
        for (const e of appInfo.tableHeader) {
            let isBold   = (e.name == 'wonTitle' || e.name == 'galliumTitle') && !isJunction;
            let isPadded = (e.name == 'wonTitle' || e.name == 'galliumTitle') && isJunction
            let isLeft   = (e.name == 'wonTitle' || e.name == 'galliumTitle');
            let isRed = false;  // Default
            
            if (e.name == 'startTimeOffset' && item.startTimeOffset != '') {
                if (getMsFromHHMMSSFF(item.startTimeOffset) >= 60000) {
                    isRed = true;  // Highlight start times offset by more than 1 minute
                    isBold = true;
                }
            } else if (e.name == 'durationDiff' && item.durationDiff != '') {
                if (isJunction) {
                    if (getMsFromHHMMSSFF(item.durationDiff) >= 10000) {
                        isRed = true;  // Highlight junction durations which are different by more than 10 seconds
                    }
                } else {
                    isRed = true;  // Highlight program/live durations which are different
                    isBold = true;
                }
            } else if (e.name == 'wonTitle' || e.name == 'galliumTitle') {
                if (item.wonTitle != item.galliumTitle) {
                    isRed = true;  // Highlight titles which are different
                }
            } else if (e.name == 'wonDuration' || e.name == 'galliumDuration') {
                if (item.wonDuration != '' && item.galliumDuration != '' && 
                    item.wonDuration != item.galliumDuration) {
                    if (isJunction) {
                        if (getMsFromHHMMSSFF(item.durationDiff) >= 10000) {
                            isRed = true;  // Highlight junction durations which are different by more than 10 seconds
                        }
                    } else {
                        isRed = true;  // Highlight program/live durations which are different
                        isBold = true;
                    }
                }
            } else if (e.name == 'wonProduction' || e.name == 'galliumProduction') {
                if (item.wonProduction != '' && item.galliumProduction != '' && item.wonProduction != item.galliumProduction) {
                    isRed = true;  // Highlight productions which are different
                    isBold = true;
                }
            } else if (e.name == 'wonTxEventId' || e.name == 'galliumTxEventId') {
                if (item.wonTxEventId != '' && item.galliumTxEventId != '' && item.wonTxEventId != item.galliumTxEventId) {
                    isRed = true;  // Highlight txEventIds which are different
                    isBold = isJunction ? false : true;  // Not bold for junctions, because these are often different
                }
            } else if (e.name == 'galliumGap' && item.galliumGap != '') {
                isRed = true;  // Hightlight gaps in the Gallium playlist
                isBold = true;
            } else if (e.name == 'wonGap' && item.wonGap != '') {
                isRed = true;  // Hightlight gaps in the WhatsOn playlist
                isBold = true;
            }
            
            const myStyle = (isRed ? 'color:red;' : '') + (isLeft ? 'text-align:left;' : 'text-align:center;');

            tableBody +=        '<td style="' + myStyle + '">' + (isBold ? '<b>' : '') +  (isPadded ? '&nbsp;&nbsp;' : '' ) + 
                                        item[e.name] + (isBold ? '</b>' : '') + '</td>';
        }
        tableBody +=            '</tr>';
    }

    const footer =          '</table>' +
                        '</body>' +
                    '</html>';

    return (header + colorGroup + tableHeader + tableBody + footer);    
}

function getMsFromHHMMSSFF(time: string): number {
    const split    = time.split(':');
    const hours    = parseInt(split[0] ?? '');
    const minutes  = parseInt(split[1] ?? '');
    const seconds  = parseInt(split[2] ?? '');
    const millisec = parseInt(split[3] ?? '') * 40;

    return ((hours * 60 + minutes) * 60 + seconds) * 1000 + millisec;
}

function tsConsoleLog(string: string): void {
    let timestamp = moment().format('YYYY-MM-DD HH:mm:ss.SSS');
    console.log(timestamp + ': ' + string);
}

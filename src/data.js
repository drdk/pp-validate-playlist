const wonBackgroundColor     = '#e6ffe6';
const galliumBackgroundColor = '#e6e6ff';

const appInfo = Object.freeze({
	loggingPath: '\\\\pp01\\system$\\Logs\\pp-validate-playlist\\',
	monitoringPath: '\\\\pp01\\system$\\Monitoring\\pp-validate-playlist\\',
	liveEpgApiIpAddress: Object.freeze([
		'10.117.120.254', // SK1 - main
		'10.117.120.201', // SK2 - backup
	]),
	channel: Object.freeze([
		{
			name: 'DR1',
		},
		{
			name: 'DR2',
		},
		{
			name: 'TVR',
		},
		{
			name: 'TSK',
		},
		{
			name: 'EVA',
		},
		{
			name: 'EVB',
		},
		{
			name: 'EVC',
		},
	]),
	// Enable parameters to see in the table
	table: Object.freeze([
		{ name: 'startTimeOffset', 			   header: 'Start Offset', 	  backgroundColor: '#ffffff' },
		{ name: 'durationDiff', 			   header: 'Duration Offset', backgroundColor: '#ffffff' },
		{ name: 'wonIdx', 					   header: '#', 			  backgroundColor: wonBackgroundColor },
		//		{name: 'wonStartDateTime',     header: 'Start DateTime',  backgroundColor: wonBackgroundColor},
		{ name: 'wonStartTime', 			   header: 'Start Time', 	  backgroundColor: wonBackgroundColor },
		//		{name: 'wonStopDateTime',      header: 'Stop DateTime',   backgroundColor: wonBackgroundColor},
		//		{name: 'wonStopTime',          header: 'Stop Time',       backgroundColor: wonBackgroundColor},
		//		{name: 'wonType',              header: 'Type',            backgroundColor: wonBackgroundColor},
		{ name: 'wonTitle', 				   header: 'WHATSON', 		  backgroundColor: wonBackgroundColor },
		{ name: 'wonDuration', 				   header: 'Duration', 		  backgroundColor: wonBackgroundColor },
		{ name: 'wonProduction', 			   header: 'Production', 	  backgroundColor: wonBackgroundColor },
		{ name: 'wonTxEventId', 			   header: 'TxEventId', 	  backgroundColor: wonBackgroundColor },
		{ name: 'wonGap', 					   header: 'Gap', 			  backgroundColor: wonBackgroundColor },
		{ name: 'galliumIdx', 				   header: '#', 			  backgroundColor: galliumBackgroundColor },
		//		{name: 'galliumStartDateTime', header: 'Start DateTime',  backgroundColor: galliumBackgroundColor},
		{ name: 'galliumStartTime', 		   header: 'Start Time', backgroundColor: galliumBackgroundColor },
		//		{name: 'galliumStopDateTime',  header: 'Stop DateTime',   backgroundColor: galliumBackgroundColor},
		//		{name: 'galliumStopTime',      header: 'Stop Time',       backgroundColor: galliumBackgroundColor},
		//		{name: 'galliumType',          header: 'Type',            backgroundColor: galliumBackgroundColor},
		{ name: 'galliumTitle', 			   header: 'GALLIUM', 		  backgroundColor: galliumBackgroundColor },
		{ name: 'galliumDuration', 			   header: 'Duration', 		  backgroundColor: galliumBackgroundColor },
		{ name: 'galliumProduction', 		   header: 'Production', 	  backgroundColor: galliumBackgroundColor },
		{ name: 'galliumTxEventId', 		   header: 'TxEventId', 	  backgroundColor: galliumBackgroundColor },
		//		{name: 'galliumBlockId',       header: 'BlockId',         backgroundColor: galliumBackgroundColor},
		{ name: 'galliumGap', 				   header: 'Gap', 			  backgroundColor: galliumBackgroundColor },
		{ name: 'galliumStartMode', 		   header: 'Start Mode', 	  backgroundColor: galliumBackgroundColor },
		{ name: 'galliumRouterSource', 		   header: 'Source', 		  backgroundColor: galliumBackgroundColor },
	]),
});

const event_type = Object.freeze({
	unknown:	0x0000,  
	live:       0x0001,  // LIVE
	program:    0x0002,  // PROGRAM
	junction:   0x0004,  // LINEUP, TRAILER, PROMO, IDENT
	mask_all:   0x0001 | 0x0002 | 0x0004
});

module.exports.appInfo = appInfo;
module.exports.event_type = event_type;


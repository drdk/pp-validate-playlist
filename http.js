var Client = require('node-rest-client').Client;

function getWhatsOnEventsForChannel(woChannel, broadcastDay, callback) {
	var client = new Client();
	var getCmd = 'http://localhost:8001/api/schedules/' + woChannel + (broadcastDay == '' ? '' : '/' + broadcastDay) + '?events=0x7&time=now';

	// http://localhost:8001/api/schedules/DR1/2020-11-17?events=0x7&time=now

	client
		.get(getCmd, function (data, response) {
			callback(null, JSON.parse(data, 'utf-8')); // Return the schedule back to the caller
		})
		.on('error', function (err) {
			console.log('something went wrong on the request in getWhatsOnEventsForChannel()', err);
			callback(null, []); // Return error back to the caller
		});

	// handling client error events
	client.on('error', function (err) {
		console.error('Something went wrong on the client', err);
		callback(null, []); // Return error back to the caller
	});
}

function getHttpCommand(cmd, callback) {
	var client = new Client();

	client
		.get(cmd, function (data, response) {
			callback(null, data); // Return the schedule back to the caller
		})
		.on('error', function (err) {
			console.log('something went wrong on the request in getHttpCommand()', err);
			callback(null, []); // Return error back to the caller
		});

	// handling client error events
	client.on('error', function (err) {
		console.error('Something went wrong on the client', err);
		callback(null, []); // Return error back to the caller
	});
}

module.exports.getWhatsOnEventsForChannel = getWhatsOnEventsForChannel;
module.exports.getHttpCommand = getHttpCommand;

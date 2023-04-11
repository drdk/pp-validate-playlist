export {};

const moment = require('moment');
const fetch = require('node-fetch');
const AbortController = require('abort-controller');

async function httpGetWithTimeout(url, options) {
	const { timeout = 10000, user, password, type } = options;

	let headers = {};
	if (user && password) {
		headers = { 'Authorization': 'Basic ' + Buffer.from(`${user}:${password}`, 'binary').toString('base64') };
	}

	const controller = new AbortController(); // Create an instance of the abort controller
	const id = setTimeout(() => controller.abort(), timeout); // Start a timing function

	const response = await fetch(url, { 
		method: 'GET',
		headers: headers,
		timeout: timeout, 
		signal: controller.signal // Connect fetch() with the abort controller
	});
	clearTimeout(id); // Clear the abort timing function if the request completes faster than timeout

	if (!response.ok) {
		throw new Error(`An error has occurred: ${response.status}`); // Throw an error on bad HTTP status outside the range 200-299
	}

	let result = null;
	if (type === 'json') {
		result = await response.json();
	} else {
		result = await response.text();
	}
	return result;
}

function tsConsoleLog(string) {
	let timestamp = moment().format('YYYY-MM-DD HH:mm:ss.SSS');
	console.log(timestamp + ': ' + string);
}

module.exports.httpGetWithTimeout = httpGetWithTimeout;

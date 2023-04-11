const fetch = require("node-fetch");
const AbortController = require("abort-controller");

async function httpGetWithTimeout(url: string, options: any): Promise<any> {
    const { timeout = 10000, xApiKey, user, password, type } = options;

    let headers = {};
    if (xApiKey) {
        headers = { 'x-api-key': xApiKey };
    } else if (user && password) {
        headers = { 'Authorization': 'Basic ' + Buffer.from(`${user}:${password}`, 'binary').toString('base64') };
    }

    const controller = new AbortController(); // Create an instance of the abort controller
    const id = setTimeout(() => controller.abort(), timeout); // Start a timing function

    const response = await fetch(url, {
        method: 'GET',
        headers: headers,
		timeout: timeout, 
        signal: controller.signal, // Connect fetch() with the abort controller
    });
    clearTimeout(id); // Clear the abort timing function if the request completes faster than timeout

    if (!response.ok) {
        throw new Error(`An error has occurred: ${response.status}`); // Throw an error on bad HTTP status outside the range 200-299
    }

    if (type === 'json') {
        return await response.json();
    } else {
        return await response.text();
    }
}

export { httpGetWithTimeout };

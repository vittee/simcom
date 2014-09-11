var SimCom = require('../').SimCom,
	pdu = require('pdu');

if (process.argv.length - 2 < 2) {
	console.log('Usage: ' + process.argv[1] + ' <MSIDN> <Text>');
	process.exit(1);
	return;
}

var simcom = new SimCom('/dev/ttyAMA0');
simcom.on('open', function() {
	this.sendSMS(process.argv[2], process.argv[3]).then(function(res) {
		console.log(res);
	}).catch(function(error) {
		console.log('ERR', error);
	}).done(function() {
		simcom.close();
	});
});

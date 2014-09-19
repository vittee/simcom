var SimCom = require('../').SimCom,
	pdu = require('pdu');

if (process.argv.length - 2 < 2) {
	console.log('Usage: ' + process.argv[1] + ' <MSIDN> <Text>');
	process.exit(1);
	return;
}

var simcom = new SimCom('/dev/ttyAMA0');
simcom.on('open', function() {
	var count = process.argv[4] || 1;
	var promise = null;

	for (var i = 0; i < count; i++) {
		promise = this.sendSMS(process.argv[2], process.argv[3]);

		promise.then(function(res) {
			console.log( res);
		}).catch(function(error) {
			console.log('ERR', error);
		});
	}

	promise.done(function() {
		simcom.close();
	});
});

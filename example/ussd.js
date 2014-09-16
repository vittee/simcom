var SimCom = require('../').SimCom;

var simcom = new SimCom('/dev/ttyAMA0');
simcom.on('open', function() {
	simcom.requestUSSD('#123#').then(function(res) {
		console.log('ussd result', res);
	}).catch(function(error) {
		console.log('error', error);
	})
	.done(function() {
	});
});

simcom.on('ussd', function(ussd) {
	console.log('USSD:', ussd);
});

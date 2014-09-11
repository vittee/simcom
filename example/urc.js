var modem = require('../').modem('/dev/ttyAMA0');

console.log(modem);

modem.on('open', function() {
	console.log('Waiting...');
});

modem.on('error', function(err) {
  console.error('ERR:', err);
});

modem.on('ring', function() {
	console.log('Ringing...');
});

modem.on('end ring', function() {
	console.log('End Ring');
});

modem.on('new message', function(notification) {
	console.log('new message', notification);
});

modem.open();


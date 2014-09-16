var modem = require('../').modem('/dev/ttyAMA0');

modem.on('open', function() {
  console.log('port open');

  modem.execute("ATI")
  .then(function(res) {
    console.log('#1', res.code, res.lines);
    return modem.execute("AT+COPS?");
  })
  .then(function(res) {
    console.log('#2', res.code, res.lines);
  })
  .done(function() {
  	modem.close();
  });

});

modem.on('error', function(err) {
  console.error('ERR:', err);
});

modem.open();


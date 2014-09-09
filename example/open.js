var modem = require('../').modem('/dev/ttyAMA0');

console.log(modem);

modem.on('open', function() {
  console.log('port open');

  modem.execute("AT+COPS?")
  .then(function(res) {
    console.log('#1', res.code, res.lines);
    return modem.execute("AT+COPS?");
  })
  .then(function(res) {
    console.log('#2', res.code, res.lines);
  });

});

modem.on('error', function(err) {
  console.error('ERR:', err);
});

modem.open();


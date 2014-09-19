var modem = require('../').modem('/dev/ttyAMA0');

function catchError(e) {
	console.log('error', e);
}

modem.on('open', function() {
  console.log('port open');

  modem.execute("ATI").then(function(res) {
    console.log('#1', res.code, res.lines);
  })
  .catch(catchError);

  modem.execute("AT+COPS?").then(function(res) {
    console.log('#2', res.code, res.lines);
  })
  .catch(catchError)
  .done(function() {
  	modem.close();
  });
  

});

modem.on('error', function(err) {
  console.error('ERR:', err);
});

modem.open();


simcom
============

Talk to GSM modem from SIMCOM via serial port using Node
--
This module was written with Raspberry Pi aspect in mind, but it basically should work on all linux distros, it might work on Windows as well (not tested yet), you just need a serial port filesystem (/dev/ttyAMA0 for RPi).

It has been tested on SIM800L module.

# Installation
```sh
npm install simcom
```

# Example

### Openning the port
```javascript
var modem = require('simcom').modem('/dev/ttyAMA0');

modem.on('open', function() {
  // do something with the modem
});

modem.error('error', function() {

});

modem.open(); // open the port
```

The `modem` function is a factory function, it creates an instance of `Modem` class for a device if neccessary.

### Sending raw data
Talk directly to the modem using `Modem.write()` method.
```javascript
modem.write('ATI\r');
```

### Executing a command
`Modem.execute()` returns a promise which you can easily setup callbacks to process the response or error.
```javascript
modem.execute('ATI').then(function(lines) {
  console.log('ATI Response', lines);
}, function(error) {
  console.error('ATI Command Error', error);
});
```

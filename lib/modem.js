// vim: ts=2 expandtab
var util = require('util'),
  serialport = require('serialport'),
  buffertools = require('buffertools'),
  Q = require('q'),
  EventEmitter = require('events').EventEmitter;

var Modem = (function Modem_cctor() {
    function Modem(device, options) {
      options = options || {};
      if (!options.lineEnd) {
        options.lineEnd = "\r\n";
      }

      this.options = options;
      this.opened = false;
      this.device = device;
      this.port = null;
      this.buffer = new Buffer(0);
      this.lines = [];
      this.defers = [];
      buffertools.extend(this.buffer);
    }

    util.inherits(Modem, EventEmitter);

    Modem.prototype.open = function() {
      var self = this;

      if (self.opened) {
        self.emit('open');
        return;
      }

      this.port = new serialport.SerialPort(this.device, { parser: serialport.parsers.raw } );

      this.port.on('open', function() {
        self.emit('open');

        this.on('data', function(data) {
          self.buffer = Buffer.concat([self.buffer, data]);
          readBuffer.call(self);
        });
      });

      this.port.on('close', function() {
        self.opened = false;
        self.emit('close');
      });

      this.port.on('error', function(err) {
        self.emit('error', err);
      });

      this.opened = true;
    }

    Modem.prototype.close = function() {
      this.port.close();
      this.port = null;
      instances[this.device] = null;
    }

    Modem.prototype.execute = function(command) {
      var defer = Q.defer();
      this.port.write(command + "\r");
      this.defers.push(defer);
      return defer.promise;
    }

    function readBuffer() {
      var self = this;

      var lineEndLength = self.options.lineEnd.length;
      var lineEndPosition = buffertools.indexOf(self.buffer, self.options.lineEnd);

      if (lineEndPosition === -1) {
        return;
      }

      /*
      if ((lineEndPosition < this.buffer.length - 1) && (this.buffer[lineEndPosition + 1] == 0x0A)) {
        lineEndLength++;
      }
      */

      var line = this.buffer.slice(0, lineEndPosition);
      var newBuffer = new Buffer(this.buffer.length - lineEndPosition - lineEndLength);
      this.buffer.copy(newBuffer, 0, lineEndPosition + lineEndLength);
      this.buffer = newBuffer;

      processLine.call(this, line.toString('ascii'));
      process.nextTick(readBuffer.bind(this));
    }

    function processLine(line) {
      if (line.substr(0, 2) == 'AT') {
        // echo'd line
        return;
      }

      this.lines.push(line);
      processLines.call(this);
    }

    function isResultCode(line) {
      return /(^OK|ERROR|BUSY|DATA$)|(^CONNECT( .+)*$)/.test(line);
    }

    function processLines() {
      if (!this.lines.length) {
        return;
      }

      if (!isResultCode(this.lines[this.lines.length-1])) {
        return;
      }

      if (this.lines[0].trim() == '') {
        this.lines.shift();
      }

      processResponse.call(this);
      this.lines = [];
    }

    function processResponse() {
      var responseCode = this.lines.pop();
      var defer = this.defers.shift();

      if (responseCode == 'ERROR') {
        defer.reject(responseCode);
        return;
      }

      defer.resolve({ code: responseCode, lines: this.lines});
    }

    //
  return Modem;
})();

var instances = {};
var init = function(device, options) {
  device = device || '/dev/ttyAMA0';

  if (!instances[device]) {
    instances[device] = new Modem(device, options);
  }

  return instances[device];
}

module.exports = init;

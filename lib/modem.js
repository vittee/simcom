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

    Modem.prototype.open = function(timeout) {     
      var self = this;

      if (self.opened) {
        self.emit('open');
        return;
      }

      timeout = timeout || 5000;

      this.port = new serialport.SerialPort(this.device, { parser: serialport.parsers.raw } );

      this.port.on('open', function() {
        this.on('data', function(data) {
          console.log(data, data.toString());
          self.buffer = Buffer.concat([self.buffer, data]);
          readBuffer.call(self);
        });

        self.execute({ command: 'AT', timeout: timeout }).then(function() {
          self.emit('open');
        }).catch(function(error) {
          self.emit('error', error);
        }).done();;
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

    Modem.prototype.write = function(data) {
      this.port.write(data);
    }

    Modem.prototype.execute = function(command) {
      var defer = Q.defer();
      var p = null;
      var timeout;

      if (typeof command == 'object') {
        p = command.pdu;
        command = command.command;
        if (command.timeout) {
          timeout = Number(timeout);
        }
      }
      //
      defer.command = command.split("\r", 1).shift();
      defer.pdu = p;
      //
      this.write(command + "\r");
      this.defers.push(defer);

      if (timeout) {
        setTimeout(function() {
          defer.reject(new Error('timed out'));
        }, timeout);
      }

      return defer.promise;
    }

    function readBuffer() {
      var self = this;

      var lineEndLength = self.options.lineEnd.length;
      var lineEndPosition = buffertools.indexOf(self.buffer, self.options.lineEnd);

      if (lineEndPosition === -1) {
        if (this.buffer.length == 2 && this.buffer.toString() == '> ') {
          processLine.call(this, this.buffer.toString());
        }
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

    var unboundExprs = [
      {
        expr: /^OVER-VOLTAGE WARNNING$/,
        func: function(m) {
          this.emit('over-voltage warnning');
        }
      },

      {
        expr: /^RING$/,
        func: function(m) {
          this.ringing = true;
          this.emit('ring');
        }
      },

      {
        expr: /^\+CMTI:(.+)$/,
        func: function(m) {
          this.emit('new message', m[1]);
        }
      }
    ];

    function processUnboundLine(line) {
      for (var i = 0; i < unboundExprs.length; i++) {
        var u = unboundExprs[i];
        var m = line.match(u.expr);

        if (m) {
          u.func && u.func.call(this, m);
          this.emit('urc', m, u.expr);
          return true;
        }
      }

      return false;
    }

    function processLine(line) {
      if (line.substr(0, 2) == 'AT') {
        // echo'd line
        return;
      }

      if (processUnboundLine.call(this, line)) {
        return;
      }

      // special handling for ring
      if (this.ringing && line == 'NO CARRIER') {
        this.ringing = false;
        this.emit('end ring');
        return;
      }

      this.lines.push(line);
      processLines.call(this);
    }

    function isResultCode(line) {
      return /(^OK|ERROR|BUSY|DATA|NO CARRIER|> $)|(^CONNECT( .+)*$)/.test(line);
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
      var defer = this.defers[0];

      if (responseCode == '> ') {
        if (defer && defer.pdu) {
          var pduSize = defer.pdu.length;
          var b = new Buffer(pduSize + 1);
          b.write(defer.pdu);
          b.writeUInt8(26, pduSize);
          this.write(b);
          defer.pdu = null;
        }
        return;
      }

      if (defer) {
        this.defers.shift();
      
        if (responseCode == 'ERROR') {
          defer.reject({ code: responseCode, command: defer.command });
          return;
        }

        defer.resolve({ code: responseCode, command: defer.command, lines: this.lines});
      }
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

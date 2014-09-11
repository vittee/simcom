// vim: ts=2 expandtab
var util = require('util'),
  Q = require('q'),
  pdu = require('pdu'),
  EventEmitter = require('events').EventEmitter;

function SimCom(device) {
  this.modem = require('./modem')(device);
  
  var self = this;

  this.modem.on('open', function() { 
    self.emit('open'); 
  });

  this.modem.on('close', function() { self.emit('close'); });
  this.modem.on('error', function(error) { self.emit('error', error); });

  this.modem.open();
}

util.inherits(SimCom, EventEmitter);

SimCom.prototype.close = function() {
  this.modem.close();
}

/**
 * Execute a Raw AT Command
 * @param command Raw AT Command
 * @returns Promise
 */
SimCom.prototype.execute = function(command) {
  return this.modem.execute(command);
}

var simple_methods = {
  productID: 'ATI',
  manufacturerID: 'AT+GMI',
  modelID: 'AT+GMM',
  globalID: 'AT+GOI',
  IMEI: 'AT+GSN',
  subscriberID: 'AT+CIMI',
}

Object.keys(simple_methods).forEach(function(name) {
  SimCom.prototype[name] = function() {
    var defer = Q.defer();

    this.execute(simple_methods[name])
      .then(function(res) {
        defer.resolve(res.lines.shift());
      })
      .catch(function(res) {
        defer.reject(res);
      });

    return defer.promise;
  };
});

SimCom.extractResponse = SimCom.prototype.extractResponse = function(resp, readPDU) {
  if (!resp || !resp.command || !resp.lines || !resp.lines.length) {
    return;
  }

  var cmd = resp.command.match(/^AT([^\=\?]*)/);
  if (!cmd || cmd.length < 2) {
    return;
  }

  cmd = cmd[1];

  var result = [];

  /*
  return resp.lines.reduce(function(m, e) {
    if (e.substr(0, cmd.length) == cmd) {
      var line = e.substr(cmd.length).match(/(\:\s*)*(.+)/);
      if (line && line.length > 2) {
        m.push(line[2]);
      }
    }

    return m;
  }, [])
  */

  var needPDU = false;
  var pduResponse = null;
  for (var i = 0; i < resp.lines.length; i++) {
    var line = resp.lines[i];

    if (!needPDU) {
      if (line.substr(0, cmd.length) == cmd) {
        var tokens = line.substr(cmd.length).match(/(\:\s*)*(.+)/);
        if (tokens && tokens.length > 2) {
          if (!readPDU) {
            result.push(tokens[2]);
          } else {
            pduResponse = { response: tokens[2], pdu: null };
          }
          needPDU = readPDU;
        }
      }
    } else {
      pduResponse.pdu = line;
      result.push(pduResponse);
      needPDU = false;
    }
  }

  return result;
}

/**
 * Invoke a RAW AT Command, Catch and process the responses.
 * @param command RAW AT Command
 * @param resultReader Callback for processing the responses
 * @param readPDU Try to read PDU from responses
 * @returns Promise 
 */
SimCom.prototype.invoke = function(command, resultReader, readPDU) {
  var defer = Q.defer();
  var self = this; 
  this.execute(command).then(function(res) {
    var result = SimCom.extractResponse(res, readPDU);
    if (resultReader) {
      result = resultReader.call(self, result);
    }

    defer.resolve(result);

  }).catch(function(error) {
    defer.reject(error);
  });

  return defer.promise;
}

SimCom.prototype.serviceProvider = function() {
  return this.invoke('AT+CSPN?', function(lines) {
    return lines.shift().match(/"([^"]*)"/).pop();
  });
}

SimCom.prototype.listSMS = function(stat) {
  return this.invoke('AT+CMGL=' + stat, function(res) {
    return res.map(function(m) {
      var infos = m.response.split(',');
      return {
        index: Number(infos[0]),
        stat: infos[1],
        message: pdu.parse(m.pdu)
      };
    });
  }, true);
}

SimCom.prototype.sendSMS = function(receiver, text) {
  var p = pdu.generate({
    encoding: '16bit',
    receiver: receiver,
    text: text
  }).shift();

  var pduLength = (p.length/2)-1;
  return this.invoke({ command: 'AT+CMGS=' + pduLength, pdu: p }, function(res) {
     return res.shift();
  });
}

module.exports = SimCom;


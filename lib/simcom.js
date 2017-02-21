// vim: ts=2 expandtab
var util = require('util'),
  Q = require('q'),
  pdu = require('pdu'),
  EventEmitter = require('events').EventEmitter;

function SimCom(device, options) {
  this.modem = require('./modem')(device, options);
  
  var self = this;

  // delegates modem events
  ['open', 'close', 'error', 'ring', 'end ring', 'over-voltage warnning'].forEach(function(e) {
    self.modem.on(e, function() {
      var args = Array.prototype.slice.call(arguments);
      args.unshift(e);
      self.emit.apply(self, args);
    });
  });

  this.modem.on('new message', handleNewMessage.bind(this));
  this.modem.on('ussd', handleUSSD.bind(this));

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

function parse(s) {
  var quoted = false;
  var item = '';
  var items = [];

  for (var i = 0; i < s.length; i++) {
    var valid = false;

    switch (s[i]) {
      case '"':
        quoted = !quoted;
        break;

      case ',':
        valid = quoted;
        if (!quoted) {
          items.push(item);
          item = '';
        }
        break;
        
      default:
        valid = true;
    }

    if (valid) item += s[i];
  }

  if (item) {
    items.push(item);
  }

  return items;
}

function handleNewMessage(m) {
  m = parse(m);
  m = {
    storage: m[0],
    index: Number(m[1]),
    type: m.length > 2 ? m[2] : 'SMS'
  };

  this.emit('new message', m);
}

function handleUSSD(m) {
  m = parse(m).map(function(e) { return e.trim(); });
  m = {
    type: Number(m[0]),
    str: m[1],
    dcs: Number(m[2])    
  };

  m.str = m.dcs == 72 ? pdu.decode16Bit(m.str) : pdu.decode7Bit(m.str);
  this.emit('ussd', m);
}

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
  var needPDU = false;
  var pduResponse = null;
  var cmdMatched = false; 
  for (var i = 0; i < resp.lines.length; i++) {
    var line = resp.lines[i];

    if (line == '') {
      cmdMatched = false;
      continue;
    }

    if (!needPDU) {
      if (!cmdMatched) {
        if (line.substr(0, cmd.length) == cmd) {
          var tokens = line.substr(cmd.length).match(/(\:\s*)*(.+)*/);
          if (tokens && tokens.length > 2) {
            line = tokens[2];
            cmdMatched = true;
          }
        }
      }

      if (cmdMatched) {
        if (line) {
          if (!readPDU) {
            result.push(line);
          } else {
            pduResponse = { response: line, pdu: null };
          }
        }

        needPDU = readPDU;
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
    var result = SimCom.extractResponse(res, readPDU) || null;
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
      var infos = parse(m.response);
      return {
        index: Number(infos[0]),
        stat: infos[1],
        message: pdu.parse(m.pdu)
      };
    });
  }, true);
}

SimCom.prototype.readSMS = function(index, peek) {
  return this.invoke('AT+CMGR=' + index + ',' +  (peek ? 0 : 1), function(res) {
    return pdu.parse(res.shift().pdu);
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

SimCom.prototype.setBearerParam = function(id, tag, value) {
  return this.invoke('AT+SAPBR=3,' + id + ',' + '"' + tag  + '","' + value + '"');
}

SimCom.prototype.setBearerParams = function(id, params) {
  var self = this;
  return Object.keys(params).reduce(function(d, k) {
    return d.then(function() {
      self.setBearerParam(id, k, params[k]);
    });
  }, Q(0));
}

SimCom.prototype.getBearerParams = function(id) {
  return this.invoke('AT+SAPBR=4,' + id, function(lines) {
    return lines.reduce(function(m, v) {
      v = v.split(':', 2);
      m[v[0].trim()] = v[1].trim();
      return m;
    }, {});
  });
}

SimCom.prototype.activateBearer = function(id) {
  return this.invoke('AT+SAPBR=1,'+id);
}

SimCom.prototype.deactivateBearer = function(id) {
  return this.invoke('AT+SAPBR=0,'+id);
}

SimCom.prototype.queryBearer = function(id) {
  return this.invoke('AT+SAPBR=2,'+id, function(lines) {
    var line = lines.shift() || '';
    var m = line.match(/(.+),(.+),\"([^"]*)/);

    var cid = Number(m[1]);
    var status_code = Number(m[2]);
    var status = status_code;
    var ip = m[3];
   
    switch (status_code) {
      case 1:
        status = 'connected';
        break;
      case 2:
        status = 'closing';
        break;
      case 3:
        status = 'closed';
        break;
      default:
        status = 'unknown';
    }

    return {
      id:  cid,
      status_code: status_code,
      status: status,
      ip: ip
    };
  });
}

SimCom.prototype.startBearer = function(id) {
  var self = this;

  return self.queryBearer(id).then(function(res) {
    if (!res || res.status_code != 1) {
      return self.activateBearer(id);
    }
  });
}

SimCom.prototype.initMMS = function() {
  return this.invoke('AT+CMMSINIT');
}

SimCom.prototype.terminateMMS = function() {
  return this.invoke('AT+CMMSTERM');
}

SimCom.prototype.startMMS = function() {
  var self = this;

  return self.initMMS().then(null,
    function error() {
      return self.terminateMMS().then(function() {
        return self.initMMS();
      });
    }
  );
}

SimCom.prototype.editMMS = function(edit) {
  return this.invoke('AT+CMMSEDIT=' + Number(edit || false));
}

function downloadMMS(type, data, name) {
  if (!/^(PIC|TEXT|TITLE)$/i.test(type)) {
    throw new Error('Invalid MMS Download Type');
  }

  if (data && data.length) {
    type = type.toUpperCase();
    var timeout = Math.max(200000, Math.ceil(data.length/this.modem.options.baudrate*1000*8));
    var param = '"' + type + '",' + data.length + ',' + timeout;
    if (name) {
      param += ',"' + name + '"';
    }

    var self = this;

    return self.invoke('ATE1').then(function() {

      return self.invoke({ command: 'AT+CMMSDOWN=' + param, pdu: data, timeout: timeout });
    });

  }
}

SimCom.prototype.downloadMMSText = function(text, name) {
  return downloadMMS.call(this, 'TEXT', text, name);
}

SimCom.prototype.downloadMMSTitle = function(title) {
  return downloadMMS.call(this, 'TITLE', title);
}

SimCom.prototype.downloadMMSPicture = function(data, name) {
  return downloadMMS.call(this, 'PIC', data, name);
}

SimCom.prototype.setMMSRecipient = function(address) {
  if (Array.isArray(address)) {
    var self = this;

    return Q.all(address.map(function(addr) {
      return self.setMMSRecipient(addr);
    }));
  }

  return this.invoke('AT+CMMSRECP="' + address + '"');
}

SimCom.prototype.viewMMS = function() {
  return this.invoke('AT+CMMSVIEW', function(lines) {
    var tokens = parse(lines.shift());
    var files = lines.map(function(line) {
      var t = parse(line);
      return {
        index: Number(t[0]),
        name: t[1],
        type: (function() {
          switch (Number(t[2])) {
            case 2:
              return 'text';
            case 3:
              return 'text/html';
            case 4:
              return 'text/plain';
            case 5:
              return 'image';
            case 6:
              return 'image/gif';
            case 7:
              return 'image/jpg';
            case 8:
              return 'image/tif';
            case 9:
              return 'image/png';
            case 10:
              return 'smil';
            default:
              return 'unknown'
          }
        })(),
        size: Number(t[3])
      };
    });

    return {
      type: (function() { 
        switch (Number(tokens[0])) {
          case 0:
            return 'received';
          case 1:
            return 'sent';
          case 2:
            return 'unsent';
          default:
            return 'unknown'
        }
      })(),

      sender: tokens[1],
      to: tokens[2].split(';'),
      cc: tokens[3].split(';'),
      bcc: tokens[4].split(';'),
      datetime: Date(tokens[5]),
      subject: tokens[6],
      size: Number(tokens[7]),
      files: files
    };
  });
}

SimCom.prototype.pushMMS = function() {
  return this.invoke({ command: 'AT+CMMSSEND', timeout: 200000 });
}

SimCom.prototype.requestUSSD = function(ussd) {
  return this.invoke('AT+CUSD=1,"' + ussd + '"');
}

module.exports = SimCom;


var util = require('util'),
	pdu = require('pdu'),
	serialport = require('serialport'),
	q = require('q'),
	EventEmitter = require('events').EventEmitter;

function Modem() {

}

Modem.prototype.open = function(device) {
	this.device = device;
	this.port = new serialport.SerialPort(device, { parser: serialport.parsers.raw } );

	this.port.on('open', function() {
		this.emit('open');
		this.port.on('data', function() {

		});
	});

	this.port.on('close', function() {
		this.emit('close');
	});

}

Modem.prototype.close = function() {
	this.port.close();
	this.port = null;
}

util.inherits(Modem, EventEmitter);

var modem = null;

var init = function() {
	if (!modem) {
		modem = new Modem();
	}

	return modem;
}

module.exports = init;
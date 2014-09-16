var SimCom = require('../').SimCom,
	Q = require('q'),
	fs = require('fs');

var simcom = new SimCom('/dev/ttyAMA0', { baudrate: 115200 });
simcom.on('open', function() {
	simcom.startMMS().then(function() {
		console.log('MMS OK');
		
		return simcom.setBearerParams(1, {
			'Contype': 'GPRS',
			'APN': 'hmms'
		});
	})
	.then(function() {
		return simcom.getBearerParams(1);
	})
	.then(function(res) {
		console.log('Bearer settings', res);
		return simcom.startBearer(1);
	})
	.then(function(res) {
		console.log('Started');
		return simcom.queryBearer(1);
	})
	.then(function(res) {
		console.log('Bearer Query', res);
		return simcom.editMMS(true);
	})
	.then(function(res) {
		return simcom.downloadMMSTitle('Test');
	})
	.then(function(res) {
		return Q.nfcall(fs.readFile, 'lena.jpg');
	})
	.then(function(jpg) {
		return simcom.downloadMMSPicture(jpg, 'test.jpg');
	})
	.then(function(res) {
		return simcom.setMMSRecipient('66866266103');
		//return simcom.setMMSRecipient('66840946635');
	})
	.then(function(res) {
		return simcom.viewMMS();
	})
	.then(function(res) {
		console.log('View MMS:', res);
		console.log('Sending...');
		return simcom.pushMMS();
	})
	.then(function(res) {
		console.log('Sent');
		return simcom.editMMS(false);
	})
	.then(function(res) {
		return simcom.terminateMMS();
	})
	.then(function(res) {
		console.log('Deactivating Bearer');
		return simcom.deactivateBearer(1);
	})
	.catch(function(error) {
		console.log('Error', error);
	})
	.done(function() {
		console.log('done');
		simcom.close();
	});	
});

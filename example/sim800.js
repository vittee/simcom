var SimCom = require('../').SimCom;

var simcom = new SimCom('/dev/ttyAMA0');
simcom.on('open', function() {
	var info = {};

	simcom.productID().then(function(res) {
		info.product = res;
		return simcom.manufacturerID();
	}).then(function(res) {
		info.manufacturer = res;
		return simcom.modelID();
	}).then(function(res) {
		info.model = res;
		return simcom.globalID();
	}).then(function(res) {
		info.globalID = res;
		return simcom.IMEI();
	}).then(function(res) {
		info.IMEI = res;
		return simcom.subscriberID();
	}).then(function(res) {
		info.subscriberID = res;
		return simcom.serviceProvider();
	}).then(function(res) {
		info.serviceProvider = res;
	})
	.catch(function(error) {
		console.log('error', error);
	})
	.done(function() {
		console.log(info);
	});
});

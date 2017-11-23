const path = require('path'),
  exchangeWebService = require("ews-javascript-api"),
  auth = require('../config/auth'),
  fetchListOfRooms = require('../config/ews/rooms').default;

module.exports = function(app) {
	// api routes ================================================================
	// returns an array of room objects
	app.get('/api/rooms', function(req, res) {
    fetchListOfRooms({ exchangeWebService, auth }, function(err, rooms) {
			res.json(rooms);
		});
	});

	// returns an array of roomlist objects
	app.get('/api/roomlists', function(req, res) {

		var ews = require('../config/ews/roomlists.js');

		ews(function(err, roomlists) {
			res.json(roomlists);
		});
	});

	// redirects everything else to our react app
	app.get('*', function(req, res) {
		res.sendFile(path.join(__dirname,'../ui-react/build/','index.html'));
	});

};

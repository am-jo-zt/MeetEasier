const exchangeWebService = require("ews-javascript-api"),
  fetchListOfRooms = require('./ews/rooms').default,
  auth = require('./auth');

module.exports = function (io){
  let isRunning = false;

  // Check and update rooms every 60 seconds -----------------------------------
    io.of('/').on('connection', function(socket) {
      if (!isRunning) {
        (function callEWS(){
          fetchListOfRooms({ exchangeWebService, auth }, function(err, result) {
            if (result) {
              if (err) return console.log(err);
              // send data to page
              io.of('/').emit('updatedRooms', result);
            }
            io.of('/').emit('controllerDone', 'done');
          });
          setTimeout(callEWS, 60000);
        })();
      }
      isRunning = true;
    });
};

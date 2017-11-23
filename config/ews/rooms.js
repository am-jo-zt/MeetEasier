// Container with all private functions, which will be exported, to support mocking of functions
const API = {
  _createCalendarFolderId,
  _createCalendarView,
  _createExchangeService,
  _enhanceRooms,
  _getFlightBoardData,
  _getAppointmentsOfRooms,
  _getDataForRooms,
  _getEnhancedRooms,
  _getRoomData,
  _getRoomLists,
  _getNowTimestamp,
  _getRoomsInLists,
  _isRoomBusy,
  _mapAppointment,
  _getRoomAddress,
  _getAddressDataForAllRooms,
  _processTime,
  _slugify,
  _unifyEmailAddress
};

// Export API

module.exports = {
  "default": fetchListOfRooms,
  // Export private API for tests
  API
};

// IMPLEMENTATION DETAILS
// To support easier testing, all functions should be "pure functions"

// Public

function fetchListOfRooms({ exchangeWebService, auth }, callback) {
  const exchangeService = API._createExchangeService({ exchangeWebService, auth });
  return API._getRoomLists(exchangeService)
    .then((roomLists) => API._getRoomsInLists({ exchangeWebService, exchangeService, auth }, roomLists))
    .then((rooms) => API._getEnhancedRooms({ exchangeWebService, exchangeService }, rooms))
    .then((rooms) => callback(null, rooms));
}

// Private

function _getEnhancedRooms({ exchangeWebService, exchangeService }, rooms) {
  return API._getFlightBoardData({ exchangeWebService, exchangeService }, rooms)
    .then((arrFlightBoardData) => API._enhanceRooms(rooms, arrFlightBoardData));
}

function _enhanceRooms(rooms, arrFlightBoardData) {
  const enhancedRooms = rooms.map((room, idx) => {
    return Object.assign({}, room, arrFlightBoardData[idx]);
  });
  enhancedRooms.sort((a, b) => a.Name.toLowerCase().localeCompare(b.Name.toLowerCase()));
  return enhancedRooms;
}

function _createExchangeService({ exchangeWebService: ews, auth }) {
  const svcExchange = new ews.ExchangeService(ews.ExchangeVersion.Exchange2016);
  svcExchange.Credentials = new ews.ExchangeCredentials(auth.exchange.username, auth.exchange.password);
  svcExchange.Url = new ews.Uri(auth.exchange.uri);
  return svcExchange;
}

function _getRoomLists(exchangeService) {
  return new Promise(function (resolve) {
    exchangeService.GetRoomLists().then((lists) => resolve(lists.items));
  });
}

function _getRoomsInLists({ exchangeWebService: ews, exchangeService, auth }, roomLists) {
  return new Promise(function (resolve) {
    const arrPrmsRooms = roomLists.map((roomList) => exchangeService.GetRooms(new ews.Mailbox(roomList.Address)));
    Promise.all(arrPrmsRooms).then((roomsOfRoomLists) => {
      // TODO Shouldn't unifying the email-addresses be optional/configurable?
      resolve(API._getAddressDataForAllRooms(roomLists, roomsOfRoomLists, auth.domain));
    });
  });
}

function _getAddressDataForAllRooms(roomLists, roomsOfRoomLists, domain) {
  return roomsOfRoomLists.reduce((result, rooms, idx) => {
    return result.concat(rooms.map((room) => API._getRoomAddress(roomLists[idx], room, domain, true)));
  }, []);
}

function _getRoomAddress(roomList, room, domain, unifyEmailAddress) {
  return {
    Roomlist: roomList.Name,
    Name: room.Name,
    RoomAlias: API._slugify(room.Name),
    Email: API._unifyEmailAddress(room.Address, domain, unifyEmailAddress)
  };
}

function _slugify(value) {
  return value.toLowerCase().replace(/\s+/g, "-");
}

function _unifyEmailAddress(email, domain, modify) {
  if (!modify) {
    return email;
  }
  // if the email addresses != your corporate domain,
  // replace email domain with domain
  return email.split('@').map((entry, idx) => idx === 1 ? domain : entry).join('@')
}

function _mapAppointment(appointment) {
  return {
    "Subject" : appointment.Subject,
    "Organizer" : appointment.Organizer.Name,
    "Start" : API._processTime(appointment.Start.momentDate),
    "End"   : API._processTime(appointment.End.momentDate)
  };
}

function _isRoomBusy(appointments) {
  if (!appointments.length) {
    return false;
  }
  const firstAppointment = appointments[0],
    start = API._processTime(firstAppointment.Start.momentDate),
    end = API._processTime(firstAppointment.End.momentDate),
    now = API._getNowTimestamp();
  return start < now && now < end;
}

function _getNowTimestamp() {
  // Provide wrapper for `Date.now`, to make it mockable for tests
  return Date.now();
}

function _getFlightBoardData({ exchangeWebService: ews, exchangeService }, rooms) {
  return new Promise(function (resolve) {
    Promise
      .all(API._getAppointmentsOfRooms({ exchangeWebService: ews, exchangeService }, rooms))
      .then((appointmensOfRooms) => {
        resolve(API._getDataForRooms(appointmensOfRooms));
      });
  });
}

function _getDataForRooms(appointmensOfRooms) {
  return appointmensOfRooms.map((result) => {
    const appointments = Array.isArray(result.Items) ? result.Items : undefined,
      errorMessage = Array.isArray(result.Items) ? undefined : result.response.errorMessage;
    return API._getRoomData(appointments, { errorMessage });
  });
}

function _getAppointmentsOfRooms({ exchangeWebService: ews, exchangeService }, rooms) {
  return rooms.map(function(room){
    const calendarFolderId = API._createCalendarFolderId({ exchangeWebService: ews }, room),
      view = API._createCalendarView({ exchangeWebService: ews });
    // `FindAppointments` does not seem to return a "real" Promise. So lets make one
    return new Promise((resolve, reject) => {
        exchangeService.FindAppointments(calendarFolderId, view).then(
          (result) => resolve(result),
          (error) => reject(error)
        );
      })
      // Proceed with the error, but provide the option to handle the rejection
      .catch((error) => error);
  });
}

function _createCalendarFolderId({ exchangeWebService: ews }, room) {
  return new ews.FolderId(ews.WellKnownFolderName.Calendar, new ews.Mailbox(room.Email));
}

function _createCalendarView({ exchangeWebService: ews }) {
  return new ews.CalendarView(
    ews.DateTime.Now,
    new ews.DateTime(ews.DateTime.Now.TotalMilliSeconds + ews.TimeSpan.FromHours(240).asMilliseconds()),
    6
  );
}

function _getRoomData(appointments = [], option = {}) {
  return {
    Busy: API._isRoomBusy(appointments),
    Appointments: appointments.map((appointment) => API._mapAppointment(appointment)),
    ErrorMessage: option.errorMessage
  };
}

function _processTime(appointmentTime) {
  return new Date(JSON.stringify(appointmentTime).replace(/"/g,"")).getTime();
}

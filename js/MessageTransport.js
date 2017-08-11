+(function (scope) {
  'use strict';

  var push = Array.prototype.push;

  var Transport = scope.Transport,
    TransportEvent = scope.TransportEvent,
    util = scope.util,
    proto;

  var STATUS = {
    OK: 'OK'
  };

  var TOPIC = {
    PING: '/PING',
    PONG: '/PONG',
    STATUS: '/STATUS'
  };

  function MessageTransport(options) {
    Transport.call(this, options);

    this._options = options;
    this._client = null;
    this._timer = null;
    this._sendTimer = null;
    this._buf = [];

    this._status = '';

    this._connHandler = onConnect.bind(this);
    this._messageHandler = onMessage.bind(this);
    this._sendOutHandler = sendOut.bind(this);

    init(this);
  }

  function init(self) {
    // 這個是拋送訊息用。
    // 而用自身的 window 來做資料的接收
    self._window = self._options.window || window;

    // messageTransport 拋送的通道，固定有 transport: true 來做識別
    self._window.postMessage({ 
      transport: true, 
      transportReady: true 
    }, location.origin);

    window.addEventListener('message', function checkConnect(evt) {
      var data = evt.data;

      if (evt.origin !== location.origin) return;
      if (!data.transport) return;
      if (evt.source !== self._window) {
        // 這裡一定是相同的，不同就有問題了
        console.error('message transport 接收訊息有問題');
        return; 
      }

      if (data.transportReady) {
        evt.source.postMessage({ 
          transport: true, 
          transportGo: true 
        }, location.origin);

        window.removeEventListener('message', checkConnect);
        self._connHandler();
      }
      
    });
  }

  function onConnect() {
    window.addEventListener("message", this._messageHandler, false);
    this.isOpen = true;
  }

  function onMessage(event) {
    var message = event.data;

    if (event.origin !== location.origin) return;
    if (!message.transport) return;
    
    var dest = message.destinationName
    var oldStatus = this._status;
    var subscribe = [this._options.device + TOPIC.PONG, this._options.device + TOPIC.STATUS]
     
    if (subscribe.indexOf(dest) === -1) {
      return;
    }

    switch (dest.substr(dest.lastIndexOf('/') + 1)) {

    case 'STATUS':
      this._status = message.payloadString;
      detectStatusChange(this, this._status, oldStatus);
      break;

    default:
      (this._status === STATUS.OK) && this.emit(TransportEvent.MESSAGE, message.payloadBytes);
      break;

    }
  }

  function detectStatusChange(self, newStatus, oldStatus) {
    if (newStatus === oldStatus) {
      return;
    }

    if (newStatus === STATUS.OK) {
      self.emit(TransportEvent.OPEN);
    } else {
      self.emit(TransportEvent.ERROR, new Error('board connection failed.'));
    }
  }

  function sendOut() {
    var payload = {
      transport: true,
      destinationName: this._options.device + TOPIC.PING,
      payloadBytes: new Uint8Array(this._buf)
    };
    if (this.isOpen) {
      this._window.postMessage(payload, location.origin);
    }
    clearBuf(this);
  }

  function clearBuf(self) {
    self._buf = [];
    clearImmediate(self._sendTimer);
    self._sendTimer = null;
  }

  MessageTransport.prototype = proto = Object.create(Transport.prototype, {

    constructor: {
      value: MessageTransport
    },

    isOpen: {
      get: function () {
        return this._isOpen;
      },
      set: function (val) {
        this._isOpen = val;
      }
    }

  });

  proto.send = function (payload) {
    if (this._buf.length + payload.length + this._options.device.length + TOPIC.PING.length + 4 >
      MessageTransport.MAX_PACKET_SIZE) {
      this._sendOutHandler();
    }
    push.apply(this._buf, payload);
    if (!this._sendTimer) {
      this._sendTimer = setImmediate(this._sendOutHandler);
    }
  };

  proto.close = function () {
    window.removeEventListener("message", this._messageHandler);
    delete this._window;
    delete this._options;
    this.isOpen = false;
  };

  proto.flush = function () {
    if (this._buf && this._buf.length) {
      this._sendOutHandler();
    }
  };

  scope.transport.message = MessageTransport;
}(webduino));
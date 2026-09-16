/**
 * Rumo embed loader. Drop this script tag on any page, then:
 *
 *   const api = new RumoMeetExternalAPI('meet.example.com', {
 *     roomName: roomId,
 *     parentNode: document.getElementById('meeting'),
 *     userInfo: { displayName: 'Ada' }
 *   });
 *   api.on('videoConferenceJoined', () => console.log('joined'));
 *   api.executeCommand('toggleAudio');
 *
 * See docs/EMBEDDING.md for the full command/event list. Deliberately
 * modeled after Jitsi's JitsiMeetExternalAPI so it's a drop-in swap for
 * anyone who has already integrated that.
 */
(function (global) {
  'use strict';

  function RumoMeetExternalAPI(domain, options) {
    options = options || {};
    const roomName = options.roomName || '';
    const parentNode = options.parentNode || document.body;
    const protocol = options.noSSL ? 'http' : 'https';

    const url = new URL(`${protocol}://${domain}/meeting/${encodeURIComponent(roomName)}`);
    url.searchParams.set('embed', '1');
    if (options.userInfo && options.userInfo.displayName) {
      url.searchParams.set('name', options.userInfo.displayName);
    }

    const iframe = document.createElement('iframe');
    iframe.src = url.toString();
    iframe.allow = 'camera; microphone; display-capture; autoplay; clipboard-write';
    iframe.style.width = options.width || '100%';
    iframe.style.height = options.height || '100%';
    iframe.style.border = '0';
    parentNode.appendChild(iframe);

    this._iframe = iframe;
    this._listeners = {};
    this._onMessage = this._onMessage.bind(this);
    global.addEventListener('message', this._onMessage);
  }

  RumoMeetExternalAPI.prototype._onMessage = function (event) {
    if (!event.data || event.data.source !== 'rumo') return;
    if (event.source !== this._iframe.contentWindow) return;

    const type = event.data.type;
    const payload = event.data.payload;
    const callbacks = this._listeners[type];
    if (callbacks) callbacks.forEach((cb) => cb(payload));
  };

  RumoMeetExternalAPI.prototype.on = function (event, callback) {
    (this._listeners[event] = this._listeners[event] || []).push(callback);
    return this;
  };

  RumoMeetExternalAPI.prototype.off = function (event, callback) {
    if (this._listeners[event]) {
      this._listeners[event] = this._listeners[event].filter((cb) => cb !== callback);
    }
    return this;
  };

  RumoMeetExternalAPI.prototype.executeCommand = function (command) {
    const args = Array.prototype.slice.call(arguments, 1);
    if (!this._iframe.contentWindow) return;
    this._iframe.contentWindow.postMessage({ source: 'rumo', type: 'execute', command, args }, '*');
  };

  RumoMeetExternalAPI.prototype.getIFrame = function () {
    return this._iframe;
  };

  RumoMeetExternalAPI.prototype.dispose = function () {
    global.removeEventListener('message', this._onMessage);
    if (this._iframe.parentNode) this._iframe.parentNode.removeChild(this._iframe);
  };

  global.RumoMeetExternalAPI = RumoMeetExternalAPI;
})(window);

'use strict';
/* AI IMPOSTOR: SPACE SHIP — minimal RFC 6455 WebSocket server (zero dependencies).
 *
 *   const ws = require('./ws');
 *   ws.attach(httpServer, { path: '/ws', maxPayload: 1 << 20, onConnection(conn, req) { ... } });
 *
 *   conn.on('message', (text, isBinary) => {}); conn.on('close', (code, reason) => {}); conn.on('pong', () => {});
 *   conn.send(stringOrBuffer) -> bool; conn.ping(); conn.close(code, reason); conn.terminate();
 *   conn.readyState (1 open, 2 closing, 3 closed); conn.bufferedAmount; conn.remoteAddress
 *
 * Handles: Sec-WebSocket-Accept handshake, client masking (required), text/binary frames, 7/16/64-bit lengths,
 * fragmentation (control frames may interleave), ping/pong, close handshake (echo + timeout), strict UTF-8,
 * max message size (close 1009), protocol errors (close 1002), slow consumers (send-queue limit -> terminate).
 */
const crypto = require('crypto');
const { EventEmitter } = require('events');

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const OP = { CONT: 0x0, TEXT: 0x1, BINARY: 0x2, CLOSE: 0x8, PING: 0x9, PONG: 0xa };
const CONNECTING = 0, OPEN = 1, CLOSING = 2, CLOSED = 3;
const EMPTY = Buffer.alloc(0);

let strictDecoder = null;
try { strictDecoder = new TextDecoder('utf-8', { fatal: true }); } catch (e) { strictDecoder = null; }
function decodeUtf8(buf) {
  if (strictDecoder) return strictDecoder.decode(buf); // throws on invalid UTF-8
  return buf.toString('utf8');
}

function acceptKey(key) {
  return crypto.createHash('sha1').update(key + GUID).digest('base64');
}

function frameHeader(opcode, len, fin) {
  let h;
  if (len < 126) {
    h = Buffer.allocUnsafe(2);
    h[1] = len;
  } else if (len < 65536) {
    h = Buffer.allocUnsafe(4);
    h[1] = 126;
    h.writeUInt16BE(len, 2);
  } else {
    h = Buffer.allocUnsafe(10);
    h[1] = 127;
    h.writeUInt32BE(Math.floor(len / 4294967296), 2);
    h.writeUInt32BE(len >>> 0, 6);
  }
  h[0] = (fin === false ? 0 : 0x80) | opcode;
  return h;
}

function validCloseCode(code) {
  return (code >= 1000 && code <= 1003) || (code >= 1007 && code <= 1014) || (code >= 3000 && code <= 4999);
}

class WebSocketConnection extends EventEmitter {
  constructor(socket, req, opts) {
    super();
    opts = opts || {};
    this.socket = socket;
    this.req = req;
    this.maxPayload = opts.maxPayload || 1 << 20;     // 1 MB per message
    this.maxBuffered = opts.maxBuffered || 4 << 20;   // unsent bytes allowed before the peer counts as dead
    this.closeTimeout = opts.closeTimeout || 3000;
    this.readyState = OPEN;
    this.remoteAddress = (socket.remoteAddress || '').replace(/^::ffff:/, '');
    this._buf = EMPTY;
    this._frag = null;          // { opcode, parts, len } while a fragmented message is in flight
    this._closeSent = false;
    this._closeCode = 1006;
    this._closeReason = '';
    this._closeTimer = null;

    socket.on('data', (d) => this._onData(d));
    socket.on('close', () => this._finish());
    socket.on('end', () => {
      // Peer half-closed without a close frame: finish our side too.
      if (this.readyState !== CLOSED) { try { socket.end(); } catch (e) { /* ignore */ } }
    });
    socket.on('error', (err) => {
      if (this.listenerCount('error')) this.emit('error', err);
      try { socket.destroy(); } catch (e) { /* ignore */ }
    });
  }

  get bufferedAmount() {
    return this.socket.writableLength || 0;
  }

  send(data) {
    if (this.readyState !== OPEN) return false;
    const isBuf = Buffer.isBuffer(data);
    const payload = isBuf ? data : Buffer.from(String(data), 'utf8');
    if (this.bufferedAmount > this.maxBuffered) {
      // The peer stopped reading: dropping it keeps the server's memory bounded.
      this.terminate();
      return false;
    }
    return this._write(isBuf ? OP.BINARY : OP.TEXT, payload);
  }

  ping(data) {
    if (this.readyState !== OPEN) return false;
    const p = data == null ? EMPTY : Buffer.from(String(data)).subarray(0, 125);
    return this._write(OP.PING, p);
  }

  close(code, reason) {
    if (this.readyState !== OPEN) return;
    this.readyState = CLOSING;
    this._closeCode = code || 1000;
    this._closeReason = reason || '';
    this._sendClose(code || 1000, reason || '');
    this._closeTimer = setTimeout(() => this.terminate(), this.closeTimeout);
  }

  terminate() {
    if (this.readyState === CLOSED) return;
    if (this.readyState === OPEN) this.readyState = CLOSING;
    try { this.socket.destroy(); } catch (e) { /* ignore */ }
  }

  // ---- internals ----
  _write(opcode, payload) {
    const s = this.socket;
    if (!s || s.destroyed || !s.writable) return false;
    const h = frameHeader(opcode, payload.length, true);
    try {
      if (payload.length < 16384) {
        s.write(payload.length ? Buffer.concat([h, payload], h.length + payload.length) : h);
      } else {
        s.cork();
        s.write(h);
        s.write(payload);
        s.uncork();
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  _sendClose(code, reason) {
    if (this._closeSent) return;
    this._closeSent = true;
    let p = EMPTY;
    if (code && code !== 1005) {
      const r = Buffer.from(String(reason || ''), 'utf8').subarray(0, 123);
      p = Buffer.allocUnsafe(2 + r.length);
      p.writeUInt16BE(code, 0);
      r.copy(p, 2);
    }
    this._write(OP.CLOSE, p);
  }

  // Protocol violation: send a close frame with the error code and drop the connection.
  _fail(code, reason) {
    this._buf = EMPTY;
    this._frag = null;
    if (this.readyState === CLOSED) return false;
    this._closeCode = code;
    this._closeReason = reason || '';
    if (this.readyState === OPEN) this.readyState = CLOSING;
    this._sendClose(code, reason);
    try { this.socket.end(); } catch (e) { /* ignore */ }
    clearTimeout(this._closeTimer);
    this._closeTimer = setTimeout(() => this.terminate(), 1000);
    return false;
  }

  _finish() {
    if (this.readyState === CLOSED) return;
    this.readyState = CLOSED;
    clearTimeout(this._closeTimer);
    this._buf = EMPTY;
    this._frag = null;
    this.emit('close', this._closeCode, this._closeReason);
  }

  _onData(chunk) {
    if (this.readyState === CLOSED || !chunk || !chunk.length) return;
    this._buf = this._buf.length ? Buffer.concat([this._buf, chunk]) : chunk;
    while (this._buf.length && this.readyState !== CLOSED && this._parseFrame()) { /* keep parsing */ }
  }

  // Parses one complete frame from this._buf. Returns true when a frame was consumed.
  _parseFrame() {
    const b = this._buf;
    if (b.length < 2) return false;
    const b0 = b[0], b1 = b[1];
    const fin = (b0 & 0x80) !== 0;
    const rsv = b0 & 0x70;
    const opcode = b0 & 0x0f;
    const masked = (b1 & 0x80) !== 0;
    let len = b1 & 0x7f;
    let off = 2;
    if (rsv) return this._fail(1002, 'RSV bits set');
    if (!masked) return this._fail(1002, 'Client frames must be masked');
    const isControl = (opcode & 0x08) !== 0;
    if (isControl) {
      if (opcode > OP.PONG) return this._fail(1002, 'Unknown opcode');
      if (!fin) return this._fail(1002, 'Fragmented control frame');
      if (len > 125) return this._fail(1002, 'Control frame too long');
    } else {
      if (opcode > OP.BINARY) return this._fail(1002, 'Unknown opcode');
      if (opcode === OP.CONT && !this._frag) return this._fail(1002, 'Unexpected continuation frame');
      if (opcode !== OP.CONT && this._frag) return this._fail(1002, 'Expected continuation frame');
    }
    if (len === 126) {
      if (b.length < 4) return false;
      len = b.readUInt16BE(2);
      off = 4;
    } else if (len === 127) {
      if (b.length < 10) return false;
      const hi = b.readUInt32BE(2), lo = b.readUInt32BE(6);
      if (hi >= 0x200000) return this._fail(1009, 'Message too big'); // > 2^53
      len = hi * 4294967296 + lo;
      off = 10;
    }
    if (!isControl && (this._frag ? this._frag.len : 0) + len > this.maxPayload) return this._fail(1009, 'Message too big');
    if (b.length < off + 4 + len) return false; // wait for the rest of the frame
    const m0 = b[off], m1 = b[off + 1], m2 = b[off + 2], m3 = b[off + 3];
    off += 4;
    const payload = Buffer.allocUnsafe(len);
    b.copy(payload, 0, off, off + len);
    for (let i = 0; i < len; i++) {
      const k = i & 3;
      payload[i] ^= k === 0 ? m0 : k === 1 ? m1 : k === 2 ? m2 : m3;
    }
    this._buf = b.length === off + len ? EMPTY : b.subarray(off + len);
    this._handleFrame(fin, opcode, payload);
    return true;
  }

  _handleFrame(fin, opcode, payload) {
    switch (opcode) {
      case OP.TEXT:
      case OP.BINARY:
        if (fin) this._message(opcode, payload);
        else this._frag = { opcode, parts: [payload], len: payload.length };
        return;
      case OP.CONT: {
        const f = this._frag;
        f.parts.push(payload);
        f.len += payload.length;
        if (fin) {
          this._frag = null;
          this._message(f.opcode, f.parts.length === 1 ? f.parts[0] : Buffer.concat(f.parts, f.len));
        }
        return;
      }
      case OP.PING:
        if (this.readyState === OPEN) this._write(OP.PONG, payload);
        return;
      case OP.PONG:
        this.emit('pong', payload);
        return;
      case OP.CLOSE: {
        let code = 1005, reason = '';
        if (payload.length === 1) { this._fail(1002, 'Bad close frame'); return; }
        if (payload.length >= 2) {
          code = payload.readUInt16BE(0);
          if (!validCloseCode(code)) { this._fail(1002, 'Bad close code'); return; }
          try { reason = decodeUtf8(payload.subarray(2)); } catch (e) { this._fail(1007, 'Bad close reason'); return; }
        }
        if (!this._closeSent) {
          // Peer-initiated: echo the close frame, then end the TCP connection (server closes first).
          this._closeCode = code;
          this._closeReason = reason;
          this.readyState = CLOSING;
          this._sendClose(code === 1005 ? 1000 : code, '');
        }
        this._buf = EMPTY;
        try { this.socket.end(); } catch (e) { /* ignore */ }
        clearTimeout(this._closeTimer);
        this._closeTimer = setTimeout(() => this.terminate(), 1000);
        return;
      }
      default:
        this._fail(1002, 'Unknown opcode');
    }
  }

  _message(opcode, payload) {
    if (this.readyState !== OPEN) return; // data after a close frame is discarded
    if (opcode === OP.TEXT) {
      let text;
      try { text = decodeUtf8(payload); } catch (e) { this._fail(1007, 'Invalid UTF-8'); return; }
      this.emit('message', text, false);
    } else {
      this.emit('message', payload, true);
    }
  }
}

function rejectUpgrade(socket, status, text, extraHeaders) {
  try {
    let head = 'HTTP/1.1 ' + status + ' ' + text + '\r\nConnection: close\r\nContent-Type: text/plain; charset=utf-8\r\n';
    for (const k in extraHeaders || {}) head += k + ': ' + extraHeaders[k] + '\r\n';
    socket.end(head + 'Content-Length: ' + Buffer.byteLength(text) + '\r\n\r\n' + text);
  } catch (e) { /* ignore */ }
  setTimeout(() => { try { socket.destroy(); } catch (e) { /* ignore */ } }, 500);
}

function attach(server, opts) {
  opts = opts || {};
  const wsPath = opts.path || '/ws';
  server.on('upgrade', (req, socket, head) => {
    socket.on('error', () => { /* handled by the connection, or the socket is being dropped */ });
    try {
      const url = String(req.url || '').split('?')[0];
      if (url !== wsPath) return rejectUpgrade(socket, 404, 'Not Found');
      if (req.method !== 'GET') return rejectUpgrade(socket, 405, 'Method Not Allowed');
      const upgrade = String(req.headers.upgrade || '').toLowerCase();
      const connection = String(req.headers.connection || '').toLowerCase().split(/\s*,\s*/);
      if (upgrade !== 'websocket' || connection.indexOf('upgrade') < 0) return rejectUpgrade(socket, 400, 'Bad Request');
      if (String(req.headers['sec-websocket-version'] || '') !== '13') {
        return rejectUpgrade(socket, 426, 'Upgrade Required', { 'Sec-WebSocket-Version': '13' });
      }
      const key = String(req.headers['sec-websocket-key'] || '').trim();
      if (!/^[A-Za-z0-9+/]{22}==$/.test(key)) return rejectUpgrade(socket, 400, 'Bad Request');
      if (opts.verifyClient && !opts.verifyClient(req)) return rejectUpgrade(socket, 503, 'Service Unavailable');
      socket.write(
        'HTTP/1.1 101 Switching Protocols\r\n' +
          'Upgrade: websocket\r\n' +
          'Connection: Upgrade\r\n' +
          'Sec-WebSocket-Accept: ' + acceptKey(key) + '\r\n\r\n'
      );
      socket.setNoDelay(true);
      socket.setTimeout(0);
      socket.setKeepAlive(true, 30000);
      const conn = new WebSocketConnection(socket, req, opts);
      if (opts.onConnection) opts.onConnection(conn, req);
      if (head && head.length) conn._onData(Buffer.from(head));
    } catch (e) {
      try { socket.destroy(); } catch (err) { /* ignore */ }
    }
  });
}

module.exports = { attach, acceptKey, WebSocketConnection, OP, CONNECTING, OPEN, CLOSING, CLOSED };

'use strict';

// Cloudflare Worker relay for the single-file chat room.
//
//   npx wrangler login
//   npx wrangler deploy
//
// Wrangler prints https://chat-room-relay.<subdomain>.workers.dev, which is the chat page's
// wss:// server. A plain browser visit to that address answers "Chat relay running." so the
// deployment can be checked without a WebSocket client.
//
// All rooms live in one Durable Object instance: it holds every open socket and each room's
// history in memory. History is dropped when a room empties, so a room is a conversation in
// progress, not an archive.

const HISTORY_LIMIT = 50;
const MAX_NAME = 40;
const MAX_TEXT = 2000;
const ROOM_FALLBACK = 'lobby';

function sanitizeRoom(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 32) || ROOM_FALLBACK;
}

export class ChatRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.rooms = new Map();
  }

  async fetch(request) {
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    server.accept();

    const peer = { ws: server, name: 'guest', room: null };

    server.addEventListener('message', (event) => this.onMessage(peer, event.data));
    server.addEventListener('close', () => this.leaveRoom(peer, false));
    server.addEventListener('error', () => this.leaveRoom(peer, false));

    return new Response(null, { status: 101, webSocket: client });
  }

  roomFor(name) {
    let room = this.rooms.get(name);
    if (!room) {
      room = { sockets: new Set(), history: [] };
      this.rooms.set(name, room);
    }
    return room;
  }

  names(room) {
    const out = [];
    for (const peer of room.sockets) {
      if (peer.name && !out.includes(peer.name)) out.push(peer.name);
    }
    return out;
  }

  send(peer, obj) {
    this.sendData(peer, JSON.stringify(obj));
  }

  sendData(peer, data) {
    try {
      peer.ws.send(data);
    } catch {
      this.leaveRoom(peer, true);
    }
  }

  broadcast(roomName, obj, except) {
    const room = this.rooms.get(roomName);
    if (!room) return;

    const data = JSON.stringify(obj);
    for (const peer of room.sockets) {
      if (peer === except) continue;
      this.sendData(peer, data);
    }
  }

  onMessage(peer, raw) {
    let msg;
    try {
      const text = typeof raw === 'string' ? raw : new TextDecoder().decode(raw);
      msg = JSON.parse(text);
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'join') {
      this.leaveRoom(peer, true);

      peer.name = String(msg.name || 'guest').slice(0, MAX_NAME);
      peer.room = sanitizeRoom(msg.room);

      const room = this.roomFor(peer.room);
      room.sockets.add(peer);

      this.send(peer, {
        type: 'welcome',
        room: peer.room,
        you: peer.name,
        users: this.names(room),
        history: room.history
      });

      this.broadcast(peer.room, { type: 'system', text: peer.name + ' joined #' + peer.room }, peer);
      this.broadcast(peer.room, { type: 'presence', users: this.names(room) });
      return;
    }

    if (!peer.room) return;

    if (msg.type === 'msg') {
      const text = String(msg.text || '').slice(0, MAX_TEXT);
      if (!text.trim()) return;

      const room = this.roomFor(peer.room);
      const out = {
        type: 'msg',
        id: String(msg.id || ''),
        name: peer.name,
        text: text,
        ts: Date.now()
      };

      room.history.push(out);
      if (room.history.length > HISTORY_LIMIT) room.history.shift();

      this.broadcast(peer.room, out);
      return;
    }

    if (msg.type === 'typing') {
      this.broadcast(peer.room, { type: 'typing', name: peer.name }, peer);
      return;
    }

    if (msg.type === 'ping') this.send(peer, { type: 'pong' });
  }

  leaveRoom(peer, silent) {
    const name = peer.room;
    if (!name) return;

    peer.room = null;

    const room = this.rooms.get(name);
    if (!room) return;

    room.sockets.delete(peer);

    if (!silent && room.sockets.size) {
      this.broadcast(name, { type: 'system', text: peer.name + ' left #' + name });
      this.broadcast(name, { type: 'presence', users: this.names(room) });
    }

    if (!room.sockets.size) this.rooms.delete(name);
  }
}

export default {
  async fetch(request, env) {
    const upgrade = String(request.headers.get('Upgrade') || '').toLowerCase();

    if (upgrade !== 'websocket') {
      return new Response('Chat relay running. Connect a WebSocket client.\n', {
        status: 200,
        headers: { 'content-type': 'text/plain; charset=utf-8' }
      });
    }

    const id = env.CHAT_ROOM.idFromName('rooms');
    return env.CHAT_ROOM.get(id).fetch(request);
  }
};

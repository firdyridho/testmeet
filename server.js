// server.js
// Simple WebSocket signaling server for mesh WebRTC
// Run: npm init -y && npm install ws
// Then: node server.js
const WebSocket = require("ws");
const port = process.env.PORT || 3000;
const wss = new WebSocket.Server({ port });
console.log("Signaling server running on ws://localhost:" + port);

const rooms = {}; // { roomId: { clientId: ws, ... } }

function send(ws, data) {
  try {
    ws.send(JSON.stringify(data));
  } catch (e) {}
}

wss.on("connection", (ws) => {
  ws.id = null;
  ws.room = null;

  ws.on("message", (msg) => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch (e) {
      return;
    }
    const { type, room, from, to, payload } = data;

    if (type === "join") {
      // data: {type:'join', room, id}
      ws.id = from;
      ws.room = room;
      rooms[room] = rooms[room] || {};
      // notify existing peers about new one and send peer list to new
      const existing = Object.keys(rooms[room]);
      // send list of existing peers to the joining client
      send(ws, { type: "peers", peers: existing });
      // add to room
      rooms[room][from] = ws;
      // notify others that a new peer has joined
      existing.forEach((peerId) => {
        const peerWs = rooms[room][peerId];
        send(peerWs, { type: "new-peer", id: from });
      });
      return;
    }

    if (!ws.room || !rooms[ws.room]) return;

    // forwarding signaling messages
    if (type === "offer" || type === "answer" || type === "ice") {
      // require 'to'
      if (to && rooms[ws.room][to]) {
        send(rooms[ws.room][to], { type, from, payload });
      }
      return;
    }

    if (type === "leave") {
      // client voluntarily leaves
      if (ws.room && rooms[ws.room] && ws.id) {
        delete rooms[ws.room][ws.id];
        // notify others
        Object.values(rooms[ws.room]).forEach((peerWs) => {
          send(peerWs, { type: "peer-left", id: ws.id });
        });
      }
      return;
    }
  });

  ws.on("close", () => {
    // cleanup on disconnect
    if (ws.room && ws.id && rooms[ws.room]) {
      delete rooms[ws.room][ws.id];
      Object.values(rooms[ws.room]).forEach((peerWs) => {
        send(peerWs, { type: "peer-left", id: ws.id });
      });
    }
  });
});

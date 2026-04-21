#!/usr/bin/env node
const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

const waiting = [];

function genId() {
  return Math.random().toString(36).slice(2, 9);
}

function safeSend(ws, obj) {
  try {
    ws.send(JSON.stringify(obj));
  } catch (e) {
    // ignore send errors
  }
}

wss.on("connection", (ws) => {
  ws.id = genId();
  ws.partner = null;
  console.log("client connected", ws.id);
  safeSend(ws, { type: "init", id: ws.id });

  ws.on("message", (msg) => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch (e) {
      return;
    }

    switch (data.type) {
      case "join": {
        // pair with first waiting client
        while (waiting.length > 0 && waiting[0].readyState !== WebSocket.OPEN)
          waiting.shift();
        if (waiting.length > 0) {
          const partner = waiting.shift();
          partner.partner = ws;
          ws.partner = partner;
          safeSend(partner, { type: "paired", peerId: ws.id, initiator: true });
          safeSend(ws, {
            type: "paired",
            peerId: partner.id,
            initiator: false,
          });
          console.log("paired", partner.id, ws.id);
        } else {
          waiting.push(ws);
          safeSend(ws, { type: "waiting" });
        }
        break;
      }
      case "offer":
      case "answer":
      case "ice-candidate":
        if (ws.partner && ws.partner.readyState === WebSocket.OPEN) {
          safeSend(ws.partner, Object.assign({}, data, { from: ws.id }));
        }
        break;
      case "leave":
        if (ws.partner) {
          safeSend(ws.partner, { type: "peer-left" });
          ws.partner.partner = null;
          ws.partner = null;
        } else {
          const idx = waiting.indexOf(ws);
          if (idx >= 0) waiting.splice(idx, 1);
        }
        break;
      case "report":
        console.log("report from", ws.id, data);
        safeSend(ws, { type: "report-ack" });
        break;
      default:
        console.log("unknown message type", data.type);
    }
  });

  ws.on("close", () => {
    console.log("client disconnected", ws.id);
    const idx = waiting.indexOf(ws);
    if (idx >= 0) waiting.splice(idx, 1);
    if (ws.partner && ws.partner.readyState === WebSocket.OPEN) {
      safeSend(ws.partner, { type: "peer-left" });
      ws.partner.partner = null;
    }
  });
});

console.log("Signaling server running on port", PORT);

#!/usr/bin/env node
const WebSocket = require("ws");

const PORT = process.env.PORT || 8082;
const wss = new WebSocket.Server({ port: PORT });

const waiting = [];
const clients = new Map();

function genId() {
  return Math.random().toString(36).slice(2, 9);
}

function safeSend(ws, obj) {
  try {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj));
    }
  } catch (e) {
    // ignore send errors
  }
}

wss.on("connection", (ws) => {
  ws.id = genId();
  ws.partner = null;
  ws.role = "user"; // default role
  clients.set(ws.id, ws);
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
      case "identify": {
        // Admin identifies themselves
        if (data.role === "admin") {
          ws.role = "admin";
          ws.adminName = data.name || "Admin";
          console.log("admin identified", ws.id, ws.adminName);
        }
        break;
      }
      case "list-active": {
        // Admin requests active users
        if (ws.role === "admin") {
          const activeUsers = Array.from(clients.values())
            .filter((c) => c.role !== "admin" && c.id !== ws.id)
            .map((c) => ({
              id: c.id,
              status: c.partner ? "busy" : "available",
              name: c.username || "Anonymous User",
            }));
          safeSend(ws, { type: "active-users", users: activeUsers });
        }
        break;
      }
      case "admin-call": {
        // Admin calls a specific user
        if (ws.role === "admin") {
          const target = clients.get(data.targetId);
          if (target && target.readyState === WebSocket.OPEN) {
            // If target has a partner, disconnect them first
            if (target.partner) {
              safeSend(target.partner, { type: "peer-left" });
              target.partner.partner = null;
              target.partner = null;
            }
            // Also remove from waiting list if they were there
            const idx = waiting.indexOf(target);
            if (idx >= 0) waiting.splice(idx, 1);

            target.partner = ws;
            ws.partner = target;

            // Notify both parties. Admin is the initiator.
            safeSend(target, {
              type: "paired",
              peerId: ws.id,
              initiator: false,
              adminCall: true,
              fromName: ws.adminName,
            });
            safeSend(ws, {
              type: "paired",
              peerId: target.id,
              initiator: true,
              adminCall: true,
            });

            console.log("admin calling", ws.id, "->", target.id);
          } else {
            safeSend(ws, {
              type: "call-failed",
              reason: "User not found or offline",
            });
          }
        }
        break;
      }
      case "get-stats": {
        safeSend(ws, {
          type: "stats",
          online: clients.size,
          waiting: waiting.length,
        });
        break;
      }
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
      case "set-username":
        ws.username = data.username;
        break;
      default:
        console.log("unknown message type", data.type);
    }
  });

  ws.on("close", () => {
    console.log("client disconnected", ws.id);
    clients.delete(ws.id);
    const idx = waiting.indexOf(ws);
    if (idx >= 0) waiting.splice(idx, 1);
    if (ws.partner && ws.partner.readyState === WebSocket.OPEN) {
      safeSend(ws.partner, { type: "peer-left" });
      ws.partner.partner = null;
    }
  });
});

console.log("Signaling server running on port", PORT);

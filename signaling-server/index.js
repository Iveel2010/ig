#!/usr/bin/env node
const WebSocket = require("ws");

const PORT = process.env.PORT || 8082;
const wss = new WebSocket.Server({ port: PORT });

// State management
const clients = new Map(); // id -> ws
const waitingQueue = []; // Array of ws in order they joined

function genId() {
  return Math.random().toString(36).slice(2, 9);
}

function safeSend(ws, obj) {
  try {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj));
    }
  } catch (e) {
    console.error(`[ERR] Send error to ${ws?.id}:`, e.message);
  }
}

function broadcastStats() {
  const stats = {
    type: "stats",
    online: clients.size,
    waiting: waitingQueue.length,
  };
  clients.forEach((client) => {
    safeSend(client, stats);
  });
}

function cleanupClient(ws) {
  console.log(`[CLEANUP] Client ${ws.id}`);

  // 1. Handle partner
  if (ws.partner) {
    const partner = ws.partner;
    if (clients.has(partner.id)) {
      console.log(
        `[CLEANUP] Notifying partner ${partner.id} of ${ws.id} leaving`,
      );
      safeSend(partner, { type: "peer-left", from: ws.id });
      partner.partner = null;
    }
    ws.partner = null;
  }

  // 2. Remove from waiting queue
  const qIdx = waitingQueue.indexOf(ws);
  if (qIdx !== -1) {
    console.log(`[CLEANUP] Removing ${ws.id} from queue`);
    waitingQueue.splice(qIdx, 1);
  }

  // 3. Remove from global map
  clients.delete(ws.id);

  // Broadcast updated stats after cleanup
  broadcastStats();
}

wss.on("connection", (ws) => {
  ws.id = genId();
  ws.partner = null;
  ws.role = "user";
  ws.username = "Anonymous";
  clients.set(ws.id, ws);

  console.log(`[CONN] Client ${ws.id} connected. Total: ${clients.size}`);

  // Broadcast updated stats to ALL clients immediately
  broadcastStats();
  safeSend(ws, { type: "init", id: ws.id });

  ws.on("message", (msg) => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch (e) {
      return;
    }

    switch (data.type) {
      case "set-username":
        ws.username = data.username || "Anonymous";
        console.log(`[USER] ${ws.id} is now ${ws.username}`);
        break;

      case "get-stats":
        safeSend(ws, {
          type: "stats",
          online: clients.size,
          waiting: waitingQueue.length,
        });
        break;

      case "join":
        console.log(`[JOIN] ${ws.id} (${ws.username}) requested partner`);

        // Prevent double joining or joining while busy
        if (ws.partner || waitingQueue.includes(ws)) {
          console.log(
            `[JOIN] ${ws.id} already in state: ${ws.partner ? "paired" : "queued"}`,
          );
          return;
        }

        // Clean up dead sockets from queue
        for (let i = waitingQueue.length - 1; i >= 0; i--) {
          if (waitingQueue[i].readyState !== WebSocket.OPEN) {
            const dead = waitingQueue.splice(i, 1)[0];
            clients.delete(dead.id);
            console.log(`[CLEANUP] Removed dead socket ${dead.id} from queue`);
          }
        }

        if (waitingQueue.length > 0) {
          const partner = waitingQueue.shift();

          // Pair them
          ws.partner = partner;
          partner.partner = ws;

          console.log(`[PAIR] ${ws.id} <-> ${partner.id}`);

          // Initiator logic: newcomer (ws) becomes initiator
          safeSend(ws, {
            type: "paired",
            peerId: partner.id,
            peerName: partner.username,
            initiator: true,
          });
          safeSend(partner, {
            type: "paired",
            peerId: ws.id,
            peerName: ws.username,
            initiator: false,
          });
        } else {
          waitingQueue.push(ws);
          safeSend(ws, { type: "waiting" });
          console.log(
            `[WAIT] ${ws.id} added to queue. Queue size: ${waitingQueue.length}`,
          );
          // Broadcast updated stats after joining queue
          broadcastStats();
        }
        break;

      case "leave":
        console.log(`[LEAVE] ${ws.id} requested to leave`);
        cleanupClient(ws);
        // Re-add to clients map because cleanupClient removes it, but we are still connected
        clients.set(ws.id, ws);
        break;

      case "offer":
      case "answer":
      case "ice-candidate":
        if (ws.partner && ws.partner.readyState === WebSocket.OPEN) {
          safeSend(ws.partner, { ...data, from: ws.id });
        } else {
          console.log(
            `[MSG] Dropped ${data.type} from ${ws.id} - no active partner`,
          );
        }
        break;

      case "identify":
        if (data.role === "admin") {
          ws.role = "admin";
          ws.adminName = data.name || "Admin";
          console.log(`[ADMIN] ${ws.id} identified as admin: ${ws.adminName}`);
        }
        break;

      case "admin-call":
        if (ws.role === "admin") {
          const target = clients.get(data.targetId);
          if (target) {
            console.log(`[ADMIN] ${ws.id} forcing call to ${target.id}`);
            // Force disconnect target from current partner
            if (target.partner) {
              safeSend(target.partner, { type: "peer-left", from: target.id });
              target.partner.partner = null;
            }
            // Remove target from queue
            const tIdx = waitingQueue.indexOf(target);
            if (tIdx !== -1) waitingQueue.splice(tIdx, 1);

            ws.partner = target;
            target.partner = ws;

            safeSend(ws, {
              type: "paired",
              peerId: target.id,
              peerName: target.username,
              initiator: true,
              adminCall: true,
            });
            safeSend(target, {
              type: "paired",
              peerId: ws.id,
              peerName: ws.adminName,
              initiator: false,
              adminCall: true,
              fromName: ws.adminName,
            });
          }
        }
        break;
    }
  });

  ws.on("close", () => {
    console.log(`[DISCONN] ${ws.id} disconnected`);
    cleanupClient(ws);
  });
});

console.log(`Signaling Server v3.0 (ROBUST) running on port ${PORT}`);

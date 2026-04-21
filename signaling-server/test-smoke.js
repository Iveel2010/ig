#!/usr/bin/env node
const { spawn } = require("child_process");
const WebSocket = require("ws");

function waitForServerOutput(server, pattern, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const onData = (data) => {
      const s = data.toString();
      if (s.includes(pattern)) {
        server.stdout.off("data", onData);
        resolve();
      }
    };
    server.stdout.on("data", onData);
    setTimeout(() => {
      server.stdout.off("data", onData);
      reject(new Error("timeout waiting for server"));
    }, timeoutMs);
  });
}

(async () => {
  console.log("Starting signaling server...");
  const server = spawn("node", ["index.js"], {
    cwd: __dirname,
    env: process.env,
  });

  server.stdout.on("data", (d) => process.stdout.write(`[server] ${d}`));
  server.stderr.on("data", (d) => process.stderr.write(`[server err] ${d}`));

  try {
    await waitForServerOutput(
      server,
      "Signaling server running on port",
      10000,
    );
  } catch (e) {
    console.error("Server did not start:", e);
    server.kill();
    process.exit(2);
  }

  console.log("Server started; connecting two test clients...");

  const url = "ws://localhost:8080";
  let initCount = 0;
  let pairedCount = 0;

  const ws1 = new WebSocket(url);
  const ws2 = new WebSocket(url);

  const cleanup = (code = 0) => {
    try {
      ws1.terminate();
    } catch (e) {}
    try {
      ws2.terminate();
    } catch (e) {}
    try {
      server.kill();
    } catch (e) {}
    process.exit(code);
  };

  const timeout = setTimeout(() => {
    console.error("Smoke test timed out");
    cleanup(3);
  }, 15000);

  function handleMessage(name, data) {
    console.log(`${name} <-`, data);
    if (data.type === "init") {
      initCount++;
      if (initCount === 2) {
        console.log("Both clients initialized — sending join");
        ws1.send(JSON.stringify({ type: "join" }));
        ws2.send(JSON.stringify({ type: "join" }));
      }
    } else if (data.type === "paired") {
      pairedCount++;
      if (pairedCount === 2) {
        console.log("Both clients paired — smoke test passed");
        clearTimeout(timeout);
        cleanup(0);
      }
    }
  }

  ws1.on("open", () => console.log("client1 open"));
  ws2.on("open", () => console.log("client2 open"));

  ws1.on("message", (m) => {
    try {
      const data = JSON.parse(m.toString());
      handleMessage("client1", data);
    } catch (e) {
      console.error("client1 parse error", e);
    }
  });
  ws2.on("message", (m) => {
    try {
      const data = JSON.parse(m.toString());
      handleMessage("client2", data);
    } catch (e) {
      console.error("client2 parse error", e);
    }
  });

  ws1.on("error", (e) => console.error("client1 error", e));
  ws2.on("error", (e) => console.error("client2 error", e));
})();

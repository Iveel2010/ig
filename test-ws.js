const WebSocket = require("ws");
const ws = new WebSocket("ws://localhost:8082");
ws.on("open", () => {
  console.log("Test client connected");
  ws.send(JSON.stringify({ type: "get-stats" }));
});
ws.on("message", (data) => {
  const msg = JSON.parse(data.toString());
  console.log("Received:", msg);
  if (msg.type === "stats") {
    process.exit(0);
  }
});
ws.on("error", (err) => {
  console.error("Error:", err);
  process.exit(1);
});
setTimeout(() => {
  console.log("Timeout");
  process.exit(1);
}, 5000);

#!/usr/bin/env node
const { spawn } = require("child_process");

function run(cmd, args, opts) {
  const p = spawn(cmd, args, { stdio: "inherit", shell: true, ...opts });
  p.on("exit", (code, signal) => {
    if (signal) {
      console.log(`${cmd} ${args.join(" ")} terminated with signal ${signal}`);
    } else {
      console.log(`${cmd} ${args.join(" ")} exited with code ${code}`);
    }
    process.exit(code ?? 0);
  });
  return p;
}

console.log("Starting Next dev server and signaling server...");
const next = run("npm", ["run", "dev"]);
const signal = run("npm", ["run", "start"], { cwd: "signaling-server" });

function cleanup() {
  try {
    next.kill();
  } catch (e) {}
  try {
    signal.kill();
  } catch (e) {}
  process.exit();
}
process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

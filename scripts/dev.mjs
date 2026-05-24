import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const server = spawn("npm", ["run", "server:dev"], {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"],
  shell: true,
});

const frontend = spawn("npm", ["run", "dev"], {
  cwd: join(root, "frontend"),
  stdio: ["ignore", "pipe", "pipe"],
  shell: true,
});

server.stdout.on("data", (d) => process.stdout.write(`[server] ${d}`));
server.stderr.on("data", (d) => process.stderr.write(`[server] ${d}`));
frontend.stdout.on("data", (d) => process.stdout.write(`[frontend] ${d}`));
frontend.stderr.on("data", (d) => process.stderr.write(`[frontend] ${d}`));

process.on("SIGINT", () => {
  server.kill();
  frontend.kill();
  process.exit(0);
});

console.log("Backend: http://localhost:3000");
console.log("Frontend: http://localhost:5173");
console.log("Press Ctrl+C to stop both");

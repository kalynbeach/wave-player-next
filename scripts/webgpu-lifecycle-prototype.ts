import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import page from "../src/client/visualization/webgpu-lifecycle.prototype.html";

const directory = resolve(
  Bun.env.WAVE_GPU_EVIDENCE_DIR ?? "../wave-gpu-evidence",
);
await mkdir(directory, { recursive: true });
const port = Number(Bun.env.PORT ?? 4324);
const server = Bun.serve({
  hostname: "localhost",
  port,
  development: false,
  routes: { "/": page },
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/evidence") {
      return new Response("Not found", { status: 404 });
    }
    if (request.headers.get("origin") !== `http://localhost:${port}`) {
      return new Response("Origin rejected", { status: 403 });
    }
    const body: unknown = await request.json();
    if (
      typeof body !== "object" ||
      body === null ||
      !("runId" in body) ||
      typeof body.runId !== "string" ||
      !/^[0-9a-f-]{36}$/.test(body.runId)
    )
      return new Response("Invalid run", { status: 400 });
    const name = `wave-gpu-${body.runId}.json`;
    await Bun.write(
      resolve(directory, name),
      `${JSON.stringify(body, null, 2)}\n`,
    );
    return Response.json({ saved: name });
  },
});
console.log(`Disposable GPU experiment at ${server.url}`);
console.log(`Evidence directory: ${directory}`);
process.once("SIGINT", () => void server.stop(true));
process.once("SIGTERM", () => void server.stop(true));

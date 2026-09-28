import { DurableObject } from "cloudflare:workers";

interface Env {
  SIGNALING: DurableObjectNamespace;
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export class Signaling extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);

    // /signal/<sessionId>/<offer|answer>
    if (parts.length !== 3 || parts[0] !== "signal") {
      return json({ error: "Invalid path" }, 400);
    }

    const type = parts[2];

    if (type !== "offer" && type !== "answer") {
      return json({ error: "Invalid signal type" }, 400);
    }

    if (request.method === "POST") {
      const data = await request.json();

      await this.ctx.storage.kv.put(type, data);

      return json({ ok: true });
    }

    if (request.method === "GET") {
      const data = await this.ctx.storage.kv.get(type);

      return json(data ?? null);
    }

    return json({ error: "Method not allowed" }, 405);
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json",
    },
  });
}

export default {
  async fetch(
    request: Request,
    env: Env
  ): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: cors,
      });
    }

    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);

    if (parts[0] !== "signal" || !parts[1]) {
      return json({
        service: "WebGate signaling",
        ok: true,
      });
    }

    const sessionId = parts[1];

    const id = env.SIGNALING.idFromName(sessionId);
    const stub = env.SIGNALING.get(id);

    return stub.fetch(request);
  },
};

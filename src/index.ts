import { DurableObject } from "cloudflare:workers";

interface Env {
  SIGNALING: DurableObjectNamespace<Signaling>;
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export class Signaling extends DurableObject {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);

    // GET /signal/offer
    // Agent consumes the newest offer ONCE.
    if (
      request.method === "GET" &&
      parts.length === 2 &&
      parts[0] === "signal" &&
      parts[1] === "offer"
    ) {
      const sessionId =
        await this.ctx.storage.kv.get<string>("latestOfferSession");

      if (!sessionId) {
        return json(null);
      }

      const offer =
        await this.ctx.storage.kv.get(`offer:${sessionId}`);

      // Consume it so it cannot become stale.
      await this.ctx.storage.kv.delete("latestOfferSession");
      await this.ctx.storage.kv.delete(`offer:${sessionId}`);

      return json(offer ?? null);
    }

    // POST /signal/<sessionId>/offer
    if (
      request.method === "POST" &&
      parts.length === 3 &&
      parts[0] === "signal" &&
      parts[2] === "offer"
    ) {
      const sessionId = parts[1];
      const data = await request.json();

      await this.ctx.storage.kv.put(
        `offer:${sessionId}`,
        data
      );

      await this.ctx.storage.kv.put(
        "latestOfferSession",
        sessionId
      );

      return json({ ok: true });
    }

    // GET /signal/<sessionId>/answer
    if (
      request.method === "GET" &&
      parts.length === 3 &&
      parts[0] === "signal" &&
      parts[2] === "answer"
    ) {
      const sessionId = parts[1];

      const answer =
        await this.ctx.storage.kv.get(
          `answer:${sessionId}`
        );

      return json(answer ?? null);
    }

    // POST /signal/<sessionId>/answer
    if (
      request.method === "POST" &&
      parts.length === 3 &&
      parts[0] === "signal" &&
      parts[2] === "answer"
    ) {
      const sessionId = parts[1];
      const data = await request.json();

      await this.ctx.storage.kv.put(
        `answer:${sessionId}`,
        data
      );

      return json({ ok: true });
    }

    return json(
      { error: "Invalid signal request" },
      400
    );
  }
}

function json(
  data: unknown,
  status = 200
): Response {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        ...cors,
        "Content-Type": "application/json",
      },
    }
  );
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

    const id =
      env.SIGNALING.idFromName("mailbox");

    const stub =
      env.SIGNALING.get(id);

    return stub.fetch(request);
  },
};

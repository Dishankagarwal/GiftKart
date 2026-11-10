import { handlePublicRequest, parseJsonBody } from "../_shared/public_api.ts";

Deno.test("public API validates requests, enforces CORS, and fails closed on rate limits", async () => {
  const envKeys = [
    "ALLOWED_ORIGINS",
    "RATE_LIMIT_HMAC_SECRET",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_URL",
  ];
  const originalEnv = new Map(envKeys.map((key) => [key, Deno.env.get(key)]));
  const originalFetch = globalThis.fetch;
  let allowed = true;
  let failLimiter = false;
  let rpcPayload: Record<string, unknown> | undefined;

  for (
    const [key, value] of [
      ["ALLOWED_ORIGINS", "http://localhost:5173"],
      ["RATE_LIMIT_HMAC_SECRET", "a".repeat(64)],
      ["SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key"],
      ["SUPABASE_URL", "http://127.0.0.1:54321"],
    ]
  ) {
    Deno.env.set(key, value);
  }

  globalThis.fetch = (input, init) => {
    if (failLimiter) {
      return Promise.resolve(Response.json({ code: "XX000" }, { status: 500 }));
    }
    rpcPayload = JSON.parse(String(init?.body));
    if (!String(input).endsWith("/rpc/consume_public_rate_limit")) {
      throw new Error("Unexpected RPC request");
    }
    return Promise.resolve(Response.json(allowed));
  };

  try {
    const preflight = await handlePublicRequest(
      new Request("http://edge.test", {
        method: "OPTIONS",
        headers: { origin: "http://localhost:5173" },
      }),
      { endpoint: "create-reservation", maxRequests: 10 },
      () => Promise.resolve({ ok: true }),
    );
    if (preflight.status !== 204) {
      throw new Error("Expected successful CORS preflight");
    }

    const blockedOrigin = await handlePublicRequest(
      new Request("http://edge.test", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://untrusted.example",
          "x-forwarded-for": "198.51.100.1",
        },
        body: "{}",
      }),
      { endpoint: "create-reservation", maxRequests: 10 },
      () => Promise.resolve({ ok: true }),
    );
    if (blockedOrigin.status !== 403) {
      throw new Error("Expected untrusted origin to be rejected");
    }

    const request = () =>
      new Request("http://edge.test", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:5173",
          "x-forwarded-for": "198.51.100.1",
        },
        body: JSON.stringify({ giftId: "gift-1" }),
      });

    const success = await handlePublicRequest(
      request(),
      { endpoint: "create-reservation", maxRequests: 10 },
      async (req) => await parseJsonBody(req),
    );
    if (success.status !== 200) {
      throw new Error("Expected request to pass its rate limit");
    }
    if (
      success.headers.get("access-control-allow-origin") !==
        "http://localhost:5173"
    ) {
      throw new Error("Expected allowed origin in CORS response");
    }
    if (
      rpcPayload?.p_window_seconds !== 60 || rpcPayload.p_max_requests !== 10
    ) {
      throw new Error(
        "Expected configured rate limit to be sent to the database",
      );
    }

    allowed = false;
    const throttled = await handlePublicRequest(
      request(),
      { endpoint: "create-reservation", maxRequests: 10 },
      () => Promise.resolve({ ok: true }),
    );
    if (
      throttled.status !== 429 || throttled.headers.get("retry-after") !== "60"
    ) {
      throw new Error("Expected rate-limited response with Retry-After");
    }

    failLimiter = true;
    const unavailable = await handlePublicRequest(
      request(),
      { endpoint: "create-reservation", maxRequests: 10 },
      () => Promise.resolve({ ok: true }),
    );
    if (unavailable.status !== 503) {
      throw new Error("Expected rate-limit database failures to fail closed");
    }

    let oversizedBodyRejected = false;
    try {
      await parseJsonBody(
        new Request("http://edge.test", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "x".repeat(8193),
        }),
      );
    } catch {
      oversizedBodyRejected = true;
    }
    if (!oversizedBodyRejected) {
      throw new Error("Expected oversized request body to be rejected");
    }
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of originalEnv) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
});

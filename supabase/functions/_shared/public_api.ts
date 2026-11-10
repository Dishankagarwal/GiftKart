type PublicEndpoint =
  | "create-reservation"
  | "create-group-pledge"
  | "cancel-reservation"
  | "report-payment"
  | "guest-activity";

type EndpointPolicy = {
  endpoint: PublicEndpoint;
  maxRequests: number;
};

type RpcError = {
  code?: string;
};

class RpcFailure extends Error {
  readonly code: string | undefined;

  constructor(code: string | undefined) {
    super("Database operation failed");
    this.code = code;
  }
}

class RequestFailure extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const corsHeaders = (origin: string | null): HeadersInit => {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  };
  if (origin && allowedOrigins().has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
};

function allowedOrigins(): Set<string> {
  return new Set(
    (Deno.env.get("ALLOWED_ORIGINS") ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
}

function jsonResponse(
  body: unknown,
  status: number,
  origin: string | null,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "application/json",
      ...extraHeaders,
    },
  });
}

function clientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",").at(-1)
    ?.trim();
  const ip = request.headers.get("cf-connecting-ip")?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    forwarded;
  return ip && ip.length <= 64 && !/\s|,/.test(ip) ? ip : null;
}

async function rateLimitKey(
  endpoint: PublicEndpoint,
  ip: string,
): Promise<string> {
  const secret = Deno.env.get("RATE_LIMIT_HMAC_SECRET");
  if (!secret || new TextEncoder().encode(secret).length < 32) {
    throw new Error("RATE_LIMIT_HMAC_SECRET must contain at least 32 bytes");
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${endpoint}:${ip}`),
  );
  return Array.from(
    new Uint8Array(signature),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

function backendConfig(): { url: string; serviceRoleKey: string } {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) {
    throw new Error("Supabase service configuration is missing");
  }
  return { url: url.replace(/\/+$/, ""), serviceRoleKey };
}

async function rpc<T>(
  functionName: string,
  args: Record<string, unknown>,
): Promise<T> {
  const { url, serviceRoleKey } = backendConfig();
  const response = await fetch(`${url}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    let error: RpcError = {};
    try {
      error = await response.json() as RpcError;
    } catch {
      // Do not expose a non-JSON backend response to guests.
    }
    throw new RpcFailure(error.code);
  }

  return await response.json() as T;
}

export async function callServiceRpc<T>(
  functionName: string,
  args: Record<string, unknown>,
): Promise<T> {
  return await rpc<T>(functionName, args);
}

export async function parseJsonBody(
  request: Request,
): Promise<Record<string, unknown>> {
  if (
    !request.headers.get("content-type")?.toLowerCase().startsWith(
      "application/json",
    )
  ) {
    throw new TypeError("Content-Type must be application/json");
  }
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 8192) {
    throw new TypeError("Request body is too large");
  }
  const reader = request.body?.getReader();
  if (!reader) {
    throw new TypeError("Request body is required");
  }
  const chunks: Uint8Array[] = [];
  let bodySize = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bodySize += value.byteLength;
    if (bodySize > 8192) {
      await reader.cancel();
      throw new TypeError("Request body is too large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(bodySize);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder().decode(bytes);
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Request body must be a JSON object");
  }
  return value as Record<string, unknown>;
}

export function requiredString(
  body: Record<string, unknown>,
  key: string,
): string {
  const value = body[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${key} is required`);
  }
  return value.trim();
}

export function rejectRequest(status: number, message: string): never {
  throw new RequestFailure(status, message);
}

export function optionalString(
  body: Record<string, unknown>,
  key: string,
): string | null {
  const value = body[key];
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value !== "string") {
    throw new TypeError(`${key} must be a string`);
  }
  return value.trim() || null;
}

function errorResponse(
  error: unknown,
  origin: string | null,
): Response {
  if (error instanceof RequestFailure) {
    return jsonResponse({ error: error.message }, error.status, origin);
  }
  if (error instanceof TypeError || error instanceof SyntaxError) {
    return jsonResponse({ error: error.message }, 400, origin);
  }
  if (error instanceof RpcFailure) {
    if (error.code === "22023") {
      return jsonResponse(
        { error: "Please check the submitted information." },
        400,
        origin,
      );
    }
    if (error.code === "P0002") {
      return jsonResponse({ error: "This item is unavailable." }, 404, origin);
    }
    if (error.code === "P0001" || error.code === "23505") {
      return jsonResponse(
        { error: "This action is no longer available." },
        409,
        origin,
      );
    }
  }
  console.error("Public API request failed", {
    error: error instanceof RpcFailure ? error.code : "internal",
  });
  return jsonResponse(
    { error: "The request could not be completed. Please try again." },
    503,
    origin,
  );
}

export async function handlePublicRequest(
  request: Request,
  policy: EndpointPolicy,
  handler: (request: Request) => Promise<unknown>,
): Promise<Response> {
  const origin = request.headers.get("origin");

  if (request.method === "OPTIONS") {
    if (origin && !allowedOrigins().has(origin)) {
      return jsonResponse({ error: "Origin is not allowed." }, 403, origin);
    }
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405, origin, {
      Allow: "POST, OPTIONS",
    });
  }
  if (origin && !allowedOrigins().has(origin)) {
    return jsonResponse({ error: "Origin is not allowed." }, 403, origin);
  }

  try {
    const ip = clientIp(request);
    if (!ip) {
      return jsonResponse(
        { error: "The request could not be verified." },
        503,
        origin,
      );
    }
    const keyHash = await rateLimitKey(policy.endpoint, ip);
    const allowed = await rpc<boolean>("consume_public_rate_limit", {
      p_endpoint: policy.endpoint,
      p_key_hash: keyHash,
      p_window_seconds: 60,
      p_max_requests: policy.maxRequests,
    });
    if (!allowed) {
      return jsonResponse(
        { error: "Too many requests. Please wait and try again." },
        429,
        origin,
        { "Retry-After": "60" },
      );
    }
    return jsonResponse(await handler(request), 200, origin);
  } catch (error) {
    return errorResponse(error, origin);
  }
}

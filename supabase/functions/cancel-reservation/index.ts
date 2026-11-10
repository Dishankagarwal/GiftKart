import {
  callServiceRpc,
  handlePublicRequest,
  parseJsonBody,
  rejectRequest,
  requiredString,
} from "../_shared/public_api.ts";

Deno.serve((request) =>
  handlePublicRequest(request, {
    endpoint: "cancel-reservation",
    maxRequests: 10,
  }, async (req) => {
    const token = requiredString(await parseJsonBody(req), "token");
    if (!/^[0-9a-f]{64}$/i.test(token)) {
      throw new TypeError("token is invalid");
    }
    const cancelled = await callServiceRpc<boolean>(
      "cancel_guest_reservation",
      { p_token: token },
    );
    if (!cancelled) {
      rejectRequest(409, "This reservation can no longer be cancelled.");
    }
    return { status: "cancelled" };
  })
);

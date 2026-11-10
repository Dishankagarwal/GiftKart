import {
  callServiceRpc,
  handlePublicRequest,
  optionalString,
  parseJsonBody,
  requiredString,
} from "../_shared/public_api.ts";

Deno.serve((request) =>
  handlePublicRequest(request, {
    endpoint: "create-group-pledge",
    maxRequests: 10,
  }, async (req) => {
    const body = await parseJsonBody(req);
    const giftId = requiredString(body, "giftId");
    const amount = body.amount;
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        giftId,
      )
    ) {
      throw new TypeError("giftId must be a UUID");
    }
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
      throw new TypeError("amount must be a positive number");
    }
    return await callServiceRpc("create_group_pledge", {
      p_gift_id: giftId,
      p_amount: amount,
      p_guest_name: requiredString(body, "guestName"),
      p_email: optionalString(body, "email"),
      p_phone: optionalString(body, "phone"),
    });
  })
);

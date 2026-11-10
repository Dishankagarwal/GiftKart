import {
  callServiceRpc,
  handlePublicRequest,
  optionalString,
  parseJsonBody,
  requiredString,
} from "../_shared/public_api.ts";

Deno.serve((request) =>
  handlePublicRequest(request, {
    endpoint: "create-reservation",
    maxRequests: 10,
  }, async (req) => {
    const body = await parseJsonBody(req);
    const giftId = requiredString(body, "giftId");
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        giftId,
      )
    ) {
      throw new TypeError("giftId must be a UUID");
    }
    return await callServiceRpc("create_guest_reservation", {
      p_gift_id: giftId,
      p_guest_name: requiredString(body, "guestName"),
      p_email: optionalString(body, "email"),
      p_phone: optionalString(body, "phone"),
    });
  })
);

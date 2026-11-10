import {
  callServiceRpc,
  handlePublicRequest,
  parseJsonBody,
  rejectRequest,
  requiredString,
} from "../_shared/public_api.ts";

Deno.serve((request) =>
  handlePublicRequest(
    request,
    { endpoint: "guest-activity", maxRequests: 30 },
    async (req) => {
      const token = requiredString(await parseJsonBody(req), "token");
      if (!/^[0-9a-f]{64}$/i.test(token)) {
        throw new TypeError("token is invalid");
      }
      const activity = await callServiceRpc<unknown>("get_guest_activity", {
        p_token: token,
      });
      if (activity === null) {
        rejectRequest(
          404,
          "Guest activity was not found or the link has expired.",
        );
      }
      return activity;
    },
  )
);

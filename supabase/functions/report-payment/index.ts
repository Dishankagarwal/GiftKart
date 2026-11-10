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
    { endpoint: "report-payment", maxRequests: 10 },
    async (req) => {
      const token = requiredString(await parseJsonBody(req), "token");
      if (!/^[0-9a-f]{64}$/i.test(token)) {
        throw new TypeError("token is invalid");
      }
      const reported = await callServiceRpc<boolean>("report_guest_payment", {
        p_token: token,
      });
      if (!reported) {
        rejectRequest(409, "This payment report is no longer available.");
      }
      return { status: "payment_reported" };
    },
  )
);

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { parseProviderAccount } from "../lib/provider-account";

test("reads only verified provider plan and balance fields", () => {
  assert.deepEqual(parseProviderAccount("higgsfield", { email: "private", subscription_plan_type: "ultimate", credits: 1200 }), { plan: "ultimate", credits: 1200 });
  assert.deepEqual(parseProviderAccount("kling", { ok: true, status: 200, body: { membershipTypeDescription: "NORMAL", availableRemainCredits: 0, userId: 123 } }), { plan: "NORMAL", credits: 0 });
  assert.deepEqual(parseProviderAccount("topview", { code: "200", result: { uid: "private", remainCredit: 5 } }), { plan: null, credits: 5 });
  assert.deepEqual(parseProviderAccount("kling", { ok: false, body: { availableRemainCredits: 10 } }), { plan: null, credits: null });
});

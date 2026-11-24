export type ProviderAccount = { plan: string | null; credits: number | null };

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function parseProviderAccount(provider: "higgsfield" | "kling" | "topview", value: unknown): ProviderAccount {
  const root = object(value);
  const data = provider === "kling" ? (root.ok === true && root.status === 200 ? object(root.body) : {})
    : provider === "topview" ? (String(root.code) === "200" || String(root.code) === "0" ? object(root.result) : {}) : root;
  const plan = provider === "higgsfield" ? data.subscription_plan_type : provider === "kling" ? data.membershipTypeDescription : null;
  const credits = provider === "higgsfield" ? data.credits : provider === "kling" ? data.availableRemainCredits : data.remainCredit;
  return {
    plan: typeof plan === "string" && plan.length <= 120 ? plan : null,
    credits: typeof credits === "number" && Number.isFinite(credits) && credits >= 0 ? credits : null,
  };
}

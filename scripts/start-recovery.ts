import { loadEnvConfig } from "@next/env";
import { providerCache } from "../lib/provider-cache";
import { recoverPendingRuns } from "../lib/run-recovery";

loadEnvConfig(process.cwd(), process.argv[2] === "dev");
process.env.PORT ||= "5050";

async function recover() {
  await recoverPendingRuns().catch(() => {});
  setTimeout(() => void recover(), 30_000).unref();
}

async function refreshProviders() {
  await providerCache.refresh().catch(() => {});
  setTimeout(() => void refreshProviders(), 60_000).unref();
}

if (process.env.DATABASE_URL) {
  void recover();
  void refreshProviders();
}

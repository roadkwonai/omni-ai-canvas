import { database } from "./db";
import {
  allowsPaidImageProvider,
  defaultWorkspaceSettings,
  paidImageProviders,
  parseWorkspaceSettings,
  type WorkspaceSettings,
} from "./workspace-settings";
import type { Provider } from "./types";

function fromRow(row: Record<string, unknown>): WorkspaceSettings {
  const result = parseWorkspaceSettings({
    version: row.version,
    defaults: row.defaults,
    workspace: row.workspace,
    paidImageProviders: row.paid_image_providers,
  });
  if (!result) throw new Error("저장된 작업실 설정의 형식을 확인해 주세요.");
  return result;
}

export async function getWorkspaceSettings(): Promise<WorkspaceSettings> {
  const sql = database();
  const rows = await sql`SELECT version, defaults, workspace, paid_image_providers
    FROM drama_canvas.workspace_settings WHERE singleton = true`;
  return rows[0] ? fromRow(rows[0]) : structuredClone(defaultWorkspaceSettings);
}

export async function saveWorkspaceSettings(settings: WorkspaceSettings): Promise<WorkspaceSettings | null> {
  const sql = database();
  const defaults = JSON.stringify(settings.defaults);
  const workspace = JSON.stringify(settings.workspace);
  const paid = JSON.stringify(settings.paidImageProviders);
  const rows = settings.version === 0
    ? await sql`INSERT INTO drama_canvas.workspace_settings (singleton, version, defaults, workspace, paid_image_providers)
        VALUES (true, 1, ${defaults}::jsonb, ${workspace}::jsonb, ${paid}::jsonb)
        ON CONFLICT (singleton) DO NOTHING
        RETURNING version, defaults, workspace, paid_image_providers`
    : await sql`UPDATE drama_canvas.workspace_settings SET
        version = version + 1, defaults = ${defaults}::jsonb,
        workspace = ${workspace}::jsonb, paid_image_providers = ${paid}::jsonb,
        updated_at = now()
        WHERE singleton = true AND version = ${settings.version}
        RETURNING version, defaults, workspace, paid_image_providers`;
  return rows[0] ? fromRow(rows[0]) : null;
}

export class PaidImageAccessError extends Error {
  constructor() {
    super("따로 결제하는 이미지 API 사용을 작업실 설정에서 먼저 허용해 주세요.");
  }
}

export async function requirePaidImageAccess(provider: Provider): Promise<void> {
  if (!paidImageProviders.some((item) => item === provider)) return;
  const settings = await getWorkspaceSettings();
  if (!allowsPaidImageProvider(provider, settings.paidImageProviders))
    throw new PaidImageAccessError();
}

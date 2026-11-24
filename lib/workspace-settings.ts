import { z } from "zod";
import { parseAgentDefaults, type AgentDefaults } from "./agent-preferences";
import {
  defaultWorkspacePreferences,
  type WorkspacePreferences,
} from "./workspace-preferences";
import type { Provider } from "./types";

export const paidImageProviders = ["openai-image", "gemini-image", "seedream"] as const;
export type PaidImageProvider = (typeof paidImageProviders)[number];
export type WorkspaceSettings = {
  version: number;
  defaults: AgentDefaults;
  workspace: WorkspacePreferences;
  paidImageProviders: PaidImageProvider[];
};

export const defaultWorkspaceSettings: WorkspaceSettings = {
  version: 0,
  defaults: { image: { provider: "codex", model: "" } },
  workspace: { ...defaultWorkspacePreferences },
  paidImageProviders: [],
};

export function allowsPaidImageProvider(
  provider: Provider,
  allowed: readonly PaidImageProvider[],
): boolean {
  return !paidImageProviders.some((item) => item === provider) ||
    allowed.some((item) => item === provider);
}

const agentDefaultSchema = z.object({
  provider: z.enum([
    "codex", "claude", "agy", "higgsfield", "topview", "kling",
    "openai-image", "gemini-image", "seedream", "road-music",
  ]),
  model: z.string().max(128).refine((value) => !/[\u0000-\u001f\u007f]/.test(value)),
  effort: z.enum(["low", "medium", "high", "xhigh", "max", "ultra"]).optional(),
}).strict();

const settingsSchema = z.object({
  version: z.number().int().min(0).max(2_147_483_646),
  defaults: z.object({
    plan: agentDefaultSchema.optional(),
    text: agentDefaultSchema.optional(),
    image: agentDefaultSchema.optional(),
    video: agentDefaultSchema.optional(),
    audio: agentDefaultSchema.optional(),
  }).strict(),
  workspace: z.object({
    sidebarOpen: z.boolean(),
    sidebarTab: z.enum(["kit", "canvas", "assets"]),
    startPanel: z.enum(["workspace", "agent"]),
    panelWidth: z.enum(["standard", "wide"]),
  }).strict(),
  paidImageProviders: z.array(z.enum(paidImageProviders)).max(paidImageProviders.length)
    .refine((items) => new Set(items).size === items.length),
}).strict();

export function parseWorkspaceSettings(value: unknown): WorkspaceSettings | null {
  const parsed = settingsSchema.safeParse(value);
  if (!parsed.success) return null;
  const { version, workspace, paidImageProviders: allowed } = parsed.data;
  const defaults = parseAgentDefaults(parsed.data.defaults);
  if (!defaults.image || !allowsPaidImageProvider(defaults.image.provider, allowed))
    defaults.image = { provider: "codex", model: "" };
  if (defaults.image.provider === "codex")
    defaults.image = { provider: "codex", model: "" };
  return { version, defaults, workspace, paidImageProviders: allowed };
}

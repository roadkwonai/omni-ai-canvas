export type WorkspacePreferences = {
  sidebarOpen: boolean;
  sidebarTab: "kit" | "canvas" | "assets";
  startPanel: "workspace" | "agent";
  panelWidth: "standard" | "wide";
};

export const workspacePreferencesKey = "scene-room-workspace-v1";
export const defaultWorkspacePreferences: WorkspacePreferences = {
  sidebarOpen: true,
  sidebarTab: "kit",
  startPanel: "workspace",
  panelWidth: "standard",
};

export function parseWorkspacePreferences(value: unknown): WorkspacePreferences {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return defaultWorkspacePreferences;
  const { sidebarOpen, sidebarTab, startPanel, panelWidth } = value as Record<string, unknown>;
  return {
    sidebarOpen: typeof sidebarOpen === "boolean" ? sidebarOpen : true,
    sidebarTab: sidebarTab === "canvas" || sidebarTab === "assets" ? sidebarTab : "kit",
    startPanel: startPanel === "agent" ? "agent" : "workspace",
    panelWidth: panelWidth === "wide" ? "wide" : "standard",
  };
}

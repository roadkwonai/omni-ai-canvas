import { validateTimeline } from "../lib/timeline-spec";
import { validateStaging } from "../lib/staging";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { validateGraph } from "../lib/graph";
import { kinds, type Graph, type Project } from "../lib/types";
import { isGuidance } from "../lib/node-guidance";
import { parseMotionShort } from "../lib/motion-short-spec";
import { blenderSceneSchema } from "../lib/blender-scene-spec";

const portText = process.env.SCENE_ROOM_PORT || "5050";
if (
  !/^\d{1,5}$/.test(portText) ||
  Number(portText) < 1 ||
  Number(portText) > 65535
)
  throw new Error("SCENE_ROOM_PORT must be a valid numeric port");
const base = `http://127.0.0.1:${Number(portText)}`;
const projectId = z.string().uuid();
const nodeId = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/);
const asset = z
  .object({
    url: z.string().max(300),
    type: z.enum(["image", "video", "audio"]),
    name: z.string().min(1).max(255),
  })
  .strict();
const timelineSchema = z
  .object({
    aspect: z.enum(["16:9", "9:16", "1:1"]),
    words: z.array(z.object({ text: z.string(), startFrame: z.number().int(), endFrame: z.number().int() }).strict()).optional(),
    clips: z.array(
      z
        .object({
          nodeId: nodeId.nullable(),
          durationFrames: z.number().int(),
          inFrame: z.number().int(),
          transition: z.enum(["cut", "dissolve"]),
          transitionFrames: z.number().int(),
        })
        .strict(),
    ),
    audio: z.array(
      z
        .object({
          nodeId,
          startFrame: z.number().int(),
          inFrame: z.number().int(),
          durationFrames: z.number().int(),
          gain: z.number(),
          fadeInFrames: z.number().int(),
          fadeOutFrames: z.number().int(),
        })
        .strict(),
    ),
  })
  .strict()
  .refine(validateTimeline);
const stagingSchema = z
  .object({
    yaw: z.number(),
    pitch: z.number(),
    focal: z.number(),
    actorX: z.number(),
    actorZ: z.number(),
    propX: z.number(),
    propZ: z.number(),
    angle: z.string(),
    framing: z.string(),
    movement: z.string(),
    expression: z.string(),
    look: z.string(),
    light: z.string(),
    gaze: z.enum(["camera", "left", "right"]).optional(),
  })
  .strict()
  .refine(validateStaging);
const motionShortSchema = z.object({
  scenes: z.array(z.object({
    text: z.string(), seconds: z.number(),
    recipe: z.enum(["type", "number", "steps", "cards", "parallax", "character"]).optional(),
    detail: z.string().optional(), value: z.number().optional(), image: asset.optional(), character: asset.optional(),
  }).strict()),
  aspect: z.enum(["9:16", "16:9"]),
  background: z.string(),
  foreground: z.string(),
  layout: z.enum(["center", "left"]),
  motion: z.enum(["fade", "zoom", "rise"]),
  accent: z.string().optional(),
  easing: z.enum(["smooth", "snappy"]).optional(),
}).strict().refine((value) => parseMotionShort(value) !== null);
const node = z
  .object({
    id: nodeId,
    kind: z.enum(kinds),
    title: z.string().max(160),
    body: z.string().max(24000),
    promptKorean: z.object({ text: z.string().max(24000) }).strict().optional(),
    x: z.number().min(-100000).max(100000),
    y: z.number().min(-100000).max(100000),
    asset: asset.optional(),
    group: z.string().min(1).max(100).optional(),
    timeline: timelineSchema.optional(),
    staging: stagingSchema.optional(),
    motionShort: motionShortSchema.optional(),
    blenderScene: blenderSceneSchema.optional(),
    blenderTake: z.object({ quality: z.enum(["preview", "final"]), scene: blenderSceneSchema }).strict().optional(),
    guidance: z.object({
      recipeId: z.string().optional(),
      skillIds: z.array(z.string()).optional(),
      text: z.string().max(4000).optional(),
    }).strict().refine(isGuidance).optional(),
  })
  .strict();
const edge = z
  .object({
    source: nodeId,
    target: nodeId,
    usage: z.enum(["input", "guide"]).optional(),
    role: z
      .enum([
        "context",
        "identity",
        "location",
        "prop",
        "motion",
        "start",
        "end",
        "look",
      ])
      .optional(),
  })
  .strict();

async function api(path: string, init?: RequestInit) {
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new Error(
      "제작실 로컬 서버에 연결하지 못했습니다. Next.js 서버와 포트를 확인하세요.",
    );
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      response.status === 409
        ? "버전이 변경되었습니다. 프로젝트를 다시 읽고 변경을 검토한 뒤 재시도하세요."
        : `제작실 요청 실패 (${response.status}): ${typeof data.error === "string" ? data.error : "응답을 확인하세요."}`,
    );
  return data;
}

function result(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value) }] };
}

const server = new McpServer({ name: "scene-room", version: "1.0.0" });
server.registerTool(
  "list_projects",
  {
    description: "로컬 제작실의 프로젝트 목록과 버전을 읽습니다.",
    inputSchema: {},
  },
  async () => result(await api("/api/projects")),
);
server.registerTool(
  "get_project",
  {
    description: "프로젝트의 노드와 연결, 최신 버전을 읽습니다.",
    inputSchema: { projectId },
  },
  async ({ projectId: id }) => result(await api(`/api/projects/${id}`)),
);
server.registerTool(
  "apply_graph",
  {
    description:
      "기존 그래프를 보존하면서 새 노드와 연결을 추가합니다. 키프레임·영상·음향 등의 영문 생성 프롬프트를 작성할 때 body에 영문을, promptKorean.text에 뜻이 일치하는 한국어를 함께 기록하세요. 먼저 프로젝트를 읽어 버전을 확인하세요. ID 중복, 순환 연결 또는 버전 충돌은 거부됩니다. 생성 작업은 실행하지 않습니다.",
    inputSchema: {
      projectId,
      version: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
      title: z.string().trim().min(1).max(120).optional(),
      graph: z
        .object({
          nodes: z.array(node).max(120),
          edges: z.array(edge).max(500),
        })
        .strict(),
    },
  },
  async ({ projectId: id, version, title, graph }) => {
    const data = await api(`/api/projects/${id}`);
    const current = data.project as Project | undefined;
    if (
      !current ||
      !validateGraph(current.graph) ||
      !Number.isSafeInteger(current.version)
    )
      throw new Error("기존 프로젝트 응답을 확인할 수 없습니다.");
    if (current.version !== version)
      throw new Error(
        "버전이 변경되었습니다. 프로젝트를 다시 읽고 변경을 검토한 뒤 재시도하세요.",
      );
    const combined: Graph = {
      nodes: [...current.graph.nodes, ...graph.nodes],
      edges: [...current.graph.edges, ...graph.edges],
    };
    if (!validateGraph(combined))
      throw new Error(
        "노드 ID, 자산 유형 또는 연결을 확인하세요. 중복과 순환 연결은 허용되지 않습니다.",
      );
    return result(
      await api(`/api/projects/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Origin: base },
        body: JSON.stringify({
          title: title ?? current.title,
          version,
          graph: combined,
        }),
      }),
    );
  },
);

server.connect(new StdioServerTransport()).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

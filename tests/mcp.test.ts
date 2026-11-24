import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const id = "a2a4d935-b41a-4407-bec3-f3ba6e8a4e11";
const startingNode = {
  id: "existing",
  kind: "brief",
  title: "원본",
  body: "보존",
  x: 0,
  y: 0,
};
const newNode = {
  id: "scene",
  kind: "keyframe",
  title: "장면",
  body: "낡은 극장",
  x: 300,
  y: 0,
  asset: { url: "/sample/frame.webp", type: "image", name: "장면" },
};

test("stdio MCP 목록과 그래프 병합 및 CAS 충돌을 처리한다", async () => {
  let project = {
    id,
    title: "드라마",
    graph: {
      nodes: [startingNode],
      edges: [] as { source: string; target: string }[],
    },
    version: 1,
  };
  let forceConflict = false;
  const http = createServer(async (request, response) => {
    response.setHeader("Content-Type", "application/json");
    if (request.url === "/api/projects" && request.method === "GET")
      return response.end(JSON.stringify({ projects: [project] }));
    if (request.url === `/api/projects/${id}` && request.method === "GET")
      return response.end(JSON.stringify({ project }));
    if (request.url === `/api/projects/${id}` && request.method === "PUT") {
      if (request.headers.origin !== "http://" + request.headers.host) {
        response.statusCode = 403;
        return response.end(JSON.stringify({ error: "origin" }));
      }
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const data = JSON.parse(Buffer.concat(chunks).toString());
      if (forceConflict || data.version !== project.version) {
        response.statusCode = 409;
        return response.end(JSON.stringify({ error: "conflict" }));
      }
      project = { ...project, ...data, version: project.version + 1 };
      return response.end(JSON.stringify({ project }));
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error: "not found" }));
  });
  http.listen(0, "127.0.0.1");
  await once(http, "listening");
  const address = http.address();
  assert.ok(address && typeof address !== "string");
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", "tsx", "scripts/canvas-mcp.ts"],
    env: {
      ...(process.env as Record<string, string>),
      SCENE_ROOM_PORT: String(address.port),
    },
    stderr: "pipe",
  });
  const client = new Client({ name: "test", version: "1.0" });
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map((tool) => tool.name).sort(), [
      "apply_graph",
      "get_project",
      "list_projects",
    ]);
    const list = await client.callTool({
      name: "list_projects",
      arguments: {},
    });
    assert.equal(list.isError, undefined);
    const read = await client.callTool({
      name: "get_project",
      arguments: { projectId: id },
    });
    assert.equal(read.isError, undefined);
    const applied = await client.callTool({
      name: "apply_graph",
      arguments: {
        projectId: id,
        version: 1,
        graph: {
          nodes: [newNode],
          edges: [{ source: "existing", target: "scene" }],
        },
      },
    });
    assert.equal(applied.isError, undefined);
    assert.equal(project.graph.nodes.length, 2);
    assert.equal(project.graph.nodes[0].body, "보존");
    assert.equal(project.graph.edges.length, 1);
    const duplicate = await client.callTool({
      name: "apply_graph",
      arguments: {
        projectId: id,
        version: 2,
        graph: { nodes: [newNode], edges: [] },
      },
    });
    assert.equal(duplicate.isError, true);
    const cycle = await client.callTool({
      name: "apply_graph",
      arguments: {
        projectId: id,
        version: 2,
        graph: { nodes: [], edges: [{ source: "scene", target: "existing" }] },
      },
    });
    assert.equal(cycle.isError, true);
    const externalAsset = await client.callTool({
      name: "apply_graph",
      arguments: {
        projectId: id,
        version: 2,
        graph: {
          nodes: [
            {
              ...newNode,
              id: "external",
              asset: { ...newNode.asset, url: "https://example.com/image.png" },
            },
          ],
          edges: [],
        },
      },
    });
    assert.equal(externalAsset.isError, true);
    const stale = await client.callTool({
      name: "apply_graph",
      arguments: { projectId: id, version: 1, graph: { nodes: [], edges: [] } },
    });
    assert.equal(stale.isError, true);
    const references = await client.callTool({
      name: "apply_graph",
      arguments: {
        projectId: id,
        version: 2,
        graph: {
          nodes: [
            { ...newNode, id: "ref", kind: "referenceImage" },
            { ...newNode, id: "shot", kind: "shot" },
          ],
          edges: [
            { source: "ref", target: "shot", usage: "guide", role: "start" },
          ],
        },
      },
    });
    assert.equal(references.isError, undefined);
    assert.deepEqual(project.graph.edges[1], {
      source: "ref",
      target: "shot",
      usage: "guide",
      role: "start",
    });
    const invalidRole = await client.callTool({
      name: "apply_graph",
      arguments: {
        projectId: id,
        version: 3,
        graph: {
          nodes: [],
          edges: [{ source: "ref", target: "existing", role: "motion" }],
        },
      },
    });
    assert.equal(invalidRole.isError, true);
    forceConflict = true;
    const race = await client.callTool({
      name: "apply_graph",
      arguments: { projectId: id, version: 3, graph: { nodes: [], edges: [] } },
    });
    assert.equal(race.isError, true);
    assert.equal(project.version, 3);
    forceConflict = false;
    const motionShort = {
      scenes: [{ text: "한글 문구", seconds: 2 }], aspect: "9:16",
      background: "#171717", foreground: "#ffffff", layout: "center", motion: "fade",
    };
    const motion = await client.callTool({
      name: "apply_graph",
      arguments: { projectId: id, version: 3, graph: {
        nodes: [{ id: "motion", kind: "video", title: "모션", body: "", x: 0, y: 0, motionShort }], edges: [],
      } },
    });
    assert.equal(motion.isError, undefined);
    assert.deepEqual((project.graph.nodes.at(-1) as unknown as { motionShort: unknown }).motionShort, motionShort);
  } finally {
    await client.close();
    http.close();
  }
});

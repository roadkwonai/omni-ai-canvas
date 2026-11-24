// 사용 가이드 도식을 다시 만든다. node docs/diagrams/guide/build.mjs [이름…]
// 원본은 이 폴더의 Archify JSON이다. 넓은 화면은 Archify가 잡은 배치에 브랜드 색과 글자 크기를 입히고,
// 좁은 화면(320px)은 같은 원본의 노드와 연결을 위에서 아래로 다시 놓는다.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, "../../..");
const archify = path.join(root, ".agents/skills/archify"), output = path.join(root, "public/guide");
const [PAPER, INK, MUTED, RULE, ACCENT, ACCENT_TEXT, TINT, GRAY] = ["#ffffff", "#1a1c20", "#555d6d", "#d1d3d8", "#ff6600", "#b93901", "#fff2ec", "#f3f4f5"];
const FONT = "Pretendard Variable, Pretendard, Apple SD Gothic Neo, sans-serif";
const escape = (value) => value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);
const head = (name, width, height, { title, description }) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-labelledby="${name}-title ${name}-desc" font-family="${FONT}"><title id="${name}-title">${escape(title)}</title><desc id="${name}-desc">${escape(description)}</desc><rect width="${width}" height="${height}" fill="${PAPER}"/>`;

// 종류마다 Archify가 붙이는 클래스. 강조(주황)는 그림마다 frontend 노드 한 곳에만 쓴다.
const style = `<style>
.c-mask{fill:${PAPER}} .c-frontend{fill:${TINT};stroke:${ACCENT}} .c-backend{fill:${PAPER};stroke:${INK}}
.c-cloud,.c-database,.c-external,.c-messagebus{fill:${PAPER};stroke:${RULE}} .c-security{fill:${GRAY};stroke:${MUTED};stroke-dasharray:5 4}
.c-lane,.c-group,.c-phase{fill:none;stroke:${RULE};stroke-dasharray:4 5}
.a-default,.a-dashed,.a-security{stroke:${MUTED};fill:none} .a-emphasis{stroke:${INK};fill:none} .a-dashed{stroke-dasharray:5 4}
.m-default,.m-dashed,.m-security{fill:${MUTED}} .m-emphasis{fill:${INK}}
text{fill:${MUTED};paint-order:stroke;stroke:${PAPER};stroke-width:4px;stroke-linejoin:round}
.t-primary{fill:${INK};font-size:17px;font-weight:700} .t-muted{font-size:13.5px} [data-node-id] text{stroke:none}
.t-edge,.t-edge-emphasis{fill:${INK}}
</style>`;

function wide(name, source, spec, html) {
  const svgs = [...html.matchAll(/<svg[^>]*viewBox="0 0 ([\d.]+) ([\d.]+)"[^>]*>([\s\S]*?)<\/svg>/g)];
  const [, width, height, body] = svgs.sort((a, b) => b[0].length - a[0].length)[0];
  const clean = body
    .replace(/<title[\s\S]*?<\/title>|<desc[\s\S]*?<\/desc>|<!--[\s\S]*?-->|<pattern[\s\S]*?<\/pattern>/g, "")
    .replace(/<rect width="100%" height="100%"[^>]*\/>/g, "")
    .replace(/<g[^>]*data-semantic-sigil[\s\S]*?<\/g>/g, "")
    .replace(/ (?:data-(?!node-id)[\w-]+|tabindex|role|aria-[\w-]+|style|font-size|font-weight)(?:="[^"]*")?/g, "")
    .replace(/ id="node-[^"]*"/g, "")
    .replace(/var\(--mask\)/g, PAPER).replace(/var\(--[\w-]+\)/g, INK)
    .replace(/(id="|url\(#)(arrowhead[\w-]*)/g, `$1${name}-$2`)
    .replace(/>\d\d \/ /g, ">")
    .replace(/\n\s*/g, "\n").replace(/\n+/g, "\n");
  // Archify는 남는 폭을 비워 둔다. 노드와 선이 있는 곳까지만 남긴다.
  const boxes = [...clean.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"[^>]*class="([^"]*)"/g)].map(([, x, y, w, h, kind]) => ({ x: +x, y: +y, w: +w, h: +h, lane: kind.includes("c-lane") }));
  const points = [...body.matchAll(/data-composition-points="([^"]*)"/g)].flatMap(([, list]) => list.split(";").map((point) => point.split(",").map(Number)));
  const labels = [...clean.matchAll(/<text[^>]* x="([\d.]+)" y="([\d.]+)"[^>]*text-anchor="middle"[^>]*>([^<]*)</g)].map(([, x, y, value]) => [+x + value.length * 7, +y]);
  const right = Math.ceil(Math.max(...boxes.filter(({ lane }) => !lane).map(({ x, w }) => x + w), ...points.map(([x]) => x), ...labels.map(([x]) => x)) + 24);
  const left = Math.floor(Math.max(0, Math.min(...boxes.map(({ x }) => x)) - 24));
  const top = Math.floor(Math.max(0, Math.min(...boxes.map(({ y }) => y), ...points.map(([, y]) => y)) - 24));
  const bottom = Math.ceil(Math.min(height, Math.max(...boxes.map(({ y, h }) => y + h), ...points.map(([, y]) => y)) + 24));
  const [W, H] = [Math.min(width, right) - left, bottom - top];
  if (W > 780) throw new Error(`${name}: 폭 ${W}. 본문 폭에서 글자가 작아진다. 열을 줄인다.`);
  const fitted = clean.replace(/(<rect x="([\d.]+)"[^>]* width=")[\d.]+("[^>]*class="c-lane")/g, (all, before, x, after) => `${before}${right - 12 - x}${after}`);
  const start = /marker-end|c-start/.test(body) && spec.diagram_type === "lifecycle" ? 24 : 0;
  writeFileSync(path.join(output, `${name}.svg`), `${head(name, W + start, H, source)}${style}<g transform="translate(${start - left} ${-top})">${fitted}</g></svg>\n`);
  return [W + start, H];
}

function narrow(name, source, spec) {
  const nodes = spec.states ?? spec.nodes ?? spec.components ?? spec.participants, edges = spec.transitions ?? spec.edges ?? spec.flows ?? spec.connections ?? spec.messages;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const order = [...(spec.mainPath ?? []), ...nodes.map(({ id }) => id).filter((id) => !spec.mainPath?.includes(id))];
  const W = 320, parts = [];
  let y = 8;
  const text = (x, top, value, size, weight = 400, fill = INK) => parts.push(`<text x="${x}" y="${top}" font-size="${size}" font-weight="${weight}" fill="${fill}">${escape(value)}</text>`);
  order.forEach((id, index) => {
    const node = byId.get(id), next = order[index + 1], focus = ["active", "frontend"].includes(node.type), off = ["failure", "security"].includes(node.type);
    parts.push(`<rect x="1" y="${y}" width="${W - 2}" height="58" rx="8" fill="${focus ? TINT : off ? GRAY : PAPER}" stroke="${focus ? ACCENT : off ? MUTED : INK}" stroke-width="1.5"${off ? ' stroke-dasharray="5 4"' : ""}/>`);
    text(16, y + 25, node.label, 17, 700);
    if (node.sublabel) text(16, y + 46, node.sublabel, 14, 400, MUTED);
    y += 58;
    const out = edges.filter((edge) => edge.from === id);
    const down = out.find((edge) => edge.to === next);
    for (const edge of out.filter((item) => item !== down)) {
      y += 24;
      parts.push(`<path d="M18 ${y - 22}V${y - 5}H30" fill="none" stroke="${MUTED}" stroke-width="1.5"/>`);
      const label = `${edge.label ? `${edge.label} ` : ""}→ ${byId.get(edge.to).label}`;
      if (label.length > 24) throw new Error(`${name}: 좁은 화면 글이 길다: ${label}`);
      text(36, y, label, 14, 400, MUTED);
    }
    if (down) {
      const top = y + (out.length > 1 ? 8 : 2), end = top + 36;
      parts.push(`<path d="M160 ${top}V${end - 2}" stroke="${INK}" stroke-width="1.8"/><path d="M154 ${end - 9}L160 ${end}L166 ${end - 9}Z" fill="${INK}"/>`);
      if (down.label) text(176, top + 22, down.label, 14);
      y = end + 2;
    } else y += next ? 20 : 8;
  });
  const height = Math.ceil(y);
  writeFileSync(path.join(output, `${name}-narrow.svg`), `${head(`${name}-narrow`, W, height, source)}${parts.join("")}</svg>\n`);
  return [W, height];
}

const asked = process.argv.slice(2);
const temporary = mkdtempSync(path.join(tmpdir(), "guide-diagrams-"));
mkdirSync(output, { recursive: true });
for (const file of readdirSync(here).filter((item) => item.endsWith(".json") && (!asked.length || asked.includes(item.slice(0, -5))))) {
  const name = file.slice(0, -5), spec = JSON.parse(readFileSync(path.join(here, file), "utf8"));
  const html = path.join(temporary, `${name}.html`);
  let receipt;
  try {
    receipt = JSON.parse(execFileSync(process.execPath, ["bin/archify.mjs", "finalize", spec.diagram_type, path.join(here, file), html, "--quality", "showcase", "--json"], { cwd: archify, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
  } catch (error) {
    const text = String(error.stdout || error.message);
    try { console.error(name, JSON.parse(text).failedStage, JSON.stringify(JSON.parse(text).diagnostics.map((item) => [item.code, item.message])).slice(0, 900)); } catch { console.error(name, text.slice(0, 600)); }
    process.exitCode = 1;
    continue;
  }
  const source = { title: spec.meta.title, description: (spec.cards ?? []).filter((card) => card.title !== "코드 근거").flatMap((card) => card.items).join(" ") || spec.meta.title };
  try { console.log(name, Object.values(receipt.gates).join(" "), "넓음", wide(name, source, spec, readFileSync(html, "utf8")).join("×"), "좁음", narrow(name, source, spec).join("×")); } catch (error) { console.error(error.message); process.exitCode = 1; }
}

// 가이드 화면을 다시 찍는다. 제작실을 켠 뒤 저장소 루트에서:
// (echo "globalThis.GUIDE = { out: '$PWD', only: [] };"; cat docs/diagrams/guide/capture.mjs) | ego-browser nodejs
// 저장과 생성 요청은 화면 안에서만 응답하므로 예제가 바뀌지 않는다. 다른 프로젝트 이름과 계정 잔여량은 보내지 않는다.
// 결과: generated-images/guide/screens/*.png. 고른 것만 cwebp로 줄여 public/guide에 둔다.
const fs = await import("node:fs");
const OUT = `${globalThis.GUIDE.out}/generated-images/guide/screens`;
const ONLY = globalThis.GUIDE.only;
const PID = "55a121ed-7df3-4a4d-b88f-c7f53077a640";
const task = await taskSpace("guide capture");
const page = await task.newPage();
const wait = (ms) => page.waitForTimeout(ms);
await page.cdp("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 2, mobile: false });

await page.cdp("Page.addScriptToEvaluateOnNewDocument", { source: `(${(pid) => {
  const f = window.fetch;
  const j = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });
  window.fetch = async (u, o) => {
    const path = String(u.url || u).replace(location.origin, "").split("?")[0], m = (o && o.method) || "GET";
    if (m === "GET" && path === "/api/projects") {
      const d = await (await f(u, o)).json(), base = d.projects.find((p) => p.id === pid);
      const make = (n, title, category, tags, days) => ({ ...base, id: `00000000-0000-4000-8000-00000000010${n}`, title, category, tags, updatedAt: new Date(Date.now() - days * 864e5).toISOString(), lastOpenedAt: new Date(Date.now() - days * 864e5).toISOString() });
      return j({ ...d, projects: [base, make(1, "비 오는 서점", "숏드라마", ["세로", "초안"], 1), make(2, "새벽 시장 30초 광고", "광고", ["납품"], 3), make(3, "첫 등교", "애니메이션 숏", ["세로"], 8)] });
    }
    if (m === "GET" && path === "/api/providers") { const d = await (await f(u, o)).json(); return j({ ...d, providers: d.providers.map(({ account, ...p }) => p) }); }
    if (m === "GET") return f(u, o);
    if (m === "PATCH" && JSON.parse(o.body).action === "open") return f(u, o);
    if (m === "PUT" && /\/api\/projects\/[^/]+$/.test(path)) { const b = JSON.parse(o.body); return j({ project: { version: b.version + 1, updatedAt: new Date().toISOString(), title: b.title, graph: b.graph } }); }
    return j({ error: "촬영 중에는 보내지 않습니다." }, 503);
  };
}})(${JSON.stringify(PID)})` });
async function open() {
  await page.goto("http://127.0.0.1:5050/studio", { timeout: 60000 });
  await wait(5000);
}
const find = (text, inside = "document", selector = "button,[role=tab],summary,label,a") => page.evaluate(([text, inside, selector]) => {
  const scope = inside === "document" ? document : [...document.querySelectorAll("dialog[open]")].filter((d) => !d.classList.contains("inspector")).pop() ?? document;
  const all = [...scope.querySelectorAll(selector)].filter((e) => e.getBoundingClientRect().width);
  const name = (e) => (e.getAttribute("aria-label") || e.innerText || "").trim();
  const e = all.find((e) => name(e) === text) ?? all.find((e) => (e.innerText || "").trim() === text) ?? all.find((e) => name(e).startsWith(text));
  if (!e) return null;
  e.scrollIntoView({ block: "center" });
  const b = e.getBoundingClientRect();
  return [b.left + b.width / 2, b.top + b.height / 2];
}, [text, inside, selector]);
async function press(text, ms = 1200, inside) {
  const p = await find(text, inside);
  if (!p) throw new Error(`못 찾음: ${text}`);
  await page.mouse.click(p[0], p[1]);
  await wait(ms);
}
const tool = async (text, ms = 2400) => {
  const ok = await page.evaluate((text) => { const s = [...document.querySelectorAll("select")].find((s) => [...s.options].some((o) => o.text === "타임라인")); const o = [...s.options].find((o) => o.text === text); if (!o) return false; Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(s, o.value); s.dispatchEvent(new Event("change", { bubbles: true })); return true; }, text);
  if (!ok) throw new Error(`도구 없음: ${text}`);
  await wait(ms);
};
const node = async (title, ms = 1200) => { const p = await page.evaluate((title) => { const n = [...document.querySelectorAll(".react-flow__node")].find((n) => n.innerText.includes(title)); const r = n.getBoundingClientRect(); return [r.x + r.width / 2, r.y + 14]; }, title); await page.mouse.click(p[0], p[1]); await wait(ms); };
const pick = (text) => page.evaluate((text) => { const s = [...document.querySelectorAll("select")].find((s) => s.getBoundingClientRect().width && [...s.options].some((o) => o.text === text)); const o = [...s.options].find((o) => o.text === text); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(s, o.value); s.dispatchEvent(new Event("change", { bubbles: true })); }, text);
const fill = (label, value, id = "") => page.evaluate(([label, value, id]) => { const e = id ? document.getElementById(id) : [...document.querySelectorAll("label")].find((l) => l.getBoundingClientRect().width && l.innerText.trim().startsWith(label))?.querySelector("input,textarea"); if (!e) throw new Error("칸 없음: " + label + id); Object.getOwnPropertyDescriptor(Object.getPrototypeOf(e), "value").set.call(e, value); e.dispatchEvent(new Event("input", { bubbles: true })); }, [label, value, id]);
/** selector의 자리만 찍는다. 없으면 맨 위 대화상자 */
async function shot(name, selector = "") {
  await page.mouse.move(2, 2);
  await wait(500);
  const clip = await page.evaluate((selector) => {
    const tip = document.createElement("style"); tip.textContent = "[role=tooltip]{opacity:0!important}::-webkit-scrollbar{display:none}"; document.head.append(tip);
    const e = selector ? document.querySelector(selector) : [...document.querySelectorAll("dialog[open]")].filter((d) => !d.classList.contains("inspector") || d.matches(":modal")).pop();
    if (!e) return null;
    scrollTo(0, 0); e.scrollTop = 0;
    const b = e.getBoundingClientRect();
    return { x: b.x, y: b.y, width: b.width, height: Math.min(b.height, innerHeight - b.y), scale: 1 };
  }, selector);
  if (!clip) throw new Error(`찍을 곳 없음: ${name}`);
  fs.writeFileSync(`${OUT}/${name}.png`, Buffer.from((await page.cdp("Page.captureScreenshot", { format: "png", clip })).data, "base64"));
  console.log("찍음", name, Math.round(clip.width), Math.round(clip.height));
}

const scenes = {
  async projects() { await press("마지막 상영"); await shot("projects"); },
  async "project-settings"() { await press("마지막 상영"); await press("설정", 1200, "dialog"); await shot("project-settings"); },
  async chat() { await shot("chat", ".inspector, aside.inspector, dialog.inspector"); },
  async toolbox() { await press("자산"); await shot("toolbox", ".workspace-sidebar"); },
  async attachments() { await press("제작"); await shot("attachments", ".agent-panel"); },
  async contest() { await tool("공모전 기획"); await fill("", "https://example.com/short-film-2026", "contest-url"); await page.evaluate(() => { for (const e of document.querySelectorAll(".contest-body *")) if (e.childElementCount && /^예시 주소/.test(e.innerText.trim()) && e.innerText.length < 80) e.style.display = "none"; }); await shot("contest"); },
  async references() { await tool("제작 프리셋 · 레퍼런스 분석"); await press("레퍼런스·추천", 900, "dialog").catch(() => {}); await shot("references"); },
  async workflow() { await tool("Higgsfield 제작 워크플로우"); await shot("workflow"); },
  async motion() { await tool("모션그래픽 스튜디오"); await shot("motion"); },
  async tripo() { await tool("Tripo 3D 리깅·동작"); await shot("tripo"); },
  async blender() { await tool("Blender 3D 장면"); await shot("blender-top"); },
  async voice() { await node("01. 영사실의 밤"); await press("노드"); await press("대사 음성 만들기", 2000); await press("한 목소리", 1500, "dialog").catch(() => {}); await shot("voice"); await pick("내 음성 · 로컬 무료"); await wait(1800); await shot("local-voice"); },
  async export() { await press("내보내기"); await press("영상 내보내기", 1500); await shot("export", ".export-popover"); },
  async settings() { await press("설정"); await wait(800); await shot("settings-agent"); await press("작업 공간", 700, "dialog"); await shot("settings-workspace"); await press("계정 연결", 2500, "dialog"); await shot("settings-accounts"); await press("API 키", 1500, "dialog"); await shot("settings-keys"); },
  async portrait() { await tool("캐릭터 연출 키트", 4000); await shot("portrait", "dialog.portrait-kit"); },
  async director() { await tool("감독 도구"); await shot("director-tool"); },
  async split() { await node("영사창 너머"); await press("노드"); await press("이미지 시트 분할", 1800); await wait(1500); await shot("split", ".portrait-grid"); },
  async "audio-cue"() { await press("음향 큐", 1500); await press("노드").catch(() => {}); await shot("audio-cue", ".inspector, dialog.inspector"); },
  async timeline() { await tool("타임라인"); await shot("timeline"); },
};
for (const [name, scene] of Object.entries(scenes)) {
  if (ONLY.length && !ONLY.includes(name)) continue;
  try { await open(); await scene(); } catch (error) { console.log("실패", name, error.message); fs.writeFileSync(`${OUT}/_fail.png`, Buffer.from((await page.cdp("Page.captureScreenshot", { format: "png" })).data, "base64")); }
}

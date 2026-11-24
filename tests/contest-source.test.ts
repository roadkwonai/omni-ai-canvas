import assert from "node:assert/strict";
import { test } from "node:test";
import {
  extractContest,
  publicAddress,
  publicUrl,
  readContestSource,
} from "../lib/contest-source";

test("공개 HTTPS 및 공인 IP만 허용한다", () => {
  for (const url of [
    "http://example.com",
    "https://127.0.0.1",
    "https://[::1]/",
    "https://169.254.169.254",
    "https://user:pass@example.com",
    "https://service.local",
  ])
    assert.throws(() => publicUrl(url));
  for (const address of [
    "10.1.2.3",
    "172.16.0.1",
    "100.64.0.1",
    "127.0.0.1",
    "169.254.169.254",
    "::1",
    "::ffff:127.0.0.1",
    "fe80::1",
    "fd00::1",
    "2001:db8::1",
  ])
    assert.equal(publicAddress(address), false, address);
  assert.equal(publicAddress("8.8.8.8"), true);
  assert.equal(publicAddress("2606:4700:4700::1111"), true);
});

test("HTML 본문에서 숨김·스크립트·네비게이션을 제거하고 목록 링크를 수집한다", () => {
  const html = `<html><head><title>공모전 안내</title></head><body><nav>메뉴 비밀</nav><main><h1>공모전 안내</h1><p>영상 제작자를 위한 공모전입니다. 접수 조건과 기간 및 지원 자격은 해당 공모전의 공식 상세 페이지에서 확인해 주세요. 참여 방법과 제출 양식도 각 공모전 상세 공지에서 확인할 수 있습니다.</p><script>SECRET_SCRIPT</script><div hidden>SECRET_HIDDEN</div><div style="display:none">SECRET_STYLE</div><a href="/contest/a">공모전 A</a></main></body></html>`;
  const result = extractContest(
    html,
    new URL("https://example.org/list"),
    "text/html",
  );
  assert.equal(result.title, "공모전 안내");
  assert.match(result.text, /영상 제작자/);
  assert.doesNotMatch(result.text, /SECRET|메뉴 비밀/);
  assert.equal(result.links[0].url, "https://example.org/contest/a");
  assert.equal(
    extractContest(
      "<html><body>Loading</body></html>",
      new URL("https://example.org"),
      "text/html",
    ).kind,
    "manual",
  );
});

test("DNS 주소 고정과 매 리다이렉트 검증으로 사설 주소 요청을 막는다", async () => {
  const seen: string[] = [];
  const services = {
    resolve: async (host: string) => {
      seen.push(`dns:${host}`);
      return [{ address: "8.8.8.8", family: 4 }];
    },
    fetch: async (url: URL, address: string) => {
      seen.push(`fetch:${url.hostname}:${address}`);
      return {
        status: 302,
        location: "https://127.0.0.1/private",
        contentType: "",
        body: "",
      };
    },
  };
  await assert.rejects(
    readContestSource("https://example.org", services),
    /공개 인터넷/,
  );
  assert.deepEqual(seen, ["dns:example.org", "fetch:example.org:8.8.8.8"]);
  await assert.rejects(
    readContestSource("https://example.org", {
      ...services,
      resolve: async () => [
        { address: "8.8.8.8", family: 4 },
        { address: "10.0.0.1", family: 4 },
      ],
    }),
    /공개 인터넷/,
  );
  const manual = await readContestSource("https://example.org", {
    ...services,
    fetch: async () => ({ status: 403, contentType: "text/html", body: "" }),
  });
  assert.equal(manual.kind, "manual");
  assert.equal(manual.text, "");
});

import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";
import NodeMarkdown from "../components/NodeMarkdown";

const render = (text: string) => renderToStaticMarkup(createElement(NodeMarkdown, { text }));

test("제목과 표, 이스케이프된 구분자와 정렬을 문서로 표시한다", () => {
  const html = render("# 작품\n\n| 회차 | 사건과 결말 |\n| :--- | ---: |\n| 2화 | 문이 닫히는 \\| 순간 |");
  assert.match(html, /<h1>작품<\/h1>/);
  assert.match(html, /<table>/);
  assert.match(html, /text-align:right/);
  assert.match(html, /문이 닫히는 \| 순간/);
});

test("목록과 강조, 인용, 코드 및 줄바꿈을 보존한다", () => {
  const html = render("- **첫째**\n  - 둘째\n- 셋째\n\n> 대사\n\n```text\nhello\n```\n\n첫 줄\n둘째 줄");
  assert.match(html, /<strong>첫째<\/strong>/);
  assert.match(html, /<ul>.*둘째.*<\/ul>/);
  assert.match(html, /<blockquote>/);
  assert.match(html, /<pre><code>hello<\/code><\/pre>/);
  assert.match(html, /첫 줄<br\/>둘째 줄/);
});

test("마크다운 링크는 허용된 주소만 사용하고 HTML은 텍스트로 표시한다", () => {
  const html = render("[참고](https://example.com) [위험](javascript:alert)\n<script>alert(1)</script>");
  assert.match(html, /href="https:\/\/example.com"/);
  assert.doesNotMatch(html, /href="javascript:/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

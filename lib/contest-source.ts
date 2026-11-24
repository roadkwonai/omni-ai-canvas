import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { BlockList, isIP } from "node:net";
import { createRequire } from "node:module";
import path from "node:path";

export type ContestSource = {
  url: string;
  title: string;
  text: string;
  fetchedAt: string;
  links: { url: string; title: string }[];
  kind: "page" | "directory" | "manual";
  reason?: string;
};
type Element = {
  text: string;
  structuredText: string;
  rawAttrs: string;
  getAttribute(name: string): string | undefined;
  querySelector(selector: string): Element | null;
  querySelectorAll(selector: string): Element[];
  remove(): void;
};
const { parse } = createRequire(path.join(process.cwd(), "package.json"))(
  "next/dist/compiled/node-html-parser",
) as { parse(html: string): Element };
const deny = new BlockList();
for (const [ip, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as [string, number][])
  deny.addSubnet(ip, prefix, "ipv4");
deny.addSubnet("2001:db8::", 32, "ipv6");
deny.addSubnet("2001::", 23, "ipv6");
deny.addSubnet("2002::", 16, "ipv6");
const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");

export function publicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !deny.check(address, "ipv4");
  if (family === 6)
    return globalV6.check(address, "ipv6") && !deny.check(address, "ipv6");
  return false;
}

export function publicUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("올바른 공개 HTTPS 주소를 입력해 주세요.");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    input.length > 2048
  )
    throw new Error("올바른 공개 HTTPS 주소를 입력해 주세요.");
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    (isIP(host) && !publicAddress(host))
  )
    throw new Error("공개 인터넷 주소만 사용할 수 있습니다.");
  url.hash = "";
  return url;
}

const maxBytes = 1024 * 1024;
async function fetchPage(
  url: URL,
  address: string,
  signal: AbortSignal,
): Promise<{
  status: number;
  location?: string;
  contentType: string;
  body: string;
}> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        protocol: "https:",
        hostname: address,
        port: url.port || 443,
        servername: url.hostname.replace(/^\[|\]$/g, ""),
        path: url.pathname + url.search,
        method: "GET",
        agent: false,
        signal,
        headers: {
          host: url.host,
          accept: "text/html,text/plain;q=0.9",
          "accept-encoding": "identity",
          "user-agent": "SceneRoom/1.0 (public contest reader)",
        },
      },
      (res) => {
        const status = res.statusCode || 0;
        const location = res.headers.location;
        const contentType = String(
          res.headers["content-type"] || "",
        ).toLowerCase();
        if (status >= 300 && status < 400) {
          res.resume();
          resolve({ status, location, contentType, body: "" });
          return;
        }
        if (
          status !== 200 ||
          !/^(text\/html|text\/plain)(?:;|$)/.test(contentType) ||
          (res.headers["content-encoding"] &&
            res.headers["content-encoding"] !== "identity")
        ) {
          res.resume();
          resolve({ status, contentType, body: "" });
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes) {
            req.destroy(new Error("본문이 너무 깁니다."));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () =>
          resolve({
            status,
            contentType,
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        );
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    req.end();
  });
}

export function extractContest(
  html: string,
  url: URL,
  contentType: string,
): Pick<ContestSource, "title" | "text" | "links" | "kind" | "reason"> {
  if (contentType.startsWith("text/plain")) {
    const text = html.trim().slice(0, 18_000);
    return text.length >= 80
      ? { title: url.hostname, text, links: [], kind: "page" }
      : {
          title: url.hostname,
          text: "",
          links: [],
          kind: "manual",
          reason:
            "공개 본문이 충분하지 않습니다. 공모전 원문을 붙여넣어 주세요.",
        };
  }
  const root = parse(html);
  const title =
    root.querySelector("title")?.text.trim().slice(0, 200) || url.hostname;
  root
    .querySelectorAll(
      "script,style,noscript,nav,header,footer,aside,iframe,form,svg,template",
    )
    .forEach((node) => node.remove());
  root
    .querySelectorAll("*")
    .filter((node) => {
      const attrs = node.rawAttrs || "";
      return (
        /(?:^|\s)hidden(?:\s|=|$)/i.test(attrs) ||
        node.getAttribute("aria-hidden")?.toLowerCase() === "true" ||
        /(?:^|\s)(?:hidden|invisible)(?:\s|$)/i.test(
          node.getAttribute("class") || "",
        ) ||
        /(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(
          node.getAttribute("style") || "",
        )
      );
    })
    .forEach((node) => node.remove());
  const main =
    root.querySelector("main") ||
    root.querySelector("article") ||
    root.querySelector("body") ||
    root;
  const text = main.structuredText
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 18_000);
  const links: ContestSource["links"] = [];
  for (const node of main.querySelectorAll("a")) {
    const name = node.text.trim().replace(/\s+/g, " ").slice(0, 160);
    const href = node.getAttribute("href");
    if (
      !name ||
      !href ||
      !/(공모|대회|축제|규칙|출품|주최|원문|contest|competition|festival|rules)/i.test(
        name + " " + href,
      )
    )
      continue;
    try {
      const target = publicUrl(new URL(href, url).href).href;
      if (!links.some((link) => link.url === target) && target !== url.href)
        links.push({ url: target, title: name });
    } catch {
      /* Skip links outside the public HTTPS boundary. */
    }
    if (links.length === 50) break;
  }
  if (text.length < 80)
    return {
      title,
      text: "",
      links,
      kind: "manual",
      reason:
        "공개 본문이 비어 있거나 브라우저에서 표시되는 페이지입니다. 공모전 원문을 붙여넣어 주세요.",
    };
  const externalLinks = links.filter(
    (link) => new URL(link.url).hostname !== url.hostname,
  );
  return {
    title,
    text,
    links,
    kind:
      externalLinks.length >= 5 && text.length < 4000 ? "directory" : "page",
  };
}

type ReaderServices = {
  resolve: (host: string) => Promise<{ address: string; family: number }[]>;
  fetch: typeof fetchPage;
};

export async function readContestSource(
  input: string,
  services: ReaderServices = {
    resolve: (host) => lookup(host, { all: true }),
    fetch: fetchPage,
  },
): Promise<ContestSource> {
  let url = publicUrl(input);
  const signal = AbortSignal.timeout(12_000);
  const manual = (reason: string): ContestSource => ({
    url: url.href,
    title: url.hostname,
    text: "",
    fetchedAt: new Date().toISOString(),
    links: [],
    kind: "manual",
    reason,
  });
  for (let redirects = 0; redirects <= 3; redirects++) {
    if (signal.aborted)
      return manual(
        "페이지 연결 시간이 초과됐습니다. 공모전 원문을 붙여넣어 주세요.",
      );
    const host = url.hostname.replace(/^\[|\]$/g, "");
    let addresses: { address: string; family: number }[];
    try {
      addresses = await Promise.race([
        services.resolve(host),
        new Promise<never>((_, reject) =>
          signal.addEventListener("abort", () => reject(new Error("timeout")), {
            once: true,
          }),
        ),
      ]);
    } catch {
      return manual(
        "주소를 찾지 못했거나 연결 시간이 초과됐습니다. 공모전 원문을 붙여넣어 주세요.",
      );
    }
    if (
      !addresses.length ||
      addresses.some((item) => !publicAddress(item.address))
    )
      throw new Error("공개 인터넷 주소만 사용할 수 있습니다.");
    let page: Awaited<ReturnType<typeof fetchPage>>;
    try {
      page = await services.fetch(url, addresses[0].address, signal);
    } catch {
      return manual(
        "페이지 연결에 실패했거나 본문 크기·시간 제한을 초과했습니다. 공모전 원문을 붙여넣어 주세요.",
      );
    }
    if (page.status >= 300 && page.status < 400 && page.location) {
      if (redirects === 3)
        return manual(
          "페이지 이동 횟수 제한을 초과했습니다. 공모전 원문을 붙여넣어 주세요.",
        );
      url = publicUrl(new URL(page.location, url).href);
      continue;
    }
    if (page.status !== 200 || !page.body)
      return manual(
        "공개 페이지를 읽지 못했습니다. 로그인 또는 브라우저 확인이 필요할 수 있습니다. 공모전 원문을 붙여넣어 주세요.",
      );
    try {
      return {
        url: url.href,
        ...extractContest(page.body, url, page.contentType),
        fetchedAt: new Date().toISOString(),
      };
    } catch {
      return manual(
        "페이지 본문을 해석하지 못했습니다. 공모전 원문을 붙여넣어 주세요.",
      );
    }
  }
  return manual("페이지를 읽지 못했습니다. 공모전 원문을 붙여넣어 주세요.");
}

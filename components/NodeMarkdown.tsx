import { Fragment, type ReactNode } from "react";

const inlinePattern = /\\([\\`*_{}\[\]()#+\-.!|>~])|(`+)([\s\S]*?)\2|\[([^\]\n]+)\]\(([^\s)]+)(?:\s+"[^"]*")?\)|(\*\*|__)(?=\S)([\s\S]*?\S)\6|(~~)(?=\S)([\s\S]*?\S)\8|([*_])(?=\S)([^\n]*?\S)\10/g;

function safeHref(value: string): string | undefined {
  const href = value.trim();
  if (/[\\\p{Cc}]/u.test(href)) return undefined;
  if (/^(?:https?:|mailto:)/i.test(href) || /^(?:\/(?!\/)|#|\.\.?\/)/.test(href)) return href;
  return undefined;
}

function inline(text: string, depth = 0): ReactNode[] {
  if (depth >= 8) return [text];
  const parts: ReactNode[] = [];
  const pattern = new RegExp(inlinePattern.source, "g");
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index;
    if (index > last) parts.push(text.slice(last, index));
    const key = index;
    if (match[1]) parts.push(match[1]);
    else if (match[2]) parts.push(<code key={key}>{match[3].replace(/\n/g, " ")}</code>);
    else if (match[4]) {
      const href = safeHref(match[5]);
      parts.push(href
        ? <a key={key} href={href} target="_blank" rel="noopener noreferrer">{inline(match[4], depth + 1)}</a>
        : <Fragment key={key}>{match[0]}</Fragment>);
    } else if (match[6]) parts.push(<strong key={key}>{inline(match[7], depth + 1)}</strong>);
    else if (match[8]) parts.push(<del key={key}>{inline(match[9], depth + 1)}</del>);
    else if (match[10]) parts.push(<em key={key}>{inline(match[11], depth + 1)}</em>);
    last = index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function cells(line: string): string[] {
  let value = line.trim();
  if (value.startsWith("|")) value = value.slice(1);
  if (value.endsWith("|") && !value.endsWith("\\|")) value = value.slice(0, -1);
  return value.split(/(?<!\\)\|/).map((cell) => cell.trim());
}

function delimiter(line: string): boolean {
  const pieces = cells(line);
  return pieces.length > 0 && pieces.every((cell) => /^:?-{3,}:?$/.test(cell));
}

const listItem = /^(\s*)([-+*]|\d+[.)])\s+(.*)$/;
const blockStart = /^(?: {0,3}(?:#{1,6}\s+|>|(?:`{3,}|~{3,})|(?:[-+*]|\d+[.)])\s+)|\s*$)/;

function renderBlocks(lines: string[], prefix = "b", depth = 0): ReactNode[] {
  if (depth >= 16) return [<p key={prefix}>{lines.join("\n")}</p>];
  const blocks: ReactNode[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    const key = `${prefix}-${index}`;
    if (!line.trim()) { index++; continue; }

    const fence = line.match(/^ {0,3}(`{3,}|~{3,})\s*([^\s]*)[^\n]*$/);
    if (fence) {
      const code: string[] = [];
      index++;
      const end = new RegExp(`^ {0,3}${fence[1][0]}{${fence[1].length},}\\s*$`);
      while (index < lines.length && !end.test(lines[index])) code.push(lines[index++]);
      if (index < lines.length) index++;
      blocks.push(<pre key={key}><code>{code.join("\n")}</code></pre>);
      continue;
    }

    const heading = line.match(/^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      const content = inline(heading[2]);
      switch (heading[1].length) {
        case 1: blocks.push(<h1 key={key}>{content}</h1>); break;
        case 2: blocks.push(<h2 key={key}>{content}</h2>); break;
        case 3: blocks.push(<h3 key={key}>{content}</h3>); break;
        case 4: blocks.push(<h4 key={key}>{content}</h4>); break;
        case 5: blocks.push(<h5 key={key}>{content}</h5>); break;
        default: blocks.push(<h6 key={key}>{content}</h6>);
      }
      index++;
      continue;
    }

    if (/^ {0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
      blocks.push(<hr key={key} />);
      index++;
      continue;
    }

    if (index + 1 < lines.length && (line.includes("|") || lines[index + 1].includes("|")) &&
        delimiter(lines[index + 1]) && cells(line).length === cells(lines[index + 1]).length) {
      const headers = cells(line);
      const alignment = cells(lines[index + 1]).map((item) =>
        item.startsWith(":") && item.endsWith(":") ? "center" : item.endsWith(":") ? "right" : "left");
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && lines[index].trim() && lines[index].includes("|") &&
             !blockStart.test(lines[index])) rows.push(cells(lines[index++]));
      blocks.push(<div className="node-markdown-table" key={key}><table>
        <thead><tr>{headers.map((header, i) => <th key={i} style={{ textAlign: alignment[i] }}>{inline(header)}</th>)}</tr></thead>
        {rows.length > 0 && <tbody>{rows.map((row, i) => <tr key={i}>{headers.map((_, col) =>
          <td key={col} style={{ textAlign: alignment[col] }}>{inline(row[col] ?? "")}</td>)}</tr>)}</tbody>}
      </table></div>);
      continue;
    }

    if (/^ {0,3}>/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^ {0,3}>/.test(lines[index])) {
        quote.push(lines[index++].replace(/^ {0,3}> ?/, ""));
      }
      blocks.push(<blockquote key={key}>{renderBlocks(quote, key, depth + 1)}</blockquote>);
      continue;
    }

    const firstItem = line.match(listItem);
    if (firstItem && firstItem[1].length <= 3) {
      const ordered = /^\d/.test(firstItem[2]);
      const entries: ReactNode[] = [];
      const indent = firstItem[1].length;
      while (index < lines.length) {
        const item = lines[index].match(listItem);
        if (!item || item[1].length !== indent || /^\d/.test(item[2]) !== ordered) break;
        const body = [item[3]];
        index++;
        while (index < lines.length) {
          const continuation = lines[index];
          if (!continuation.trim()) {
            if (index + 1 < lines.length && /^\s+\S/.test(lines[index + 1])) { body.push(""); index++; continue; }
            break;
          }
          const whitespace = continuation.match(/^\s*/)?.[0].length ?? 0;
          if (whitespace <= indent) break;
          body.push(continuation.slice(Math.min(indent + 2, whitespace)));
          index++;
        }
        const task = body[0].match(/^\[([ xX])\]\s+(.*)$/);
        if (task) body[0] = task[2];
        entries.push(<li key={index}>{task && <input type="checkbox" checked={task[1].toLowerCase() === "x"} disabled readOnly aria-label="작업 완료" />}{renderBlocks(body, `${key}-${index}`, depth + 1)}</li>);
      }
      blocks.push(ordered
        ? <ol key={key} start={Number.parseInt(firstItem[2], 10)}>{entries}</ol>
        : <ul key={key}>{entries}</ul>);
      continue;
    }

    if (index + 1 < lines.length && /^ {0,3}(?:=+|-+)\s*$/.test(lines[index + 1])) {
      const title = inline(line.trim());
      blocks.push(lines[index + 1].trim().startsWith("=") ? <h1 key={key}>{title}</h1> : <h2 key={key}>{title}</h2>);
      index += 2;
      continue;
    }

    const paragraph = [line];
    index++;
    while (index < lines.length && !blockStart.test(lines[index]) &&
      !(index + 1 < lines.length && delimiter(lines[index + 1]) && lines[index].includes("|"))) {
      paragraph.push(lines[index++]);
    }
    blocks.push(<p key={key}>{paragraph.map((item, i) =>
      <Fragment key={i}>{i > 0 && <br />}{inline(item)}</Fragment>)}</p>);
  }
  return blocks;
}

export default function NodeMarkdown({ text }: { text: string }) {
  return <div className="node-markdown">{renderBlocks(text.replace(/\r\n?/g, "\n").split("\n"))}</div>;
}

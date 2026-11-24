export type DramaPremise = {
  number: number;
  title: string;
  description: string;
};

/** 고정한 제작자 원본의 아이디어 부록만 분리한다. 번호가 맞지 않는 다른 버전은 표시하지 않는다. */
export function readDramaPremises(text: string): DramaPremise[] {
  const start = text.search(/^## Idea bank: 100 short-drama premises\s*$/m);
  if (start < 0) return [];
  const items: DramaPremise[] = [];
  for (const line of text.slice(start).split(/\r?\n/).slice(1)) {
    if (/^##\s/.test(line)) break;
    const match = /^(\d{1,3})\.\s+(?:★\s+)?\*\*(.+?)\*\*\s*(.+)$/.exec(line);
    if (match)
      items.push({
        number: Number(match[1]),
        title: match[2].trim(),
        description: match[3].trim(),
      });
  }
  if (items.length !== 100 || items.some((item, i) => item.number !== i + 1))
    return [];
  return items;
}

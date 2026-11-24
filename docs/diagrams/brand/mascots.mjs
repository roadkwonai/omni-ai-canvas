// 생성한 포즈 PNG를 앱에서 쓰는 webp로 바꾼다. node docs/diagrams/brand/mascots.mjs
import { readdir } from "node:fs/promises";
import sharp from "sharp";
const source = "generated-images/brand", target = "public/brand";
for (const file of (await readdir(source)).filter((name) => /^omi-\w+\.png$/.test(name))) {
  const { data, info } = await sharp(`${source}/${file}`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  // 투명 배경에 남은 옅은 잔점과 바닥 그림자 아래 얼룩을 지운다.
  for (let i = 3; i < data.length; i += 4) if (data[i] < 64) data[i] = 0;
  await sharp(data, { raw: info }).trim().resize(448, 448, { fit: "contain", background: "#0000" }).webp({ quality: 86 }).toFile(`${target}/${file.replace(".png", ".webp")}`);
}

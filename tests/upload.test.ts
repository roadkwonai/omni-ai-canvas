import assert from "node:assert/strict";
import { readFile, unlink } from "node:fs/promises";
import test from "node:test";
import { POST } from "../app/api/assets/route";
import { localAssetPath } from "../lib/media";

test("브라우저의 대문자가 포함된 multipart 경계로 WebP 파일을 업로드한다", async () => {
  const bytes = await readFile("public/sample/portrait.webp");
  const boundary = "----WebKitFormBoundaryMixedABC";
  const request = new Request("http://localhost/api/assets", {
    method: "POST",
    headers: {
      host: "localhost",
      origin: "http://localhost",
      "Content-Type": "multipart/form-data; boundary=" + boundary,
    },
    body: Buffer.concat([
      Buffer.from(
        "--" +
          boundary +
          '\r\nContent-Disposition: form-data; name="file"; filename="actor.webp"\r\nContent-Type: image/webp\r\n\r\n',
      ),
      bytes,
      Buffer.from("\r\n--" + boundary + "--\r\n"),
    ]),
  });
  const response = await POST(request);
  assert.equal(response.status, 201);
  const { asset } = await response.json();
  try {
    assert.deepEqual(await readFile(localAssetPath(asset)), bytes);
  } finally {
    await unlink(localAssetPath(asset));
  }
});

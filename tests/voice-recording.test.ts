import assert from "node:assert/strict";
import { test } from "node:test";
import { encodeVoiceWav } from "../lib/voice-recording";

test("합성 스테레오 음성을 재생 가능한 모노 PCM WAV로 혼합한다", () => {
  const bytes = encodeVoiceWav(
    [new Float32Array([1, -1, 0.5]), new Float32Array([1, -1, -0.5])],
    44100,
  );
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert.equal(Buffer.from(bytes.subarray(0, 4)).toString(), "RIFF");
  assert.equal(Buffer.from(bytes.subarray(8, 12)).toString(), "WAVE");
  assert.equal(data.getUint16(22, true), 1);
  assert.equal(data.getUint32(24, true), 44100);
  assert.equal(data.getInt16(44, true), 32767);
  assert.equal(data.getInt16(46, true), -32768);
  assert.equal(data.getInt16(48, true), 0);
  assert.throws(() =>
    encodeVoiceWav([new Float32Array(1), new Float32Array(2)], 44100),
  );
});

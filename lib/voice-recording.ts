export const VOICE_MAX_SECONDS = 60;
export const VOICE_MAX_RECORDING_BYTES = 12 * 1024 * 1024;

/** AudioBuffer의 다중 채널을 평균해 표준 16-bit PCM WAV로 변환한다. */
export function encodeVoiceWav(
  channels: Float32Array[],
  sampleRate: number,
): Uint8Array {
  if (
    !channels.length ||
    channels.length > 8 ||
    !Number.isInteger(sampleRate) ||
    sampleRate < 8000 ||
    sampleRate > 192000 ||
    channels.some((channel) => channel.length !== channels[0].length) ||
    channels[0].length < 1 ||
    channels[0].length > sampleRate * (VOICE_MAX_SECONDS + 1)
  )
    throw new Error("녹음의 길이와 음성 형식을 확인해 주세요.");
  const count = channels[0].length;
  const buffer = new ArrayBuffer(44 + count * 2);
  const view = new DataView(buffer);
  function text(offset: number, value: string) {
    for (let index = 0; index < value.length; index++)
      view.setUint8(offset + index, value.charCodeAt(index));
  }
  text(0, "RIFF");
  view.setUint32(4, buffer.byteLength - 8, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, count * 2, true);
  for (let index = 0; index < count; index++) {
    let sum = 0;
    for (const channel of channels)
      sum += Number.isFinite(channel[index]) ? channel[index] : 0;
    const sample = Math.max(-1, Math.min(1, sum / channels.length));
    view.setInt16(
      44 + index * 2,
      Math.round(sample * (sample < 0 ? 32768 : 32767)),
      true,
    );
  }
  return new Uint8Array(buffer);
}

export async function recordingToWav(blob: Blob): Promise<Blob> {
  if (!blob.size || blob.size > VOICE_MAX_RECORDING_BYTES)
    throw new Error("녹음 크기를 확인하고 다시 녹음해 주세요.");
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    const samples = Array.from(
      { length: decoded.numberOfChannels },
      (_, index) => decoded.getChannelData(index),
    );
    return new Blob([encodeVoiceWav(samples, decoded.sampleRate) as BlobPart], {
      type: "audio/wav",
    });
  } catch {
    throw new Error("녹음을 WAV로 변환하지 못했습니다. 다시 녹음해 주세요.");
  } finally {
    await context.close().catch(() => {});
  }
}

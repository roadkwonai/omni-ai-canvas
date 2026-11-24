export type UpscaleOptions = { scale: 2 | 4 | 6; style: "natural" | "detail" };

export function upscaleDimensions(width: number, height: number, scale: UpscaleOptions["scale"]) {
  const result = { width: width * scale, height: height * scale };
  if (!width || !height || result.width > 16384 || result.height > 16384 || result.width * result.height > 40000000) {
    throw new Error("이미지 크기가 너무 큽니다. 배율을 낮춰 주세요.");
  }
  return result;
}

export async function upscaleImage(image: HTMLImageElement, options: UpscaleOptions): Promise<File> {
  const { width, height } = upscaleDimensions(image.naturalWidth, image.naturalHeight, options.scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("이미지 처리 화면을 열 수 없습니다.");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, width, height);
  if (options.style === "detail") {
    const data = context.getImageData(0, 0, width, height);
    const pixels = data.data;
    const original = new Uint8ClampedArray(pixels);
    let lastYield = performance.now();
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = (y * width + x) * 4;
        if (original[i + 3] < 255 || original[i - 1] < 255 || original[i + 7] < 255 ||
            original[i - width * 4 + 3] < 255 || original[i + width * 4 + 3] < 255) continue;
        for (let c = 0; c < 3; c++) {
          const neighbors = original[i + c - 4] + original[i + c + 4] + original[i + c - width * 4] + original[i + c + width * 4];
          pixels[i + c] = Math.max(0, Math.min(255, original[i + c] + (original[i + c] - neighbors / 4) * 0.3));
        }
      }
      if (performance.now() - lastYield >= 12) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        lastYield = performance.now();
      }
    }
    context.putImageData(data, 0, 0);
  }
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("확대 이미지를 저장할 수 없습니다.");
  return new File([blob], "upscaled.png", { type: "image/png" });
}

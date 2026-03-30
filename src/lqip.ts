import {
  PhotonImage,
  SamplingFilter,
  resize,
} from "@cf-wasm/photon/workerd";

export interface LqipResult {
  content: Uint8Array;
  metadata: {
    originalWidth: number;
    originalHeight: number;
    width: number;
    height: number;
    type: string;
    dataURIBase64: string;
  };
}

export function computeLqipImage(
  input: ArrayBuffer,
  opts: { resize?: number; outputFormat?: string } = {}
): LqipResult {
  const { resize: maxDim = 16, outputFormat = "webp" } = opts;

  const image = PhotonImage.new_from_byteslice(new Uint8Array(input));
  let resized: PhotonImage | null = null;

  try {
    const originalWidth = image.get_width();
    const originalHeight = image.get_height();

    const scale = Math.min(maxDim / originalWidth, maxDim / originalHeight, 1);
    const targetWidth = Math.max(1, Math.round(originalWidth * scale));
    const targetHeight = Math.max(1, Math.round(originalHeight * scale));

    resized = resize(image, targetWidth, targetHeight, SamplingFilter.Lanczos3);

    const width = resized.get_width();
    const height = resized.get_height();

    let outputBytes: Uint8Array;
    if (outputFormat === "webp") {
      outputBytes = resized.get_bytes_webp();
    } else if (outputFormat === "jpg" || outputFormat === "jpeg") {
      outputBytes = resized.get_bytes_jpeg(20);
    } else {
      throw new Error(`Invalid output format "${outputFormat}"`);
    }

    const base64 = uint8ArrayToBase64(outputBytes);

    return {
      content: outputBytes,
      metadata: {
        originalWidth,
        originalHeight,
        width,
        height,
        type: outputFormat,
        dataURIBase64: `data:image/${outputFormat};base64,${base64}`,
      },
    };
  } finally {
    image.free();
    resized?.free();
  }
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

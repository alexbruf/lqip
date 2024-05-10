import {sharp, base64, Hono} from "./deps.ts";

const cache = new Map<string, string>();
export async function computeLqipImage(
  input: ArrayBufferLike,
  opts: {
    resize?: number;
    outputFormat?: string;
    outputOptions?: Record<string, unknown>;
  } = {},
) {
  const { resize = 16, outputFormat = "webp", outputOptions } = opts;

  const image = sharp(input).rotate();
  const metadata = await image.metadata();

  const resized = image.resize(
    ...(Array.isArray(resize)
      ? resize
      : [
          Math.min(metadata.width!, resize),
          Math.min(metadata.height!, resize),
          { fit: "inside" },
        ]),
  );
  let output: sharp.Sharp;

  if (outputFormat === "webp") {
    output = resized.webp({
      quality: 20,
      alphaQuality: 20,
      smartSubsample: true,
      ...outputOptions,
    });
  } else if (outputFormat === "jpg" || outputFormat === "jpeg") {
    output = resized.jpeg({
      quality: 20,
      ...outputOptions,
    });
  } else {
    throw new Error(`Invalid outputformat "${outputFormat}"`);
  }

  const tempFilePath = await Deno.makeTempFile({
    prefix: "temp_",
    suffix: `.${outputFormat}`,
  });
  const info = await output.toFile(tempFilePath);
  const { base64Encoded: base64, fileData } = await fileToBase64(tempFilePath);

  return {
    content: fileData,
    metadata: {
      originalWidth: metadata.width,
      originalHeight: metadata.height,
      width: info.width,
      height: info.height,
      type: outputFormat,
      dataURIBase64: `data:image/${outputFormat};base64,${base64}`,
    },
  };
}

async function fileToBase64(
  filePath: string,
): Promise<{ base64Encoded: string; fileData: Uint8Array }> {
  try {
    // Read the file as binary data
    const fileData = await Deno.readFile(filePath);

    // Convert the Uint8Array to a binary string

    // Convert the binary string to a Base64 string
    const base64Encoded = base64.encodeBase64(fileData);

    return { base64Encoded, fileData };
  } catch (error) {
    console.error("Error converting file to Base64:", error);
    throw error;
  }
}
export async function lqipModern(key: string, ab: ArrayBuffer) {
  if (cache.has(key)) {
    return cache.get(key);
  }
  const result = await computeLqipImage(ab);
  cache.set(key, result.metadata.dataURIBase64);
  return result.metadata.dataURIBase64;
}

const app = new Hono();

app.post("/", async (c) => {
  const apiKey = Deno.env.get("API_KEY");
  if (!apiKey) {
    return c.text("App not set up correctly", 500);
  }

  const contentType = c.req.header("content-type");
  if (
    !contentType ||
    !["multipart/form-data", "application/x-www-form-urlencoded"].includes(
      contentType.split(";")[0],
    )
  ) {
    // handle image content type by using headers
    if (contentType && contentType.startsWith("image/")) {
      const testAPIKey = c.req.header("x-api-key");
      if (!testAPIKey || testAPIKey !== apiKey) {
        return c.text("Invalid API Key", 401);
      }
      // get output format from header
      const outputFormat = c.req.header("x-output-format") || "webp";
      const buffer = await c.req.arrayBuffer();
      const lqip = await computeLqipImage(buffer, { outputFormat, resize: 16 });
      // if accept is image return image
      const accept = c.req.header("accept");
      if (accept && accept.startsWith("image/")) {
        c.header("content-type", `image/${outputFormat}`);
        c.header("content-length", `${lqip.content.byteLength}`);
        c.status(201);
        return c.body(lqip.content);
      }

      return c.json(lqip.metadata);
    }

    return c.text("Invalid content type", 400);
  }

  const body = await c.req.parseBody();
  const outputFormat = (body["outputFormat"] as string) || ("webp" as string);
  const file = body["file"] as File;
  const testAPIKey = body["apiKey"] as string;
  if (!testAPIKey || testAPIKey !== apiKey) {
    return c.text("Invalid API Key", 401);
  }

  if (!file) {
    return c.text("No file found", 400);
  }

  const lqip = await computeLqipImage(await file.arrayBuffer(), {
    outputFormat,
    resize: 16,
  });
  const accept = c.req.header("accept");
  if (accept && accept.startsWith("image/")) {
    c.header("content-type", `image/${outputFormat}`);
    c.header("content-length", `${lqip.content.byteLength}`);
    c.status(201);
    return c.body(lqip.content);
  }
  return c.json(lqip.metadata);
});

Deno.serve(app.fetch);

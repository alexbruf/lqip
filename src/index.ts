import { Hono } from "hono";
import { computeLqipImage } from "./lqip";

type Bindings = {
  API_KEY: string;
  RATE_LIMITER: RateLimit;
};

const app = new Hono<{ Bindings: Bindings }>();

app.post("/", async (c) => {
  const apiKey = c.env.API_KEY;
  if (!apiKey) {
    return c.text("App not set up correctly", 500);
  }

  // Rate limit by client IP (binding is present in production)
  if (c.env.RATE_LIMITER) {
    const ip = c.req.header("cf-connecting-ip") ?? "unknown";
    const { success } = await c.env.RATE_LIMITER.limit({ key: ip });
    if (!success) {
      return c.text("Rate limit exceeded", 429);
    }
  }

  const contentType = c.req.header("content-type");
  if (
    !contentType ||
    !["multipart/form-data", "application/x-www-form-urlencoded"].includes(
      contentType.split(";")[0]
    )
  ) {
    // Handle raw image body
    if (contentType && contentType.startsWith("image/")) {
      const testAPIKey = c.req.header("x-api-key");
      if (!testAPIKey || testAPIKey !== apiKey) {
        return c.text("Invalid API Key", 401);
      }

      const outputFormat = c.req.header("x-output-format") || "webp";
      const buffer = await c.req.arrayBuffer();

      let lqip;
      try {
        lqip = computeLqipImage(buffer, { outputFormat, resize: 16 });
      } catch {
        return c.text("Invalid image data", 400);
      }

      const accept = c.req.header("accept");
      if (accept && accept.startsWith("image/")) {
        return new Response(lqip.content, {
          status: 201,
          headers: {
            "content-type": `image/${outputFormat}`,
            "content-length": `${lqip.content.byteLength}`,
          },
        });
      }

      return c.json(lqip.metadata);
    }

    return c.text("Invalid content type", 400);
  }

  // Handle multipart form data
  const body = await c.req.parseBody();
  const outputFormat = (body["outputFormat"] as string) || "webp";
  const file = body["file"] as File;
  const testAPIKey = body["apiKey"] as string;

  if (!testAPIKey || testAPIKey !== apiKey) {
    return c.text("Invalid API Key", 401);
  }

  if (!file) {
    return c.text("No file found", 400);
  }

  let lqip;
  try {
    lqip = computeLqipImage(await file.arrayBuffer(), {
      outputFormat,
      resize: 16,
    });
  } catch {
    return c.text("Invalid image data", 400);
  }

  const accept = c.req.header("accept");
  if (accept && accept.startsWith("image/")) {
    return new Response(lqip.content, {
      status: 201,
      headers: {
        "content-type": `image/${outputFormat}`,
        "content-length": `${lqip.content.byteLength}`,
      },
    });
  }

  return c.json(lqip.metadata);
});

export default app;

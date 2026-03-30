import { describe, it, expect } from "vitest";
import { SELF } from "cloudflare:test";

const API_KEY = "test-api-key";

// Helper: send raw image body
async function postRaw(
  body: BodyInit,
  headers: Record<string, string> = {}
): Promise<Response> {
  return SELF.fetch("http://localhost/", {
    method: "POST",
    headers: {
      "content-type": "image/jpeg",
      "x-api-key": API_KEY,
      ...headers,
    },
    body,
  });
}

// Helper: send multipart form
async function postForm(
  fileBytes: Uint8Array,
  fields: Record<string, string> = {}
): Promise<Response> {
  const form = new FormData();
  form.append(
    "file",
    new Blob([fileBytes], { type: "image/jpeg" }),
    "test.jpg"
  );
  form.append("apiKey", API_KEY);
  for (const [k, v] of Object.entries(fields)) {
    form.append(k, v);
  }
  return SELF.fetch("http://localhost/", { method: "POST", body: form });
}

// Minimal valid PNG generator (uncompressed, RGBA)
function makePng(width: number, height: number): Uint8Array {
  // Build raw RGBA scanlines (filter byte 0 + RGBA pixels)
  const rawLines: number[] = [];
  for (let y = 0; y < height; y++) {
    rawLines.push(0); // filter: none
    for (let x = 0; x < width; x++) {
      rawLines.push(
        (x * 37 + y * 59) & 0xff, // R
        (x * 73 + y * 41) & 0xff, // G
        (x * 17 + y * 97) & 0xff, // B
        0xff // A
      );
    }
  }

  // Deflate with stored blocks (no compression)
  const raw = new Uint8Array(rawLines);
  const deflated = deflateStored(raw);

  const ihdr = makeChunk("IHDR", [
    ...u32be(width),
    ...u32be(height),
    8, // bit depth
    6, // color type: RGBA
    0, // compression
    0, // filter
    0, // interlace
  ]);
  const idat = makeChunk("IDAT", Array.from(deflated));
  const iend = makeChunk("IEND", []);
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

  return new Uint8Array([...signature, ...ihdr, ...idat, ...iend]);
}

function deflateStored(data: Uint8Array): Uint8Array {
  // zlib header (CM=8, CINFO=7, FCHECK) + stored deflate blocks + adler32
  const maxBlock = 65535;
  const blocks: number[] = [];
  let offset = 0;
  while (offset < data.length) {
    const remaining = data.length - offset;
    const len = Math.min(remaining, maxBlock);
    const isFinal = offset + len >= data.length ? 1 : 0;
    blocks.push(isFinal); // BFINAL + BTYPE=00
    blocks.push(len & 0xff, (len >> 8) & 0xff);
    blocks.push(~len & 0xff, (~len >> 8) & 0xff);
    for (let i = 0; i < len; i++) blocks.push(data[offset + i]);
    offset += len;
  }
  const adler = adler32(data);
  return new Uint8Array([
    0x78,
    0x01, // zlib header
    ...blocks,
    (adler >> 24) & 0xff,
    (adler >> 16) & 0xff,
    (adler >> 8) & 0xff,
    adler & 0xff,
  ]);
}

function adler32(data: Uint8Array): number {
  let a = 1,
    b = 0;
  for (let i = 0; i < data.length; i++) {
    a = (a + data[i]) % 65521;
    b = (b + a) % 65521;
  }
  return (b << 16) | a;
}

function makeChunk(type: string, data: number[]): number[] {
  const typeBytes = [
    type.charCodeAt(0),
    type.charCodeAt(1),
    type.charCodeAt(2),
    type.charCodeAt(3),
  ];
  const payload = [...typeBytes, ...data];
  const crc = crc32(new Uint8Array(payload));
  return [...u32be(data.length), ...payload, ...u32be(crc)];
}

function u32be(n: number): number[] {
  return [(n >> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Random bytes
function randomBytes(n: number): Uint8Array {
  const buf = new Uint8Array(n);
  for (let i = 0; i < n; i++) buf[i] = Math.floor(Math.random() * 256);
  return buf;
}

// ─── Corrupt / garbage data ───────────────────────────────────────

describe("fuzz: corrupt data", () => {
  it("handles empty body gracefully", async () => {
    const res = await postRaw(new Uint8Array(0));
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("handles 1 byte body", async () => {
    const res = await postRaw(new Uint8Array([0xff]));
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("handles pure random bytes (small)", async () => {
    for (let i = 0; i < 20; i++) {
      const res = await postRaw(randomBytes(Math.floor(Math.random() * 512)));
      expect(res.status).toBeGreaterThanOrEqual(400);
    }
  });

  it("handles pure random bytes (medium)", async () => {
    for (let i = 0; i < 5; i++) {
      const res = await postRaw(randomBytes(4096 + Math.floor(Math.random() * 8192)));
      expect(res.status).toBeGreaterThanOrEqual(400);
    }
  });

  it("handles JPEG magic bytes followed by garbage", async () => {
    const data = new Uint8Array([0xff, 0xd8, 0xff, ...randomBytes(200)]);
    const res = await postRaw(data);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("handles PNG magic bytes followed by garbage", async () => {
    const data = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ...randomBytes(200),
    ]);
    const res = await postRaw(data);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("handles truncated valid PNG (cut mid-IHDR)", async () => {
    const validPng = makePng(4, 4);
    const truncated = validPng.slice(0, 20);
    const res = await postRaw(truncated);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("handles truncated valid PNG (cut mid-IDAT)", async () => {
    const validPng = makePng(4, 4);
    const truncated = validPng.slice(0, Math.floor(validPng.length * 0.6));
    const res = await postRaw(truncated);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("handles all-zeros body", async () => {
    const res = await postRaw(new Uint8Array(1024));
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("handles all-0xFF body", async () => {
    const res = await postRaw(new Uint8Array(1024).fill(0xff));
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("handles valid PNG with corrupted pixel data", async () => {
    const validPng = makePng(4, 4);
    const corrupted = new Uint8Array(validPng);
    // Corrupt bytes in the IDAT section
    for (let i = validPng.length - 30; i < validPng.length - 12; i++) {
      corrupted[i] = corrupted[i] ^ 0xff;
    }
    const res = await postRaw(corrupted);
    // May succeed or fail — just shouldn't crash
    expect(res.status).toBeLessThan(600);
  });

  it("handles multipart with corrupt file data", async () => {
    const res = await postForm(randomBytes(500));
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

// ─── Valid images at various dimensions ───────────────────────────

describe("fuzz: valid images at edge-case dimensions", () => {
  it("handles 1x1 image", async () => {
    const res = await postRaw(makePng(1, 1));
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.originalWidth).toBe(1);
    expect(json.originalHeight).toBe(1);
    expect(json.width).toBe(1);
    expect(json.height).toBe(1);
  });

  it("handles 1x100 tall narrow image", async () => {
    const res = await postRaw(makePng(1, 100));
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.originalWidth).toBe(1);
    expect(json.originalHeight).toBe(100);
    expect(json.width).toBe(1);
    expect(json.height).toBeLessThanOrEqual(16);
  });

  it("handles 100x1 wide flat image", async () => {
    const res = await postRaw(makePng(100, 1));
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.originalWidth).toBe(100);
    expect(json.originalHeight).toBe(1);
    expect(json.width).toBeLessThanOrEqual(16);
    expect(json.height).toBe(1);
  });

  it("handles exactly 16x16 (no-op resize)", async () => {
    const res = await postRaw(makePng(16, 16));
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.width).toBe(16);
    expect(json.height).toBe(16);
  });

  it("handles 15x15 (smaller than maxDim)", async () => {
    const res = await postRaw(makePng(15, 15));
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.width).toBe(15);
    expect(json.height).toBe(15);
  });

  it("handles 17x17 (just over maxDim)", async () => {
    const res = await postRaw(makePng(17, 17));
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.width).toBeLessThanOrEqual(16);
    expect(json.height).toBeLessThanOrEqual(16);
  });

  it("handles 200x200 image", async () => {
    const res = await postRaw(makePng(200, 200));
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.width).toBeLessThanOrEqual(16);
    expect(json.height).toBeLessThanOrEqual(16);
    expect(json.dataURIBase64).toMatch(/^data:image\/webp;base64,/);
  });

  it("handles very wide aspect ratio (500x2)", async () => {
    const res = await postRaw(makePng(500, 2));
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.width).toBeLessThanOrEqual(16);
    expect(json.height).toBeGreaterThanOrEqual(1);
  });

  it("handles very tall aspect ratio (2x500)", async () => {
    const res = await postRaw(makePng(2, 500));
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.height).toBeLessThanOrEqual(16);
    expect(json.width).toBeGreaterThanOrEqual(1);
  });
});

// ─── Output format edge cases ─────────────────────────────────────

describe("fuzz: output format", () => {
  it("rejects invalid output format via header", async () => {
    const res = await postRaw(makePng(4, 4), {
      "x-output-format": "bmp",
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("rejects invalid output format via form field", async () => {
    const res = await postForm(makePng(4, 4), { outputFormat: "tiff" });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("handles 'jpg' format", async () => {
    const res = await postRaw(makePng(4, 4), {
      "x-output-format": "jpg",
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.type).toBe("jpg");
  });

  it("handles 'jpeg' format", async () => {
    const res = await postRaw(makePng(4, 4), {
      "x-output-format": "jpeg",
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.type).toBe("jpeg");
  });

  it("handles empty output format string (defaults to webp)", async () => {
    const res = await postRaw(makePng(4, 4), {
      "x-output-format": "",
    });
    // Empty string is falsy, should default to "webp"
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.type).toBe("webp");
  });

  it("rejects format with injection attempt", async () => {
    const res = await postRaw(makePng(4, 4), {
      "x-output-format": "webp; rm -rf /",
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

// ─── HTTP method / routing edge cases ─────────────────────────────

describe("fuzz: HTTP edge cases", () => {
  it("rejects GET requests", async () => {
    const res = await SELF.fetch("http://localhost/", { method: "GET" });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("rejects PUT requests", async () => {
    const res = await SELF.fetch("http://localhost/", {
      method: "PUT",
      headers: {
        "content-type": "image/jpeg",
        "x-api-key": API_KEY,
      },
      body: makePng(4, 4),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("rejects POST to wrong path", async () => {
    const res = await SELF.fetch("http://localhost/other", {
      method: "POST",
      headers: {
        "content-type": "image/jpeg",
        "x-api-key": API_KEY,
      },
      body: makePng(4, 4),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("handles missing content-type header", async () => {
    const res = await SELF.fetch("http://localhost/", {
      method: "POST",
      headers: { "x-api-key": API_KEY },
      body: makePng(4, 4),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("handles content-type with unusual image subtype", async () => {
    const res = await SELF.fetch("http://localhost/", {
      method: "POST",
      headers: {
        "content-type": "image/x-unknown-format",
        "x-api-key": API_KEY,
      },
      body: makePng(4, 4),
    });
    // Should accept it (content-type starts with image/) and try to parse
    expect(res.status).toBeLessThan(600);
  });
});

// ─── Auth edge cases ──────────────────────────────────────────────

describe("fuzz: auth edge cases", () => {
  it("rejects empty API key in header", async () => {
    const res = await SELF.fetch("http://localhost/", {
      method: "POST",
      headers: {
        "content-type": "image/jpeg",
        "x-api-key": "",
      },
      body: makePng(4, 4),
    });
    expect(res.status).toBe(401);
  });

  it("accepts API key with extra whitespace (HTTP header trimming)", async () => {
    // HTTP spec trims leading/trailing whitespace from header values
    const res = await SELF.fetch("http://localhost/", {
      method: "POST",
      headers: {
        "content-type": "image/jpeg",
        "x-api-key": " test-api-key ",
      },
      body: makePng(4, 4),
    });
    expect(res.status).toBe(200);
  });

  it("rejects API key that is a prefix of real key", async () => {
    const res = await SELF.fetch("http://localhost/", {
      method: "POST",
      headers: {
        "content-type": "image/jpeg",
        "x-api-key": "test-api",
      },
      body: makePng(4, 4),
    });
    expect(res.status).toBe(401);
  });

  it("rejects API key that is a superstring of real key", async () => {
    const res = await SELF.fetch("http://localhost/", {
      method: "POST",
      headers: {
        "content-type": "image/jpeg",
        "x-api-key": "test-api-key-extra",
      },
      body: makePng(4, 4),
    });
    expect(res.status).toBe(401);
  });

  it("rejects empty API key in form field", async () => {
    const form = new FormData();
    form.append("file", new Blob([makePng(4, 4)], { type: "image/png" }), "t.png");
    form.append("apiKey", "");
    const res = await SELF.fetch("http://localhost/", {
      method: "POST",
      body: form,
    });
    expect(res.status).toBe(401);
  });
});

// ─── Response format validation ───────────────────────────────────

describe("fuzz: response integrity", () => {
  it("base64 data URI is valid and decodable", async () => {
    const res = await postRaw(makePng(10, 10));
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    const match = json.dataURIBase64.match(
      /^data:image\/(webp|jpeg|jpg);base64,(.+)$/
    );
    expect(match).not.toBeNull();
    // Verify base64 decodes without error
    const decoded = atob(match![2]);
    expect(decoded.length).toBeGreaterThan(0);
  });

  it("image response has valid content-length", async () => {
    const res = await postRaw(makePng(10, 10), { accept: "image/webp" });
    expect(res.status).toBe(201);
    const contentLength = parseInt(res.headers.get("content-length")!, 10);
    const body = await res.arrayBuffer();
    expect(body.byteLength).toBe(contentLength);
  });

  it("dimensions are consistent between json and image response", async () => {
    const png = makePng(50, 30);

    const jsonRes = await postRaw(png);
    const json = (await jsonRes.json()) as any;

    expect(json.originalWidth).toBe(50);
    expect(json.originalHeight).toBe(30);
    expect(json.width).toBeLessThanOrEqual(16);
    expect(json.height).toBeLessThanOrEqual(16);
    // Aspect ratio should be roughly preserved
    const originalRatio = 50 / 30;
    const outputRatio = json.width / json.height;
    expect(Math.abs(originalRatio - outputRatio)).toBeLessThan(1);
  });

  it("webp output starts with valid RIFF header", async () => {
    const res = await postRaw(makePng(10, 10), { accept: "image/webp" });
    const buf = new Uint8Array(await res.arrayBuffer());
    // RIFF....WEBP
    expect(String.fromCharCode(buf[0], buf[1], buf[2], buf[3])).toBe("RIFF");
    expect(String.fromCharCode(buf[8], buf[9], buf[10], buf[11])).toBe("WEBP");
  });

  it("jpeg output starts with valid JFIF header", async () => {
    const res = await postRaw(makePng(10, 10), {
      accept: "image/jpeg",
      "x-output-format": "jpeg",
    });
    const buf = new Uint8Array(await res.arrayBuffer());
    // JPEG magic: FF D8
    expect(buf[0]).toBe(0xff);
    expect(buf[1]).toBe(0xd8);
  });
});

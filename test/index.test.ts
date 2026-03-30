import { describe, it, expect } from "vitest";
import { SELF } from "cloudflare:test";

// Minimal valid 1x1 red JPEG (baseline, 107 bytes)
const TINY_JPEG = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
  0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
  0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
  0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20,
  0x24, 0x2e, 0x27, 0x20, 0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29,
  0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27, 0x39, 0x3d, 0x38, 0x32,
  0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
  0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00,
  0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
  0x09, 0x0a, 0x0b, 0xff, 0xc4, 0x00, 0xb5, 0x10, 0x00, 0x02, 0x01, 0x03,
  0x03, 0x02, 0x04, 0x03, 0x05, 0x05, 0x04, 0x04, 0x00, 0x00, 0x01, 0x7d,
  0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06,
  0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08,
  0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0, 0x24, 0x33, 0x62, 0x72,
  0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28,
  0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45,
  0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59,
  0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75,
  0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
  0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3,
  0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6,
  0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9,
  0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2,
  0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4,
  0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01,
  0x00, 0x00, 0x3f, 0x00, 0x7b, 0x94, 0x11, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff, 0xd9,
]);

describe("LQIP API", () => {
  describe("API key validation", () => {
    it("rejects requests without API key (multipart)", async () => {
      const form = new FormData();
      form.append("file", new Blob([TINY_JPEG], { type: "image/jpeg" }), "test.jpg");
      form.append("apiKey", "wrong-key");

      const res = await SELF.fetch("http://localhost/", {
        method: "POST",
        body: form,
      });

      expect(res.status).toBe(401);
      expect(await res.text()).toBe("Invalid API Key");
    });

    it("rejects requests without API key (raw image)", async () => {
      const res = await SELF.fetch("http://localhost/", {
        method: "POST",
        headers: {
          "content-type": "image/jpeg",
          "x-api-key": "wrong-key",
        },
        body: TINY_JPEG,
      });

      expect(res.status).toBe(401);
      expect(await res.text()).toBe("Invalid API Key");
    });

    it("rejects missing x-api-key header for raw image", async () => {
      const res = await SELF.fetch("http://localhost/", {
        method: "POST",
        headers: { "content-type": "image/jpeg" },
        body: TINY_JPEG,
      });

      expect(res.status).toBe(401);
    });
  });

  describe("content type validation", () => {
    it("rejects invalid content type", async () => {
      const res = await SELF.fetch("http://localhost/", {
        method: "POST",
        headers: {
          "content-type": "text/plain",
          "x-api-key": "test-api-key",
        },
        body: "not an image",
      });

      expect(res.status).toBe(400);
      expect(await res.text()).toBe("Invalid content type");
    });

    it("rejects multipart without file", async () => {
      const form = new FormData();
      form.append("apiKey", "test-api-key");

      const res = await SELF.fetch("http://localhost/", {
        method: "POST",
        body: form,
      });

      expect(res.status).toBe(400);
      expect(await res.text()).toBe("No file found");
    });
  });

  describe("raw image upload", () => {
    it("returns JSON metadata by default", async () => {
      const res = await SELF.fetch("http://localhost/", {
        method: "POST",
        headers: {
          "content-type": "image/jpeg",
          "x-api-key": "test-api-key",
        },
        body: TINY_JPEG,
      });

      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json.originalWidth).toBe(1);
      expect(json.originalHeight).toBe(1);
      expect(json.width).toBe(1);
      expect(json.height).toBe(1);
      expect(json.type).toBe("webp");
      expect(json.dataURIBase64).toMatch(/^data:image\/webp;base64,/);
    });

    it("returns image when Accept: image/*", async () => {
      const res = await SELF.fetch("http://localhost/", {
        method: "POST",
        headers: {
          "content-type": "image/jpeg",
          "x-api-key": "test-api-key",
          accept: "image/webp",
        },
        body: TINY_JPEG,
      });

      expect(res.status).toBe(201);
      expect(res.headers.get("content-type")).toBe("image/webp");
      const body = await res.arrayBuffer();
      expect(body.byteLength).toBeGreaterThan(0);
    });

    it("supports jpeg output format", async () => {
      const res = await SELF.fetch("http://localhost/", {
        method: "POST",
        headers: {
          "content-type": "image/jpeg",
          "x-api-key": "test-api-key",
          "x-output-format": "jpeg",
        },
        body: TINY_JPEG,
      });

      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json.type).toBe("jpeg");
      expect(json.dataURIBase64).toMatch(/^data:image\/jpeg;base64,/);
    });
  });

  describe("multipart upload", () => {
    it("returns JSON metadata", async () => {
      const form = new FormData();
      form.append("file", new Blob([TINY_JPEG], { type: "image/jpeg" }), "test.jpg");
      form.append("apiKey", "test-api-key");

      const res = await SELF.fetch("http://localhost/", {
        method: "POST",
        body: form,
      });

      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json.originalWidth).toBe(1);
      expect(json.originalHeight).toBe(1);
      expect(json.type).toBe("webp");
      expect(json.dataURIBase64).toMatch(/^data:image\/webp;base64,/);
    });

    it("supports custom output format via form field", async () => {
      const form = new FormData();
      form.append("file", new Blob([TINY_JPEG], { type: "image/jpeg" }), "test.jpg");
      form.append("apiKey", "test-api-key");
      form.append("outputFormat", "jpeg");

      const res = await SELF.fetch("http://localhost/", {
        method: "POST",
        body: form,
      });

      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json.type).toBe("jpeg");
    });

    it("returns image when Accept: image/*", async () => {
      const form = new FormData();
      form.append("file", new Blob([TINY_JPEG], { type: "image/jpeg" }), "test.jpg");
      form.append("apiKey", "test-api-key");

      const res = await SELF.fetch("http://localhost/", {
        method: "POST",
        headers: { accept: "image/webp" },
        body: form,
      });

      expect(res.status).toBe(201);
      expect(res.headers.get("content-type")).toBe("image/webp");
    });
  });
});

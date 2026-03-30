import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import app from "../src/index";

// Minimal valid 1x1 PNG
function makeTinyPng(): Uint8Array {
  // Pre-built minimal 1x1 RGBA PNG
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
    0x11, 0x49, 0x44, 0x41, 0x54, 0x78, 0x01, 0x01, 0x06, 0x00, 0xf9, 0xff,
    0x00, 0xff, 0x00, 0x00, 0xff, 0x00, 0x06, 0x01, 0x03, 0x00, 0x00, 0x00,
    0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]);
}

describe("rate limiting", () => {
  it("returns 429 when rate limiter denies request", async () => {
    // Create a mock env with a rate limiter that always denies
    const mockEnv = {
      ...env,
      RATE_LIMITER: {
        limit: async (_opts: { key: string }) => ({ success: false }),
      },
    };

    const req = new Request("http://localhost/", {
      method: "POST",
      headers: {
        "content-type": "image/jpeg",
        "x-api-key": "test-api-key",
      },
      body: makeTinyPng(),
    });

    const res = await app.fetch(req, mockEnv);
    expect(res.status).toBe(429);
    expect(await res.text()).toBe("Rate limit exceeded");
  });

  it("allows request when rate limiter permits", async () => {
    const mockEnv = {
      ...env,
      RATE_LIMITER: {
        limit: async (_opts: { key: string }) => ({ success: true }),
      },
    };

    const req = new Request("http://localhost/", {
      method: "POST",
      headers: {
        "content-type": "image/jpeg",
        "x-api-key": "test-api-key",
      },
      body: makeTinyPng(),
    });

    const res = await app.fetch(req, mockEnv);
    // Should proceed past rate limiting (may fail on image parsing, but not 429)
    expect(res.status).not.toBe(429);
  });

  it("rate limits by cf-connecting-ip header", async () => {
    let capturedKey = "";
    const mockEnv = {
      ...env,
      RATE_LIMITER: {
        limit: async (opts: { key: string }) => {
          capturedKey = opts.key;
          return { success: true };
        },
      },
    };

    const req = new Request("http://localhost/", {
      method: "POST",
      headers: {
        "content-type": "image/jpeg",
        "x-api-key": "test-api-key",
        "cf-connecting-ip": "1.2.3.4",
      },
      body: makeTinyPng(),
    });

    await app.fetch(req, mockEnv);
    expect(capturedKey).toBe("1.2.3.4");
  });

  it("uses 'unknown' key when no IP header", async () => {
    let capturedKey = "";
    const mockEnv = {
      ...env,
      RATE_LIMITER: {
        limit: async (opts: { key: string }) => {
          capturedKey = opts.key;
          return { success: true };
        },
      },
    };

    const req = new Request("http://localhost/", {
      method: "POST",
      headers: {
        "content-type": "image/jpeg",
        "x-api-key": "test-api-key",
      },
      body: makeTinyPng(),
    });

    await app.fetch(req, mockEnv);
    expect(capturedKey).toBe("unknown");
  });

  it("skips rate limiting when binding is absent", async () => {
    // env without RATE_LIMITER — should work fine
    const req = new Request("http://localhost/", {
      method: "POST",
      headers: {
        "content-type": "image/jpeg",
        "x-api-key": "test-api-key",
      },
      body: makeTinyPng(),
    });

    const res = await app.fetch(req, env);
    expect(res.status).not.toBe(429);
  });
});

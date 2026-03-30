# LQIP

Low Quality Image Placeholder generator, running as a Cloudflare Worker.

Accepts an image (via raw body or multipart form upload), resizes it to 16px, and returns a tiny WebP/JPEG as a base64 data URI.

## Development

```bash
bun install
bun run dev
```

## Testing

```bash
bun run test
```

## Deployment

```bash
# Set your API key secret
bunx wrangler secret put API_KEY

# Deploy
bun run deploy
```

## API

**POST /**

### Raw image body

```bash
curl -X POST \
  -H "Content-Type: image/jpeg" \
  -H "x-api-key: YOUR_KEY" \
  --data-binary @photo.jpg \
  https://your-worker.workers.dev/
```

### Multipart form

```bash
curl -X POST \
  -F "file=@photo.jpg" \
  -F "apiKey=YOUR_KEY" \
  -F "outputFormat=webp" \
  https://your-worker.workers.dev/
```

### Response

JSON with metadata (default):

```json
{
  "originalWidth": 4032,
  "originalHeight": 3024,
  "width": 16,
  "height": 12,
  "type": "webp",
  "dataURIBase64": "data:image/webp;base64,..."
}
```

Or raw image bytes if `Accept: image/*` is set.

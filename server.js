import 'dotenv/config';
import { spawn } from 'node:child_process';
import { createReadStream, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const INTERACTIONS_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const STORY_MODEL = 'gemini-3.5-flash';
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

async function readJson(request) {
  let raw = '';
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 1_000_000) {
      const error = new Error('Request body is too large.');
      error.status = 413;
      throw error;
    }
  }
  try {
    return JSON.parse(raw || '{}');
  } catch {
    const error = new Error('Request body must be valid JSON.');
    error.status = 400;
    throw error;
  }
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(body));
}

async function serveFrontend(request, response) {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const requestedPath = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1));
  const filePath = path.resolve(ROOT, 'dist', requestedPath);
  const distPath = path.resolve(ROOT, 'dist');
  if (filePath !== distPath && !filePath.startsWith(`${distPath}${path.sep}`)) {
    sendJson(response, 403, { error: 'Forbidden.' });
    return;
  }
  const target = existsSync(filePath) ? filePath : path.join(distPath, 'index.html');
  if (!existsSync(target)) {
    sendJson(response, 404, { error: 'Production build not found. Run npm run build first.' });
    return;
  }
  response.writeHead(200, {
    'Content-Type': CONTENT_TYPES[path.extname(target)] || 'application/octet-stream',
    'Cache-Control': path.extname(target) === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
  });
  createReadStream(target).pipe(response);
}

export function createAppServer({ env = process.env, fetchImpl = fetch, serveStatic = false } = {}) {
  return createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (request.method === 'GET' && pathname === '/api/status') {
      sendJson(response, 200, {
        geminiConfigured: Boolean(env.GEMINI_API_KEY),
        stableDiffusionConfigured: Boolean(env.STABLE_DIFFUSION_URL),
      });
      return;
    }

    if (request.method === 'POST' && pathname === '/api/story') {
      try {
        const body = await readJson(request);
        if (!env.GEMINI_API_KEY) {
          sendJson(response, 503, { error: 'GEMINI_API_KEY is not configured on the server.' });
          return;
        }
        if (typeof body.input !== 'string' || !body.input.trim()) {
          sendJson(response, 400, { error: 'A story prompt is required.' });
          return;
        }
        const upstream = await fetchImpl(INTERACTIONS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
          body: JSON.stringify({
            model: STORY_MODEL,
            input: body.input,
            ...(body.generation_config ? { generation_config: body.generation_config } : {}),
          }),
        });
        const text = await upstream.text();
        response.writeHead(upstream.status, {
          'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        response.end(text);
      } catch (error) {
        sendJson(response, error.status || 502, { error: error.message || 'Gemini story request failed.' });
      }
      return;
    }

    if (request.method === 'POST' && pathname === '/api/image') {
      try {
        const body = await readJson(request);
        if (!env.STABLE_DIFFUSION_URL) {
          sendJson(response, 503, { error: 'STABLE_DIFFUSION_URL is not configured on the server.' });
          return;
        }
        if (typeof body.prompt !== 'string' || !body.prompt.trim()) {
          sendJson(response, 400, { error: 'An image prompt is required.' });
          return;
        }
        const endpoint = `${env.STABLE_DIFFUSION_URL.replace(/\/$/, '')}/sdapi/v1/txt2img`;
        const upstream = await fetchImpl(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: body.prompt,
            negative_prompt: 'text, lettering, speech bubbles, watermark, blurry, low quality',
            width: 768,
            height: 512,
            steps: 24,
            cfg_scale: 7,
            batch_size: 1,
          }),
          signal: AbortSignal.timeout(120_000),
        });
        const result = await upstream.json();
        if (!upstream.ok) {
          sendJson(response, 502, { error: result?.error || result?.detail || 'Stable Diffusion image generation failed.' });
          return;
        }
        if (typeof result.images?.[0] !== 'string' || !result.images[0]) {
          sendJson(response, 502, { error: 'Stable Diffusion returned no image.' });
          return;
        }
        sendJson(response, 200, { imageData: result.images[0], mimeType: 'image/png' });
      } catch (error) {
        sendJson(response, error.status || 502, { error: error.message || 'Stable Diffusion image generation failed.' });
      }
      return;
    }

    if (serveStatic && request.method === 'GET' && !pathname.startsWith('/api/')) {
      await serveFrontend(request, response);
      return;
    }
    sendJson(response, 404, { error: 'Not found.' });
  });
}

function start() {
  const isDev = process.argv.includes('--dev');
  const apiPort = Number(process.env.API_PORT || 3001);
  const server = createAppServer({ serveStatic: !isDev });
  server.listen(apiPort, '0.0.0.0', () => {
    console.log(`ComicCraft API listening on http://localhost:${apiPort}`);
  });

  if (isDev) {
    const vitePath = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
    const vite = spawn(process.execPath, [vitePath, '--host', '0.0.0.0'], { stdio: 'inherit' });
    const stop = () => {
      vite.kill('SIGTERM');
      server.close();
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
    vite.on('exit', code => {
      server.close();
      process.exitCode = code || 0;
    });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) start();
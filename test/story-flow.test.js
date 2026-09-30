import assert from 'node:assert/strict';
import test from 'node:test';
import { createAppServer } from '../server.js';
import { responseText } from '../src/story-response.js';

async function withServer(options, action) {
  const server = createAppServer(options);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    return await action(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

test('reads story text from raw Interactions model output blocks', () => {
  const raw = {
    steps: [
      { type: 'user_input', content: [{ type: 'text', text: 'prompt' }] },
      { type: 'model_output', content: [
        { type: 'text', text: '{"title":"Split ' },
        { type: 'text', text: 'story","panels":[{"caption":"A beginning.","dialogue":"","scene":"A garden"}]}' },
      ] },
    ],
  };
  const story = JSON.parse(responseText(raw));
  assert.equal(story.title, 'Split story');
  assert.equal(story.panels.length, 1);
  assert.equal(story.panels[0].scene, 'A garden');
});

test('keeps SDK and legacy text response fallbacks', () => {
  assert.equal(responseText({ output_text: 'sdk text' }), 'sdk text');
  assert.equal(responseText({ outputs: [{ type: 'text', text: 'legacy text' }] }), 'legacy text');
});

test('proxies story requests using the server key and exact Gemini model', async () => {
  const storyJson = '{"title":"Garden Signal","panels":[{"caption":"A garden wakes.","dialogue":"Hello, Mars.","scene":"A robot in a greenhouse."}]}';
  let upstreamRequest;
  await withServer({
    env: { GEMINI_API_KEY: 'server-test-secret' },
    fetchImpl: async (url, options) => {
      upstreamRequest = { url, options };
      return new Response(JSON.stringify({ steps: [{ type: 'model_output', content: [{ type: 'text', text: storyJson }] }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  }, async baseUrl => {
    const response = await fetch(`${baseUrl}/api/story`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: 'Main character: Mira. Setting: Mars. Tone: hopeful.', generation_config: { temperature: 0.85 } }),
    });
    const raw = await response.json();
    const story = JSON.parse(responseText(raw));
    const requestBody = JSON.parse(upstreamRequest.options.body);
    assert.equal(response.status, 200);
    assert.equal(upstreamRequest.url, 'https://generativelanguage.googleapis.com/v1beta/interactions');
    assert.equal(upstreamRequest.options.headers['x-goog-api-key'], 'server-test-secret');
    assert.equal(requestBody.model, 'gemini-3.5-flash');
    assert.match(requestBody.input, /Main character: Mira/);
    assert.deepEqual(requestBody.generation_config, { temperature: 0.85 });
    assert.equal(story.panels.length, 1);
    assert.doesNotMatch(JSON.stringify(raw), /server-test-secret/);
  });
});

test('returns Stable Diffusion images through the image endpoint', async () => {
  let upstreamRequest;
  await withServer({
    env: { STABLE_DIFFUSION_URL: 'http://sd.test' },
    fetchImpl: async (url, options) => {
      upstreamRequest = { url, options };
      return new Response(JSON.stringify({ images: ['ZmFrZS1pbWFnZQ=='] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  }, async baseUrl => {
    const response = await fetch(`${baseUrl}/api/image`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'A robot in a greenhouse' }),
    });
    const image = await response.json();
    assert.equal(response.status, 200);
    assert.equal(upstreamRequest.url, 'http://sd.test/sdapi/v1/txt2img');
    assert.equal(JSON.parse(upstreamRequest.options.body).width, 768);
    assert.equal(image.imageData, 'ZmFrZS1pbWFnZQ==');
    assert.equal(image.mimeType, 'image/png');
  });
});

test('rejects story requests without a configured server key', async () => {
  let requestedUpstream = false;
  await withServer({
    env: {},
    fetchImpl: async () => { requestedUpstream = true; throw new Error('must not call upstream'); },
  }, async baseUrl => {
    const response = await fetch(`${baseUrl}/api/story`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: 'A story idea' }),
    });
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /GEMINI_API_KEY/);
    assert.equal(requestedUpstream, false);
  });
});

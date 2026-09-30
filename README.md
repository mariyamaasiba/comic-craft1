# ComicCraft

ComicCraft is a browser-based comic studio. Gemini writes panel scripts, and a Stable Diffusion WebUI-compatible server generates panel artwork. Projects are saved in browser local storage.

## Setup

Use Node.js 18 or later. Copy `.env.example` to `.env` and configure:

- `GEMINI_API_KEY` for Gemini story generation.
- `STABLE_DIFFUSION_URL` for an Automatic1111-compatible Stable Diffusion server, such as `http://127.0.0.1:7860`.

The Gemini key is read only by the Node server. It is never included in browser code or sent from the browser to Google.

```sh
npm install
npm run dev
```

Vite prints the local development URL. For a production build, run `npm run build` followed by `npm start`.

## Features

- Story prompts include the idea, main character, setting, tone, art style, and panel count.
- Gemini story generation uses `gemini-3.5-flash` through the Interactions API.
- Panel artwork is generated through the Stable Diffusion `/sdapi/v1/txt2img` endpoint.
- Captions, dialogue, scenes, and project metadata can be edited and exported as text or JSON.
- **Export PDF** opens the browser print dialog with a storyboard-specific print layout; choose Save as PDF there.
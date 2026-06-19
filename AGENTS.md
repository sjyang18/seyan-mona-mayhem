# AGENTS.md

## Project overview
This repository is a small Astro app for "Mona Mayhem", a retro arcade-style GitHub contribution battle arena. The main app code lives under [src/pages](src/pages), and the starter implementation is documented in [README.md](README.md).

## Working conventions
- Keep changes focused on the Astro app rather than the workshop materials.
- Prefer the existing folder structure: pages in [src/pages](src/pages), API routes in [src/pages/api](src/pages/api).
- Treat [src/pages/index.astro](src/pages/index.astro) and [src/pages/api/contributions/[username].ts](src/pages/api/contributions/[username].ts) as the key reference points for the current app.
- Ignore the workshop content in [workshop](workshop) unless the request explicitly asks for it.

## Commands
- Install dependencies: `npm install`
- Start local dev server: `npm run dev`
- Build for production: `npm run build`
- Preview production build: `npm run preview`

## Astro best practices
- Use `.astro` pages and components for UI and keep server-rendered content straightforward.
- For dynamic API endpoints, use `APIRoute` and set `prerender = false` when the route must be server-rendered.
- Prefer simple, progressive enhancement over heavy client-side JavaScript.
- Keep route logic, data fetching, and rendering easy to follow and minimally coupled.

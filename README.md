🌐 [Português (Brasil)](README.pt_BR.md) | [Español](README.es.md)

# Signal Card

> **Generate a polished developer card from any public GitHub profile.**
>
> Learn modern AI-assisted development workflows with **VS Code** or **GitHub Copilot CLI** while building a practical Astro app.

A workshop template for building a GitHub developer card generator with Astro. This is the **starting point** — you'll build the app step by step using GitHub Copilot.

Signal Card turns a public GitHub username into a shareable profile snapshot with identity details, repo signals, language highlights, and a clean one-page presentation.

## ✨ Why this repo

- 🪪 **Useful output**: build a developer profile tool instead of another TODO app
- 🤖 **AI-assisted workflow practice**: prompts, planning, delegated tasks, and review loops
- 🧭 **Two learning paths**: choose VS Code or CLI based on how you work
- 🧱 **Practical stack**: Astro, API routes, caching, and deploy-ready structure

## 🚀 Start in 3 steps

1. **Create your own repo** from this template (or fork it).
2. **Pick your track** (VS Code or Copilot CLI).
3. **Begin here**: [Workshop Overview](workshop/00-overview.md).

## 📚 Workshop

The workshop supports two tracks — follow the one that matches your preferred workflow:

- **VS Code track** — Chat, Plan Mode, Agent Mode, background agents, and editor-native review loops
- **CLI track** — `copilot`, `@file` context, `/plan`, autonomous edits, `/fleet`, `/delegate`, and `/review`

| Part | Title | Copilot Focus |
|------|-------|---------------|
| [00](workshop/00-overview.md) | Overview | Track selection and learning goals |
| [01](workshop/01-setup.md) | Setup & Context Engineering | Instructions, permissions, and environment setup |
| [02](workshop/02-plan-and-scaffold.md) | Plan & Scaffold | Planning the API and page architecture |
| [03](workshop/03-agent-mode.md) | Build the App | Agentic implementation and iteration |
| [04](workshop/04-design-vibes.md) | Design-First Theming | Visual design planning and implementation |
| [05](workshop/05-polish.md) | Polish & Parallel Work | Parallelism, reviews, and quality passes |
| [06](workshop/06-bonus.md) | Bonus & Extensions | Open-ended feature ideas and extra Copilot experiments |

## 🧰 Choose your setup

After completing **Start in 3 steps** above:

- **VS Code track**
  - Clone your repo and open it in VS Code.
  - Use Chat, Plan Mode, Agent Mode, and editor-native review loops.
- **CLI track**
  - Clone your repo locally and install `copilot`.
  - Use `/plan`, `/delegate`, `/fleet`, and `/review` from your terminal.

## Prerequisites

### Shared

- GitHub Copilot (Pro, Business, or Enterprise)
- Git
- Node.js

### VS Code track

- VS Code v1.107+
- GitHub Copilot extension signed in

### CLI track

- GitHub Copilot CLI (`copilot`)
- Node.js 22+ if you plan to install the CLI via `npm install -g @github/copilot`
- Or Homebrew / WinGet if you prefer a native package manager install

## Technology Stack

- **Framework**: [Astro](https://astro.build/) v6
- **Runtime**: Node.js with [@astrojs/node](https://docs.astro.build/en/guides/integrations-guide/node/) adapter
- **UI**: Astro components with server-rendered-first progressive enhancement
- **API**: GitHub REST API for public profile, repository, and activity data

## ▶️ Run locally

```bash
npm ci
npm run dev
```

Open the dev server and try a few usernames. The page works with normal server-rendered form submissions and upgrades to a faster in-page update flow when JavaScript is available.

## UI testing

Run the Playwright browser smoke tests with:

```bash
npm run test:ui
```

The current suite covers the main Signal Card flow, error states, and the no-JavaScript server-rendered fallback.

For Playwright UI mode, use:

```bash
npm run test:ui:debug
```

In Codespaces, Playwright UI runs as its own tool window and browser automation session rather than driving the page already open in the embedded browser.

## Optional environment variable

GitHub's unauthenticated API limit is modest. For heavier demos or repeated testing, set a token:

```bash
export GITHUB_TOKEN=your_token_here
```

The app works without a token, but authenticated requests get a much higher rate limit.

## Deployment Notes

### Current GitHub Pages setup

The workflow in `.github/workflows/deploy.yml` currently deploys static workshop/docs content from `docs/` and `workshop/` to GitHub Pages. It does not build or deploy the Astro app from `src/`.

### If you want to deploy the Astro app to GitHub Pages

GitHub Pages is static hosting, so the Astro app should use static output.

1. Change `output` in `astro.config.mjs` from `server` to `static`.
2. Remove the Node adapter (`@astrojs/node`) from `astro.config.mjs` and `package.json`.
3. Update the GitHub Actions workflow to run `npm ci` and `npm run build`, then upload `dist/` as the Pages artifact.
4. If deploying to a project page (`https://<user>.github.io/<repo>/`), set `site` and `base` in `astro.config.mjs`.

If you plan to keep the profile lookup API route running in production, use a server platform instead of GitHub Pages (for example, Vercel, Netlify, or a Node host).

## License

MIT

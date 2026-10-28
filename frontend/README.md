# AURA Grant Console (frontend)

React 19 + Vite console for the apniLeap AURA research grant system. See the [project README](../README.md) for architecture, the eight agents and the 14-lab mapping.

```bash
npm install
npm run dev     # http://localhost:5173 (proxy: /api → http://127.0.0.1:5000)
npm run build   # emits dist/, served by the backend at http://localhost:5000
```

Structure:

- `src/App.jsx` — shell, hash routing, actor context
- `src/pages/aura-*.jsx` — one file per screen (namespaced so unrelated same-named files cannot clash)
- `src/pages/runTabsA.jsx`, `runTabsB.jsx` — run detail tabs
- `src/components/ui.jsx`, `icons.jsx` — design-system primitives
- `src/lib/api.js`, `format.js` — API client and formatters
- `src/index.css` — design tokens and layout

The console expects the backend on port 5000 and selects the acting user through the top-right actor switcher (`x-actor-id` header).

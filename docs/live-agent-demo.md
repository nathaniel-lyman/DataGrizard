# Live agent demo

Run the video-ready demo with the existing `OPENAI_API_KEY` in your shell:

```bash
npm run dev
```

Open `http://127.0.0.1:5173`, keep the grid in **Client** mode, and use **Ask
live agent**. The default prompt is a reliable first take: it reads the live
grid, plans a Grocery view update, validates and applies it, then summarizes
the resulting evidence. The tool trace appears underneath the prompt so the
video can show the actual orchestration path.

The browser never receives the API key. Vite's local-only middleware calls the
Responses API, while the browser executes returned tool calls exclusively
through `createDataGridAgentToolkit`. That preserves the configured operation,
scope, column, row, and cell limits; mutations remain `plan -> validate ->
apply` transactions.

Set `OPENAI_MODEL` before starting Vite to override the demo default
(`gpt-5.6-luna`). The endpoint exists only in the Vite dev server; it is not
included in the production static build.

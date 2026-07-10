import { useMemo, useRef, useState } from "react";
import {
  createDataGridAgentToolkit,
  type DataGridApi,
} from "./components/DataGrid";
import type { RetailItem } from "./data/mockRetailData";
import { AssistantDemo } from "./demo/AssistantDemo";
import { RetailGridDemo } from "./demo/RetailGridDemo";

type Recipe = "analyst" | "agent" | "pivot" | "server" | "responsive";

const recipes: { id: Recipe; label: string; description: string }[] = [
  { id: "analyst", label: "Analyst", description: "Full client-side analysis" },
  { id: "agent", label: "Agent", description: "Typed tools and evidence" },
  { id: "pivot", label: "Pivot", description: "Grouped retail rollups" },
  { id: "server", label: "Server", description: "Remote query state" },
  { id: "responsive", label: "Responsive", description: "Card presentation" },
];

function createToolkit(api: React.RefObject<DataGridApi<RetailItem> | null>) {
  return createDataGridAgentToolkit({
    api,
    policy: {
      operations: [
        "get_context",
        "query_rows",
        "aggregate",
        "set_column_visibility",
        "set_sorting",
        "set_global_filter",
        "set_column_filters",
        "set_pagination",
        "set_row_selection",
        "set_selected_columns",
        "set_cell_selection",
        "set_column_presentation",
        "set_grouping",
        "undo",
      ],
      scopes: ["all", "filtered", "selected_rows", "visible_page"],
    },
    limits: { maxRowsPerQuery: 100, maxCellsPerQuery: 2_000 },
  });
}

function EverydaySection() {
  return (
    <section id="everyday" className="showcase-section" aria-labelledby="everyday-title">
      <div className="showcase-section-heading">
        <div className="showcase-intro">
          <p className="showcase-eyebrow">Everyday analysis</p>
          <h2 id="everyday-title">Find the decision, not the control.</h2>
          <p>
            Search, typed filters, sorting, summaries, visual signals, saved views, and row
            actions work together so an analyst can move from a broad assortment to a clear
            recommendation without leaving the grid.
          </p>
        </div>
        <p className="showcase-aside">
          This bounded assortment keeps the interaction readable. Sales color, unit bars,
          margin progress, price-gap signals, and status actions all come from column config.
        </p>
      </div>
      <div className="showcase-grid-shell showcase-grid-shell--standard">
        <RetailGridDemo
          rowLimit={36}
          storageKey="showcase-everyday"
          tableLabel="Everyday retail analysis"
        />
      </div>
    </section>
  );
}

function AgentSection() {
  const api = useRef<DataGridApi<RetailItem> | null>(null);
  const toolkit = useMemo(() => createToolkit(api), []);

  return (
    <section id="agent" className="showcase-section showcase-section--agent" aria-labelledby="agent-title">
      <div className="showcase-section-heading">
        <div className="showcase-intro">
          <p className="showcase-eyebrow">Agent-controlled analysis</p>
          <h2 id="agent-title">Let agents act. Keep the proof.</h2>
          <p>
            A model receives tools generated from the mounted grid, while the grid enforces
            policy, validates state changes, and returns bounded evidence instead of an opaque
            answer.
          </p>
        </div>
        <ol className="agent-sequence" aria-label="Agent workflow">
          <li>Prompt</li><li>Typed tools</li><li>Visible changes</li><li>Evidence</li><li>Receipt</li><li>Undo</li>
        </ol>
      </div>
      <div className="showcase-agent-workspace">
        <AssistantDemo toolkit={toolkit} />
        <div className="showcase-grid-shell showcase-grid-shell--agent">
          <RetailGridDemo
            apiRef={api}
            rowLimit={80}
            storageKey="showcase-agent"
            tableLabel="Agent-controlled retail analysis"
          />
        </div>
      </div>
    </section>
  );
}

function PivotSection() {
  return (
    <section id="pivot" className="showcase-section" aria-labelledby="pivot-title">
      <div className="showcase-section-heading">
        <div className="showcase-intro showcase-intro--pivot">
          <p className="showcase-eyebrow">Pivot analysis</p>
          <h2 id="pivot-title">Roll up the business without flattening the meaning.</h2>
          <p>
            Department → Category opens in a calm, collapsed hierarchy with subtotals and a
            grand total. Expand into source rows when the aggregate needs an explanation.
          </p>
        </div>
        <p className="showcase-aside showcase-aside--formula">
          <strong>Margin stays truthful.</strong><br />
          Σ(sales × margin rate) / Σ(sales)
        </p>
      </div>
      <div className="showcase-grid-shell showcase-grid-shell--pivot">
        <RetailGridDemo
          layoutMode="pivot"
          rowLimit={144}
          storageKey="showcase-pivot"
          tableLabel="Department and category pivot analysis"
        />
      </div>
      <p className="showcase-footnote">
        Sales, Units, Margin, Price Gap, and Status are explicit measures—not generated
        spreadsheet labels. Group expansion retains drill-through and source-row semantics.
      </p>
    </section>
  );
}

function ServerSection() {
  return (
    <section id="server" className="showcase-section" aria-labelledby="server-title">
      <div className="showcase-section-heading">
        <div className="showcase-intro">
          <p className="showcase-eyebrow">Server-scale analysis</p>
          <h2 id="server-title">A loaded page is not the dataset.</h2>
          <p>
            Sorting, filtering, search, and pagination round-trip to the server with loading and
            total-row state. A separate <code>serverAnalysis</code> adapter handles bounded
            complete-dataset queries and aggregates with the same receipt shape.
          </p>
        </div>
        <div className="truth-boundary">
          <span>Truth boundary</span>
          <strong>Page rows ≠ all rows</strong>
          <p>500 total rows remain explicit while only the requested page is mounted.</p>
        </div>
      </div>
      <div className="showcase-grid-shell showcase-grid-shell--server">
        <RetailGridDemo
          dataMode="server"
          storageKey="showcase-server"
          tableLabel="Server-backed retail analysis"
        />
      </div>
    </section>
  );
}

function ResponsiveSection() {
  const [dark, setDark] = useState(false);
  return (
    <section id="responsive" className="showcase-section" aria-labelledby="responsive-title">
      <div className="showcase-section-heading">
        <div className="showcase-intro">
          <p className="showcase-eyebrow">Responsive cards and themes</p>
          <h2 id="responsive-title">The same surface, composed for the container.</h2>
          <p>
            Card mode preserves search, filters, sorting, summaries, visual metrics, and detail
            semantics in narrow spaces. It is a presentation of the grid—not a second component.
          </p>
        </div>
        <button
          type="button"
          className="showcase-theme-button"
          aria-pressed={dark}
          onClick={() => setDark((value) => !value)}
        >
          {dark ? "Use light theme" : "Use dark theme"}
        </button>
      </div>
      <div className="responsive-stage">
        <div className="responsive-stage-label">
          <span>Narrow container</span><span>Card presentation</span>
        </div>
        <div className="responsive-grid-frame">
          <RetailGridDemo
            cardMode="cards"
            isDark={dark}
            rowLimit={8}
            storageKey="showcase-responsive"
            tableLabel="Responsive retail cards"
          />
        </div>
      </div>
    </section>
  );
}

function Playground() {
  const [recipe, setRecipe] = useState<Recipe>("analyst");
  const [dark, setDark] = useState(false);
  const api = useRef<DataGridApi<RetailItem> | null>(null);
  const toolkit = useMemo(() => createToolkit(api), []);
  const active = recipes.find((item) => item.id === recipe) ?? recipes[0];

  return (
    <section id="playground" className="showcase-section playground" aria-labelledby="playground-title">
      <div className="showcase-section-heading">
        <div className="showcase-intro">
          <p className="showcase-eyebrow">Full playground</p>
          <h2 id="playground-title">One surface. Five coherent recipes.</h2>
          <p>
            Use the exhaustive workbench after the focused examples. Each recipe resets the grid
            into a purposeful configuration while keeping its persistence scope isolated.
          </p>
        </div>
        <button
          type="button"
          className="showcase-theme-button"
          aria-pressed={dark}
          onClick={() => setDark((value) => !value)}
        >
          Playground theme: {dark ? "Dark" : "Light"}
        </button>
      </div>
      <div className="recipe-bar" role="tablist" aria-label="Playground recipes">
        {recipes.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={recipe === item.id}
            aria-controls="playground-panel"
            id={`recipe-${item.id}`}
            onClick={() => setRecipe(item.id)}
          >
            <strong>{item.label}</strong><span>{item.description}</span>
          </button>
        ))}
      </div>
      <div
        id="playground-panel"
        role="tabpanel"
        aria-labelledby={`recipe-${recipe}`}
        className="playground-panel"
      >
        <div className="playground-status">
          <span>Active recipe</span><strong>{active.label}</strong><p>{active.description}</p>
        </div>
        {recipe === "agent" ? <AssistantDemo toolkit={toolkit} /> : null}
        <div className={`showcase-grid-shell showcase-grid-shell--playground ${recipe === "responsive" ? "showcase-grid-shell--narrow" : ""}`}>
          <RetailGridDemo
            key={recipe}
            apiRef={api}
            cardMode={recipe === "responsive" ? "cards" : "table"}
            dataMode={recipe === "server" ? "server" : "client"}
            isDark={dark}
            layoutMode={recipe === "pivot" ? "pivot" : "grid"}
            rowLimit={500}
            storageKey={`playground-${recipe}`}
            tableLabel={`${active.label} playground`}
            virtualizeRows={recipe === "analyst" || recipe === "agent"}
          />
        </div>
      </div>
    </section>
  );
}

function App() {
  return (
    <div className="showcase-page">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="site-header">
        <a className="wordmark" href="#top" aria-label="DataGrizard home">
          <span aria-hidden="true">DG</span>DataGrizard
        </a>
        <nav aria-label="Primary navigation">
          <a href="#everyday">Demos</a>
          <a href="#agent">Agents</a>
          <a href="#playground">Playground</a>
        </nav>
        <a className="header-cta" href="#playground">Open playground</a>
      </header>

      <main id="main-content">
        <section id="top" className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="showcase-eyebrow">The React DataGrid for shared control</p>
            <h1 id="hero-title">An analytical control plane for people and agents.</h1>
            <p className="hero-lede">
              One typed grid state connects human analysis, application control, imperative APIs,
              and governed agent tools—so every change is visible and every answer can show its work.
            </p>
            <div className="hero-actions">
              <a className="primary-action" href="#everyday">Explore demos</a>
              <a className="text-action" href="#playground">Open playground <span aria-hidden="true">→</span></a>
            </div>
          </div>
          <div className="hero-proof" aria-label="Product capabilities">
            <p>One typed surface</p>
            <ul>
              <li><span>01</span>Grid and pivot layouts</li>
              <li><span>02</span>Client and server data</li>
              <li><span>03</span>Typed agent tools</li>
              <li><span>04</span>Transactional changes and undo</li>
              <li><span>05</span>Evidence-backed analysis</li>
            </ul>
          </div>
        </section>

        <div className="showcase-divider" aria-hidden="true"><span>Typed state</span><span>Visible action</span><span>Verifiable result</span></div>
        <EverydaySection />
        <AgentSection />
        <PivotSection />
        <ServerSection />
        <ResponsiveSection />
        <Playground />
      </main>

      <footer className="site-footer">
        <div><strong>DataGrizard</strong><p>A domain-neutral analytical surface for React.</p></div>
        <a href="#top">Back to top ↑</a>
      </footer>
    </div>
  );
}

export default App;

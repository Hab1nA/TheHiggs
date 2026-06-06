# Vibe UI Runtime — AUIR (AI User Interface Runtime)

An LLM-driven semantic UI runtime demo.

**This project does not execute AI-generated code.**  
The LLM only returns constrained JSON UI states.  
The frontend is a renderer for a semantic UI protocol.

## Concept

```
User Event
  ↓
Frontend captures structured event
  ↓
Backend AI receives previous UI + memory + event
  ↓
AI generates next UI state (JSON, not code)
  ↓
Frontend validates and renders next UI
  ↓
Repeat
```

The core insight: **applications are no longer defined by static business code, but by a UI protocol, an event protocol, a memory system, and an LLM state transition function.**

## Tech Stack

- **Next.js 14** (App Router)
- **TypeScript**
- **React 18**
- **Tailwind CSS 3**
- **Zod** (runtime validation)
- **OpenAI API** (or compatible, optional)

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

For **mock mode** (no API key needed):

```env
NEXT_PUBLIC_RUNTIME_MODE=mock
```

For **real LLM mode**:

```env
OPENAI_API_KEY=sk-your-key-here
OPENAI_MODEL=gpt-4.1
NEXT_PUBLIC_RUNTIME_MODE=llm
```

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 4. Try It

Type a description like:

```
rocket engine cycle analyzer
```

The AI will generate a complete engineering dashboard UI — without writing any code.

## AUIR Protocol

AUIR consists of three languages:

1. **UI Description Language** — Describes what's on screen (JSON AST)
2. **UI Event Language** — Describes what the user did
3. **UI Memory Language** — What the app and session remember

Every round-trip between frontend and backend uses AUIR Request/Response.

## Supported UI Components

| Component | Description |
|-----------|-------------|
| `screen` | Top-level page |
| `container` | Flex/Grid layout |
| `panel` | Card with title |
| `heading` | h1–h4 |
| `text` | Paragraph with tone |
| `button` | Clickable with intent |
| `text_input` | Text field with binding |
| `number_input` | Number field with unit |
| `textarea` | Multi-line text |
| `select` | Dropdown |
| `checkbox` | Toggle |
| `slider` | Range input |
| `table` | Data table |
| `metric` | KPI display with confidence |
| `alert` | Info/warning/danger banner |
| `tabs` | Tabbed interface |
| `modal` | Overlay dialog |
| `code_block` | Code display |
| `chart_bar` | Bar chart |
| `chart_line` | Line chart (SVG) |

## Security Boundaries

- ❌ No AI-generated code execution
- ❌ No `dangerouslySetInnerHTML`
- ❌ No HTML/JSX from AI rendered directly
- ❌ No real shell command execution
- ❌ No real file system access
- ❌ No real network browser proxy
- ❌ No simulated data treated as real
- ✅ All AI output validated by Zod
- ✅ All components from `allowedComponents`
- ✅ Text length, node count, depth all bounded

## Memory System

Four memory layers:

| Layer | Scope | Persistence |
|-------|-------|-------------|
| Turn | Current event context | Ephemeral |
| Session | Continuous interaction | In-memory |
| App | AI-generated app state | In-memory (marked simulated) |
| User | Long-term preferences | Mock (MVP) |

**Key rule:** AI-generated simulated data is stored in `app` memory and marked `simulated`. It is NEVER written to user memory as factual data.

## Mock Mode

When no `OPENAI_API_KEY` is set, the runtime uses a built-in mock AI that:

- Generates a rocket engine cycle analyzer dashboard
- Responds to parameter changes with recalculated metrics
- Provides a cycle comparison table and chart
- Preserves user inputs across interactions

## Project Structure

```
vibe-ui-runtime/
  app/
    page.tsx              # Main entry point
    layout.tsx            # Root layout
    globals.css           # Tailwind imports
    api/
      ai-ui/
        route.ts          # POST /api/ai-ui
  src/
    auir/
      types.ts            # Core TypeScript types
      schema.ts           # Zod schemas + constraints + fallback
      memory.ts           # Memory patch application
      prompt.ts           # System prompt + user prompt builder
      validate.ts         # Schema validation helpers
      mock.ts             # Mock AI runtime
    runtime/
      Renderer.tsx        # Recursive UI node renderer
      event.ts            # Event factory functions
      client.ts           # API client (fetch wrapper)
    components/
      Shell.tsx           # App shell (header + layout)
      SearchLauncher.tsx  # Initial search interface
      LoadingOverlay.tsx  # Loading spinner
      ErrorPanel.tsx      # Error display with retry
  .env.example
  package.json
```

## License

MIT

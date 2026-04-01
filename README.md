# SAP Graph Explorer — Order-to-Cash Analytics

A **graph-based data modeling and query system** that unifies fragmented SAP Order-to-Cash data into an interactive graph with an LLM-powered natural language query interface.

![SAP Graph Explorer](https://img.shields.io/badge/Next.js-14-black?logo=next.js) ![SQLite](https://img.shields.io/badge/SQLite-3-blue?logo=sqlite) ![LLM](https://img.shields.io/badge/LLM-Gemini%20%7C%20Groq%20%7C%20OpenRouter-green)

## 🚀 Features

- **Graph Visualization** — Interactive force-directed graph with 756+ nodes and 760+ edges
- **Natural Language Queries** — Ask questions in plain English, get data-backed answers
- **NL → SQL Translation** — LLM converts questions to SQL queries dynamically
- **Graph Exploration** — Click nodes to inspect metadata, view relationships
- **Query Guardrails** — Restricts queries to the SAP O2C domain only
- **Node Highlighting** — Query results highlight relevant nodes on the graph
- **Conversation Memory** — Chat context maintained across multiple queries
- **Responsive Design** — Premium dark theme with glassmorphism effects

## 🏗 Architecture

```
┌─────────────────────────────────────────────────┐
│                    Frontend                      │
│  ┌──────────────────┐  ┌──────────────────────┐ │
│  │  Force-Directed   │  │   Chat Interface     │ │
│  │  Graph (Canvas)   │  │   (React)            │ │
│  └────────┬─────────┘  └──────────┬───────────┘ │
├───────────┼────────────────────────┼─────────────┤
│           │   Next.js API Routes   │             │
│  ┌────────▼─────────┐  ┌──────────▼───────────┐ │
│  │  GET /api/graph   │  │  POST /api/chat      │ │
│  │  (Graph Builder)  │  │  (NL→SQL Pipeline)   │ │
│  └────────┬─────────┘  └──────────┬───────────┘ │
├───────────┼────────────────────────┼─────────────┤
│  ┌────────▼────────────────────────▼───────────┐ │
│  │              SQLite Database                 │ │
│  │  16 tables • 1,527 rows • Indexed           │ │
│  └──────────────────────────────────────────────┘ │
│  ┌──────────────────────────────────────────────┐ │
│  │              LLM Provider                    │ │
│  │  Gemini / Groq / OpenRouter                  │ │
│  └──────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

## 📊 Database Design

**Why SQLite?**
- Zero configuration — no external database server needed
- Portable — single file (`sap_graph.db`) ships with the project
- Fast reads — perfect for the analytical query pattern
- Full SQL support — enables complex JOINs and subqueries for the LLM

**Schema: 19 tables covering the full O2C lifecycle:**

| Table | Records | Description |
|-------|---------|-------------|
| `sales_order_headers` | 100 | Sales orders with status, amounts, dates |
| `sales_order_items` | 167 | Line items with material, quantity, plant |
| `outbound_delivery_headers` | 86 | Delivery documents with shipping info |
| `outbound_delivery_items` | 137 | Delivery line items linked to sales orders |
| `billing_document_headers` | 163 | Invoices/billing documents |
| `billing_document_items` | 245 | Billing line items |
| `billing_document_cancellations` | 80 | Cancelled billing documents |
| `journal_entry_items` | 123 | Accounting journal entries (AR) |
| `payments` | 120 | Payment records (AR) |
| `business_partners` | 8 | Customers |
| `business_partner_addresses` | 8 | Customer addresses |
| `products` | 69 | Materials/Products |
| `product_descriptions` | 69 | Product names |
| `plants` | 44 | Manufacturing/distribution plants |
| `customer_company_assignments` | 8 | Customer-company mappings |
| `customer_sales_area_assignments` | 28 | Customer-sales area mappings |
| `product_plants` | 69 | Product-plant planning data |
| `product_storage_locations` | 85 | Storage location inventory data |
| `sales_order_schedule_lines` | 215 | Delivery schedule lines for order items |

## 🤖 LLM Prompting Strategy

### NL → SQL Translation
The system uses a **two-pass LLM approach**:

1. **Pass 1 — SQL Generation**: The LLM receives the full database schema with column descriptions, key relationships, and example join patterns. It translates natural language into a SQL query.

2. **Pass 2 — Result Summarization**: After executing the SQL, the LLM receives the query results and generates a human-readable answer grounded in the data.

### System Prompt Design
- Full schema context with column descriptions and data types
- Explicit relationship documentation (foreign keys, join paths)
- O2C flow patterns (SO → Delivery → Billing → JE)
- Output format enforcement (structured JSON with `sql`, `explanation`, `isRelevant`)

### Guardrails
1. **Domain restriction**: System prompt instructs the LLM to only answer SAP O2C questions
2. **Relevance flag**: LLM returns `isRelevant: false` for off-topic questions
3. **SQL validation**: Only `SELECT` and `WITH` (CTE) queries are executed — no mutations
4. **Result limiting**: Default LIMIT 50 to prevent excessive data transfer
5. **Conversation memory**: Last 6 messages for context, preventing prompt injection via old messages

## 🛠 Setup & Run

### Prerequisites
- Node.js 18+

### Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Seed the database (reads JSONL files from data/)
npm run seed

# 3. Set up your LLM API key
# Edit .env.local with your key (see providers below)

# 4. Start the dev server
npm run dev

# Open http://localhost:3000
```

### LLM Provider Setup

Choose one provider and add your key to `.env.local`:

| Provider | Set `LLM_PROVIDER` | Get API Key |
|----------|-------------------|-------------|
| Google Gemini | `gemini` | [ai.google.dev](https://ai.google.dev) |
| Groq | `groq` | [console.groq.com](https://console.groq.com) |
| OpenRouter | `openrouter` | [openrouter.ai](https://openrouter.ai) |

## 🧪 Example Queries

- *"Which products are associated with the highest number of billing documents?"*
- *"Trace the full flow: Sales Order → Delivery → Billing → Journal Entry"*
- *"Identify sales orders with broken flows (delivered but not billed)"*
- *"Show me the top customers by total order value"*
- *"Which plants handle the most deliveries?"*

## 📂 Project Structure

```
├── data/sap-o2c-data/     # Raw JSONL dataset (19 entity types)
├── scripts/seed-database.js  # Data ingestion script
├── sap_graph.db            # SQLite database (generated)
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── graph/route.js  # Graph data API
│   │   │   └── chat/route.js   # NL query API
│   │   ├── layout.js          # Root layout
│   │   ├── globals.css        # Design system
│   │   └── page.js            # Main app (graph + chat)
│   └── lib/
│       ├── database.js        # SQLite connection + schema
│       ├── graph-builder.js   # Relational → Graph transform
│       └── llm.js             # Multi-provider LLM client
├── .env.local              # API key config
└── package.json
```

## 🔧 Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Database**: SQLite via `better-sqlite3`
- **Graph**: Custom canvas-based force-directed simulation
- **LLM**: Google Gemini / Groq / OpenRouter (configurable)
- **Styling**: Vanilla CSS with dark theme design system
- **No external graph library** — pure canvas rendering for performance

## 📝 Development Process

Built with an AI-assisted development workflow, leveraging **Gemini Code Assist** and **GitHub Copilot** in VS Code for code generation, debugging, and rapid prototyping. All architectural decisions, schema design, LLM prompting strategy, and system integration were driven by the developer — AI tools were used to accelerate implementation and iterate faster. Session logs from the AI-assisted coding sessions are available upon request.

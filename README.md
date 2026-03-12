# Example-Chat-LLM-UI

A simple chat UI built with Go Fiber backend and vanilla HTML/JS frontend, featuring real-time SSE streaming, thinking mode, tool calling, and markdown rendering.

## Features

- **Real-time streaming** via Server-Sent Events (SSE)
- **Thinking mode** — toggle extended reasoning (shows collapsible reasoning block)
- **Markdown rendering** — responses rendered with `marked.js`
- **Tool calling**
  - `get_current_time` — current date & time (Asia/Bangkok)
  - `get_weather` — current weather for any city via [Open-Meteo](https://open-meteo.com/)
- **Confidence score** — heuristic-based score shown after each response
- **Message timestamps**

## Tech Stack

| Layer    | Tech |
|----------|------|
| Backend  | [Go Fiber v2](https://gofiber.io/) |
| Frontend | Vanilla HTML + JS |
| Markdown | [marked.js](https://marked.js.org/) + [DOMPurify](https://github.com/cure53/DOMPurify) |
| Weather  | [Open-Meteo API](https://open-meteo.com/) (free, no key required) |

## Getting Started

### 1. Clone the repo

```bash
git clone https://github.com/<your-username>/Example-Chat-LLM-UI.git
cd Example-Chat-LLM-UI
```

### 2. Configure environment

Copy and fill in your values:

```bash
cp .env.example .env
```

```env
API_KEY=your_api_key_here
API_URL=https://provider/chat/completions
MODEL_DEFAULT=Qwen/Qwen3.5-397B-A17B-non_thinking
MODEL_THINKING=Qwen/Qwen3.5-397B-A17B
```

### 3. Install dependencies & run

```bash
go mod tidy
go run main.go
```

Open [http://localhost:3000](http://localhost:3000)

## Project Structure

```
.
├── main.go          # Go Fiber backend + tool execution
├── web/
│   └── index.html   # Chat UI
├── .env             # Environment variables (not committed)
├── .env.example     # Example env file
├── go.mod
└── go.sum
```

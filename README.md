# Humans in AI Week — Booth Experience

> **An open, participatory booth that brings ordinary people into the AI conversation.**
> Built for [Humans in AI Week](https://www.humansinaiweek.com) by The AI Collective.

Most of the decisions shaping AI today are being made by a small number of people, in a small number of rooms, for the entire world. This booth was built to widen that room. In about three minutes per visit, every person at the booth gets to **shape an AI on their own terms**, **vote on the hard calls** AI companies are making this week, **leave a piece of wisdom** that joins a global wall, and watch a real-time analytical report assemble itself across the day.

This is one small contribution to a much larger goal: **make sure the technology of our time advances in step with the humanity it is built to serve**.

---

## What this is

A self-contained, single-server web app you can run on a laptop at any booth, classroom, or community space. It powers **five connected experiences** that turn a passive audience into an active one.

| URL | Experience | Who it's for |
|---|---|---|
| `/visitor` | **Soul Mirror** — visitors pick three values that shape an AI, talk to the AI they shaped, and leave a sentence on the wisdom wall | Everyone |
| `/refuse` | **What Should AI Refuse?** — five real-world calls AI companies are making right now (medical diagnosis, AI as therapist, election messaging, K-12 grading, voice cloning of the deceased) | Everyone |
| `/wall` | **The Wisdom Wall** — a live, real-time backdrop that fills with what everyone wished AI understood about being human | Booth backdrop screen |
| `/guess` + `/staff` | **Spot the AI** — a chat where every reply is either Anthropic Haiku pretending to be human, or a real human staffer pretending to be AI; visitors guess each one | Visitors (`/guess`) and a booth staffer (`/staff`) |
| `/operator` | **Booth Analytics** — a live analytical dashboard with AI-generated narrative, public-vs-industry policy gap charts, demographic splits, a word cloud, a 24h activity sparkline, and a downloadable press kit | Event organizers, researchers |

Every experience runs on the same server. There is no login, no data collection beyond the anonymous booth interactions, and the visitor-facing pages run entirely in the browser over WebSockets.

---

## The argument behind the booth

This project takes a clear position: **AI is going to keep changing — the question is who gets to change it.** The booth makes that question concrete.

- The **Soul Mirror** lets a visitor experience direct agency over an AI's values for the first time, and ends with a "mirror moment" where the AI they shaped reflects those values back at them. The point is not "AI is human-like." The point is *"someone decided AI should sound this way — and right now it's not you."*
- **What Should AI Refuse?** makes the visitor weigh in on five live decisions AI companies are quietly making this week. Each scenario ships with an industry-baseline summary, so the booth can surface — in real time — the gap between public sentiment and current corporate practice.
- **The Wisdom Wall** turns every visit into a small contribution. People type one sentence about what they wish AI understood about being human, and it joins everyone else's on the live screen. By the end of a booth day, the wall is a portrait of a community.
- **Spot the AI** confronts visitors with how quickly the line between human and machine in conversation has dissolved — not as a parlour trick, but as a demonstration that the rules for what AI says are now urgently human decisions.
- **Booth Analytics** turns the day's interactions into a structured, citable artefact that organisers can share with researchers, journalists, and policy folks. The analytics include a downloadable press kit (`.md`) with a headline, lede, methodology, demographic splits, and verbatim wisdom quotes.

---

## Quick start (5 minutes)

Requires **Node.js 20 or newer** and an Anthropic API key.

```bash
# 1. clone
git clone https://github.com/humans-in-ai/humans-in-ai.git
cd humans-in-ai

# 2. install
npm install

# 3. configure
cp .env.example .env
# open .env and set ANTHROPIC_API_KEY=sk-ant-...

# 4. run
npm start
```

Then open the URLs you need in a browser:

```
http://localhost:3000/visitor   ← visitors shape an AI
http://localhost:3000/refuse    ← visitors vote on hard calls
http://localhost:3000/wall      ← booth backdrop screen
http://localhost:3000/guess     ← visitors play "Spot the AI"
http://localhost:3000/staff     ← staff respond as the human-pretending-to-be-AI
http://localhost:3000/operator  ← live analytics + press kit
```

That's it — no build step, no database setup. SQLite (`booth.db`) is created automatically on first run and is gitignored, so each environment has its own clean booth-day data.

---

## Configuration

All settings live in `.env`. Defaults are sensible; you only need the API key.

```bash
ANTHROPIC_API_KEY=sk-ant-...           # required — your Anthropic key
PORT=3000                              # web server port
HAIKU_MODEL=claude-haiku-4-5           # the model used for AI replies and analytics

# Soul Mirror
TURNS_PER_SESSION=3                    # number of chat turns with the user's shaped AI

# Spot the AI
GUESS_TURNS=6                          # number of conversation rounds in the guess game
GUESS_OPERATOR_TIMEOUT_MS=8000         # if no human staffer claims a turn within this window, AI takes over
```

---

## How a booth day looks

A typical setup uses **two or three kiosks** plus an optional backdrop screen:

```
┌────────────────────────┐ ┌────────────────────────┐ ┌────────────────────────┐
│   Visitor kiosk #1     │ │   Visitor kiosk #2     │ │   Booth staff laptop   │
│  /visitor or /refuse   │ │  /visitor or /refuse   │ │   /staff (for /guess)  │
│  or /guess             │ │  or /guess             │ │   /operator (analytics)│
└────────────────────────┘ └────────────────────────┘ └────────────────────────┘
                                                                     │
                                                                     ▼
                                                  ┌────────────────────────────┐
                                                  │   Backdrop screen on /wall │
                                                  │   (the live wisdom wall)   │
                                                  └────────────────────────────┘
```

Visitors flow through one experience at a time. Multiple staff can join `/staff` simultaneously — first to claim each `Spot the AI` request wins. If staff step away, AI silently takes over within 8 seconds so visitors never hang.

---

## Architecture

A deliberately small stack so any chapter can run it from a laptop.

- **Node.js 20+** with **Express** for HTTP
- **Socket.IO** for the live, real-time interactions (chat, wall, queue, guess)
- **`@anthropic-ai/sdk`** for AI replies (Haiku 4.5) and for the AI-generated analytics narrative on `/operator`
- **better-sqlite3** for booth-day persistence — a single file, zero config
- **No frontend framework** — plain HTML, vanilla JS, hand-rolled SVG/CSS for charts (word cloud, radar, heatmap, donut, sparkline)

```
.
├── server.js          ← single-file Express + Socket.IO server
├── db.js              ← SQLite schema + helpers (Soul Mirror, votes, wisdom, Spot the AI)
├── public/
│   ├── visitor.html / .js   ← Soul Mirror
│   ├── refuse.html  / .js   ← What Should AI Refuse?
│   ├── wall.html    / .js   ← The Wisdom Wall
│   ├── guess.html   / .js   ← Spot the AI — visitor terminal
│   ├── staff.html   / .js   ← Spot the AI — staff terminal
│   ├── operator.html/ .js   ← Booth Analytics
│   └── styles.css
├── package.json
└── .env.example
```

Two design choices worth knowing:

1. **Spot the AI lives in its own SQLite tables (`tt_*`)** so it doesn't pollute the analytics on `/operator`. The two experiences are intentionally isolated.
2. **The press kit on `/operator`** is generated by a single Haiku call against the day's aggregate data plus the verbatim wisdom list, then cached for 5 minutes. A `↓ download press kit (.md)` button serves a journalism-ready Markdown file with a headline, subhead, lede, numbered findings, methodology line, demographic split, and quotable wisdom.

---

## Privacy & data handling

- The booth is **anonymous**. No name, no email, no account.
- All data lives in a single local SQLite file (`booth.db`) on the machine running the server. Nothing is uploaded anywhere except what the server sends to Anthropic to generate AI replies and the analytics narrative.
- The optional demographic question (*"Which sounds most like you?"*) captures only a coarse self-id bucket — it is voluntary, has a skip option, and is shown only as part of the aggregate.
- The Wisdom Wall displays submissions verbatim. Operators may want to add a moderation pass before public-facing displays.
- Delete `booth.db` between events to reset all data.

---

## Adapting it for your own venue

The booth is a starting point, not a fixed product. If you adapt it:

- **Edit the five refuse scenarios** in `server.js` (`SCENARIOS` constant) to reflect the conversations most relevant to your community.
- **Edit the industry baselines** (`INDUSTRY_BASELINES`) so the public-vs-industry gap chart compares against current, defensible facts.
- **Edit the soul opening questions** (`SOUL_OPENINGS`) to fit the language and tone of your audience.
- **Edit the takeaway copy** in `public/visitor.html` (the reveal block) to match the voice of your event.

PRs welcome.

---

## Contributing

Issues and PRs are welcome from anyone — booth organisers, developers, researchers, designers, or curious humans. There are several ways to help:

- **Report a bug** — open an issue with steps to reproduce.
- **Improve a question** — open a PR adjusting `SCENARIOS` or `INDUSTRY_BASELINES`.
- **Add a language** — i18n contributions are very welcome.
- **Run the booth at your event** — and let us know how it went. Findings from independent deployments make the analytics richer.

Please keep changes simple and well-scoped. The codebase intentionally has no build step and no frontend framework so anyone can read it end-to-end.

---

## License

MIT. See [`LICENSE`](./LICENSE).

---

## Acknowledgements

Built for [The AI Collective](https://www.aicollective.com) — a global non-profit and the largest grassroots AI community in the world (250,000+ members, 250+ chapters, 55+ countries) — and for the **Humans in AI Week** initiative running June 1–8, 2026 across 100+ cities.

The conviction that motivated this project, in AIC's own words:

> *"AI will either be the greatest democratizing force in human history, or it will deepen every inequality that has ever existed. Which of those it becomes is not predetermined. It is a choice."*

This codebase is a small, public attempt to put that choice into more hands.

---

**Pledge your voice** → [humansinaiweek.com](https://www.humansinaiweek.com)

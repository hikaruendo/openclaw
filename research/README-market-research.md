# Market Research Workflow

## 1) Setup

Set API key in your shell or `.env`:

```bash
export BRAVE_API_KEY="your_key_here"
```

Optional (for Asana task creation):

```bash
export ASANA_ACCESS_TOKEN="your_asana_pat"
export ASANA_PROJECT_GID="your_project_gid"
```

## 2) Run research

```bash
python3 automation/market_research.py "AI automation tools" \
  --out research/ai-automation-market.md
```

## 3) Run + create Asana task

```bash
python3 automation/market_research.py "AI automation tools" \
  --out research/ai-automation-market.md \
  --create-asana
```

## Output

- Markdown report with:
  - competitor landscape
  - pricing model signals
  - market gaps/opportunities
  - source links
- JSON summary in stdout

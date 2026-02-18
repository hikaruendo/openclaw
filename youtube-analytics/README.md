# YouTube Analytics Auto Tracker

This implements:
1. YouTube Analytics API setup flow
2. SQLite database for videos + daily stats
3. Collection script for all channel videos
4. Daily automation at 6:00 AM (macOS LaunchAgent)
5. Query interface for top videos / weekly views / engagement

---

## 1) API setup (Google Cloud)

1. Create/select Google Cloud project.
2. Enable APIs:
   - **YouTube Data API v3**
   - **YouTube Analytics API**
3. Configure OAuth consent screen (External is fine for personal use).
4. Create OAuth Client ID (Desktop app).
5. Download JSON and place it as:
   - `youtube-analytics/client_secret.json`

Scopes used:
- `https://www.googleapis.com/auth/yt-analytics.readonly`
- `https://www.googleapis.com/auth/youtube.readonly`

---

## 2) Install

```bash
cd /Users/hikaruendo/Projects/openclaw/youtube-analytics
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Edit `.env` as needed.

---

## 3) Database schema

Created automatically in SQLite (`YTA_DB_PATH`, default `youtube_analytics.db`):

- `videos`
  - `video_id` (PK)
  - `title`
  - `published_at`
  - `channel_id`
- `daily_video_stats`
  - `video_id` + `stat_date` unique
  - `views`, `likes`, `comments`
  - `estimated_minutes_watched`, `average_view_duration`
  - `subscribers_gained`, `subscribers_lost`

---

## 4) Run collector

```bash
cd /Users/hikaruendo/Projects/openclaw/youtube-analytics
source .venv/bin/activate
./run_collect.sh
```

First run opens browser for OAuth approval and writes `token.json`.

### Range options

You can collect by explicit date range:

```bash
python3 yta_collect.py --env-file .env --start-date 2026-01-01 --end-date 2026-02-17
```

Or by preset range:

```bash
python3 yta_collect.py --env-file .env --range last7
python3 yta_collect.py --env-file .env --range last30
python3 yta_collect.py --env-file .env --range last90
python3 yta_collect.py --env-file .env --range last365
python3 yta_collect.py --env-file .env --range mtd
python3 yta_collect.py --env-file .env --range ytd
```

### Lifetime mode (total)

```bash
python3 yta_collect.py --env-file .env --lifetime
```

`--lifetime` does two things:

1. Collects daily analytics over a lifetime range (`2005-02-14` to today) and upserts into SQLite.
2. Adds **`lifetime_totals`** in output JSON using YouTube Data API video statistics (total views/likes/comments).

### Output JSON fields

Collector output now includes:

- `range.mode` (`custom`, `last7`, `last30`, `last90`, `last365`, `mtd`, `ytd`, `lifetime`)
- `period_totals` (sum within collected range from `daily_video_stats`)
- `lifetime_totals` (only when `--lifetime` is used)

Example:

```json
{
  "ok": true,
  "range": {"mode": "last30", "start": "2026-01-19", "end": "2026-02-18"},
  "period_totals": {
    "views": 65,
    "likes": 3,
    "comments": 0,
    "estimated_minutes_watched": 8,
    "net_subscribers": 0
  },
  "lifetime_totals": null
}
```

`run_collect.sh` also forwards args now, so these work too:

```bash
./run_collect.sh --range last30
./run_collect.sh --lifetime
```

---

## 5) Daily automation at 6:00 AM

```bash
cd /Users/hikaruendo/Projects/openclaw/youtube-analytics
./install_daily_6am.sh
```

Logs:
- `youtube-analytics/logs/daily.out.log`
- `youtube-analytics/logs/daily.err.log`

---

## 6) Query interface

### Top 10 performing videos this month
```bash
python3 yta_query.py top10-month --env-file .env
```

### Total view count for the past week
```bash
python3 yta_query.py views-week --env-file .env
```

### Highest engagement rate videos (this month)
```bash
python3 yta_query.py engagement --env-file .env --limit 10
```

Engagement rate = `(likes + comments) / views * 100`

---

## Notes

- If your channel has many videos (e.g. 900+), first run can take time.
- Keep `.env`, `token.json`, and `client_secret.json` out of git.
- For production-hardening, add retries/backoff around Google API calls.

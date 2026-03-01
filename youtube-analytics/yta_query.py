#!/usr/bin/env python3
import argparse
import datetime as dt
import os
import sqlite3
from pathlib import Path


def load_env(path: str = ".env"):
    if not Path(path).exists():
        return
    for line in Path(path).read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())


def conn(db_path: str):
    c = sqlite3.connect(db_path)
    c.row_factory = sqlite3.Row
    return c


def month_range(today=None):
    today = today or dt.date.today()
    start = today.replace(day=1)
    end = today
    return start.isoformat(), end.isoformat()


def week_range(today=None):
    today = today or dt.date.today()
    start = today - dt.timedelta(days=6)
    return start.isoformat(), today.isoformat()


def top10_month(c):
    start, end = month_range()
    q = """
    SELECT v.video_id, v.title, SUM(s.views) AS views, SUM(s.likes) AS likes, SUM(s.comments) AS comments
    FROM daily_video_stats s
    JOIN videos v ON v.video_id = s.video_id
    WHERE s.stat_date BETWEEN ? AND ?
    GROUP BY v.video_id, v.title
    ORDER BY views DESC
    LIMIT 10
    """
    return c.execute(q, (start, end)).fetchall(), start, end


def total_views_week(c):
    start, end = week_range()
    q = "SELECT COALESCE(SUM(views),0) AS total_views FROM daily_video_stats WHERE stat_date BETWEEN ? AND ?"
    r = c.execute(q, (start, end)).fetchone()
    return r["total_views"], start, end


def highest_engagement(c, limit=10):
    start, end = month_range()
    q = """
    SELECT v.video_id, v.title,
           SUM(s.views) AS views,
           SUM(s.likes) AS likes,
           SUM(s.comments) AS comments,
           CASE WHEN SUM(s.views)=0 THEN 0
                ELSE ROUND((SUM(s.likes)+SUM(s.comments))*100.0/SUM(s.views), 2)
           END AS engagement_rate_pct
    FROM daily_video_stats s
    JOIN videos v ON v.video_id = s.video_id
    WHERE s.stat_date BETWEEN ? AND ?
    GROUP BY v.video_id, v.title
    ORDER BY engagement_rate_pct DESC, views DESC
    LIMIT ?
    """
    return c.execute(q, (start, end, limit)).fetchall(), start, end


def main():
    p = argparse.ArgumentParser(description="YouTube Analytics query tool")
    p.add_argument("query", choices=["top10-month", "views-week", "engagement"])
    p.add_argument("--env-file", default=".env")
    p.add_argument("--db-path", default="")
    p.add_argument("--limit", type=int, default=10)
    args = p.parse_args()

    load_env(args.env_file)
    db_path = args.db_path or os.getenv("YTA_DB_PATH", "youtube_analytics.db")

    c = conn(db_path)

    if args.query == "top10-month":
        rows, start, end = top10_month(c)
        print(f"Top 10 videos this month ({start}..{end})")
        for i, r in enumerate(rows, 1):
            print(f"{i:2d}. {r['title']} ({r['video_id']}) | views={r['views']} likes={r['likes']} comments={r['comments']}")

    elif args.query == "views-week":
        total, start, end = total_views_week(c)
        print(f"Total views past week ({start}..{end}): {total}")

    elif args.query == "engagement":
        rows, start, end = highest_engagement(c, args.limit)
        print(f"Highest engagement videos this month ({start}..{end})")
        for i, r in enumerate(rows, 1):
            print(
                f"{i:2d}. {r['title']} ({r['video_id']}) | ER={r['engagement_rate_pct']}% views={r['views']} likes={r['likes']} comments={r['comments']}"
            )


if __name__ == "__main__":
    main()

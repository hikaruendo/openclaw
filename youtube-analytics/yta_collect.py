#!/usr/bin/env python3
import argparse
import datetime as dt
import json
import os
from pathlib import Path

from dateutil.relativedelta import relativedelta
from google_auth_oauthlib.flow import InstalledAppFlow
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

from db import connect, init_db, upsert_video, upsert_daily_stat

SCOPES = [
    "https://www.googleapis.com/auth/yt-analytics.readonly",
    "https://www.googleapis.com/auth/youtube.readonly",
]


RANGE_CHOICES = {"last7", "last30", "last90", "last365", "mtd", "ytd"}


def load_env(path: str = ".env"):
    if not Path(path).exists():
        return
    for line in Path(path).read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())


def get_creds(client_secret_file: str, token_file: str) -> Credentials:
    creds = None
    if Path(token_file).exists():
        creds = Credentials.from_authorized_user_file(token_file, SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(client_secret_file, SCOPES)
            creds = flow.run_local_server(port=0)
        Path(token_file).write_text(creds.to_json())
    return creds


def list_all_videos(youtube, channel_id: str):
    videos = []
    req = youtube.search().list(
        part="id,snippet",
        channelId=channel_id,
        type="video",
        maxResults=50,
        order="date",
    )
    while req is not None:
        resp = req.execute()
        for item in resp.get("items", []):
            vid = item["id"].get("videoId")
            if not vid:
                continue
            sn = item.get("snippet", {})
            videos.append(
                {
                    "video_id": vid,
                    "title": sn.get("title", ""),
                    "published_at": sn.get("publishedAt"),
                    "channel_id": sn.get("channelId", channel_id),
                }
            )
        req = youtube.search().list_next(req, resp)
    return videos


def discover_channel_id(youtube):
    resp = youtube.channels().list(part="id", mine=True).execute()
    items = resp.get("items", [])
    if not items:
        raise RuntimeError("No channel found for authenticated account")
    return items[0]["id"]


def query_video_daily(yt_analytics, video_id: str, start_date: str, end_date: str):
    resp = yt_analytics.reports().query(
        ids="channel==MINE",
        startDate=start_date,
        endDate=end_date,
        metrics="views,likes,comments,estimatedMinutesWatched,averageViewDuration,subscribersGained,subscribersLost",
        dimensions="day",
        filters=f"video=={video_id}",
        sort="day",
    ).execute()

    rows = []
    for r in resp.get("rows", []) or []:
        rows.append(
            {
                "stat_date": str(r[0]),
                "views": r[1],
                "likes": r[2],
                "comments": r[3],
                "estimated_minutes_watched": r[4],
                "average_view_duration": r[5],
                "subscribers_gained": r[6],
                "subscribers_lost": r[7],
            }
        )
    return rows


def compute_date_range(args) -> tuple[str, str, str]:
    today = dt.date.today()

    if args.lifetime:
        return "2005-02-14", today.isoformat(), "lifetime"

    if args.range:
        if args.range not in RANGE_CHOICES:
            raise SystemExit(
                f"Invalid --range '{args.range}'. Use one of: {', '.join(sorted(RANGE_CHOICES))}"
            )
        if args.range == "last7":
            start = today - relativedelta(days=7)
            return start.isoformat(), today.isoformat(), "last7"
        if args.range == "last30":
            start = today - relativedelta(days=30)
            return start.isoformat(), today.isoformat(), "last30"
        if args.range == "last90":
            start = today - relativedelta(days=90)
            return start.isoformat(), today.isoformat(), "last90"
        if args.range == "last365":
            start = today - relativedelta(days=365)
            return start.isoformat(), today.isoformat(), "last365"
        if args.range == "mtd":
            start = today.replace(day=1)
            return start.isoformat(), today.isoformat(), "mtd"
        if args.range == "ytd":
            start = dt.date(today.year, 1, 1)
            return start.isoformat(), today.isoformat(), "ytd"

    end_date = args.end_date or today.isoformat()
    start_date = args.start_date or (today - relativedelta(days=30)).isoformat()

    # Validate format early.
    dt.date.fromisoformat(start_date)
    dt.date.fromisoformat(end_date)

    return start_date, end_date, "custom"


def fetch_lifetime_video_stats(youtube, video_ids: list[str]) -> dict:
    totals = {"views": 0, "likes": 0, "comments": 0}
    if not video_ids:
        return totals

    for i in range(0, len(video_ids), 50):
        chunk = video_ids[i : i + 50]
        resp = youtube.videos().list(part="statistics", id=",".join(chunk), maxResults=50).execute()
        for item in resp.get("items", []):
            s = item.get("statistics", {})
            totals["views"] += int(s.get("viewCount", 0) or 0)
            totals["likes"] += int(s.get("likeCount", 0) or 0)
            totals["comments"] += int(s.get("commentCount", 0) or 0)

    return totals


def query_period_totals(conn, start_date: str, end_date: str) -> dict:
    row = conn.execute(
        """
        SELECT
          COALESCE(SUM(views), 0) AS views,
          COALESCE(SUM(likes), 0) AS likes,
          COALESCE(SUM(comments), 0) AS comments,
          COALESCE(SUM(estimated_minutes_watched), 0) AS estimated_minutes_watched,
          COALESCE(SUM(subscribers_gained - subscribers_lost), 0) AS net_subscribers
        FROM daily_video_stats
        WHERE stat_date BETWEEN ? AND ?
        """,
        (start_date, end_date),
    ).fetchone()

    return {
        "views": int(row["views"]),
        "likes": int(row["likes"]),
        "comments": int(row["comments"]),
        "estimated_minutes_watched": int(row["estimated_minutes_watched"]),
        "net_subscribers": int(row["net_subscribers"]),
    }


def main():
    parser = argparse.ArgumentParser(description="YouTube Analytics collector")
    parser.add_argument("--env-file", default=".env")
    parser.add_argument("--start-date", default=None, help="YYYY-MM-DD (default: 30 days ago)")
    parser.add_argument("--end-date", default=None, help="YYYY-MM-DD (default: today)")
    parser.add_argument(
        "--range",
        default=None,
        help="Preset range: last7|last30|last90|last365|mtd|ytd (overrides --start-date/--end-date)",
    )
    parser.add_argument(
        "--lifetime",
        action="store_true",
        help="Use lifetime collection range (2005-02-14 to today) and include lifetime totals from YouTube Data API",
    )
    args = parser.parse_args()

    load_env(args.env_file)

    client_secret = os.getenv("YTA_CLIENT_SECRET_FILE", "client_secret.json")
    token_file = os.getenv("YTA_TOKEN_FILE", "token.json")
    db_path = os.getenv("YTA_DB_PATH", "youtube_analytics.db")
    channel_id = os.getenv("YTA_CHANNEL_ID", "").strip()

    if not Path(client_secret).exists():
        raise SystemExit(f"Missing client secret file: {client_secret}")

    start_date, end_date, range_mode = compute_date_range(args)

    creds = get_creds(client_secret, token_file)
    youtube = build("youtube", "v3", credentials=creds)
    yt_analytics = build("youtubeAnalytics", "v2", credentials=creds)

    if not channel_id:
        channel_id = discover_channel_id(youtube)

    conn = connect(db_path)
    init_db(conn)

    videos = list_all_videos(youtube, channel_id)
    print(f"[info] found videos: {len(videos)}")

    stat_rows = 0
    for v in videos:
        upsert_video(conn, v)
        daily = query_video_daily(yt_analytics, v["video_id"], start_date, end_date)
        for row in daily:
            upsert_daily_stat(
                conn,
                {
                    "video_id": v["video_id"],
                    **row,
                },
            )
            stat_rows += 1

    conn.commit()

    period_totals = query_period_totals(conn, start_date, end_date)
    lifetime_totals = None
    if args.lifetime:
        lifetime_totals = fetch_lifetime_video_stats(youtube, [v["video_id"] for v in videos])

    conn.close()

    print(
        json.dumps(
            {
                "ok": True,
                "channel_id": channel_id,
                "videos": len(videos),
                "stat_rows_upserted": stat_rows,
                "range": {"mode": range_mode, "start": start_date, "end": end_date},
                "period_totals": period_totals,
                "lifetime_totals": lifetime_totals,
                "db_path": db_path,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()

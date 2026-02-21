import sqlite3
from pathlib import Path


def connect(db_path: str) -> sqlite3.Connection:
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS videos (
            video_id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            published_at TEXT,
            channel_id TEXT,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS daily_video_stats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            video_id TEXT NOT NULL,
            stat_date TEXT NOT NULL,
            views INTEGER NOT NULL DEFAULT 0,
            likes INTEGER NOT NULL DEFAULT 0,
            comments INTEGER NOT NULL DEFAULT 0,
            estimated_minutes_watched INTEGER NOT NULL DEFAULT 0,
            average_view_duration REAL NOT NULL DEFAULT 0,
            subscribers_gained INTEGER NOT NULL DEFAULT 0,
            subscribers_lost INTEGER NOT NULL DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(video_id, stat_date),
            FOREIGN KEY(video_id) REFERENCES videos(video_id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_stats_date ON daily_video_stats(stat_date);
        CREATE INDEX IF NOT EXISTS idx_stats_video ON daily_video_stats(video_id);
        """
    )
    conn.commit()


def upsert_video(conn: sqlite3.Connection, video: dict) -> None:
    conn.execute(
        """
        INSERT INTO videos (video_id, title, published_at, channel_id, updated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(video_id) DO UPDATE SET
            title=excluded.title,
            published_at=excluded.published_at,
            channel_id=excluded.channel_id,
            updated_at=CURRENT_TIMESTAMP
        """,
        (video["video_id"], video["title"], video.get("published_at"), video.get("channel_id")),
    )


def upsert_daily_stat(conn: sqlite3.Connection, row: dict) -> None:
    conn.execute(
        """
        INSERT INTO daily_video_stats (
            video_id, stat_date, views, likes, comments,
            estimated_minutes_watched, average_view_duration,
            subscribers_gained, subscribers_lost, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(video_id, stat_date) DO UPDATE SET
            views=excluded.views,
            likes=excluded.likes,
            comments=excluded.comments,
            estimated_minutes_watched=excluded.estimated_minutes_watched,
            average_view_duration=excluded.average_view_duration,
            subscribers_gained=excluded.subscribers_gained,
            subscribers_lost=excluded.subscribers_lost,
            updated_at=CURRENT_TIMESTAMP
        """,
        (
            row["video_id"],
            row["stat_date"],
            int(row.get("views", 0)),
            int(row.get("likes", 0)),
            int(row.get("comments", 0)),
            int(row.get("estimated_minutes_watched", 0)),
            float(row.get("average_view_duration", 0)),
            int(row.get("subscribers_gained", 0)),
            int(row.get("subscribers_lost", 0)),
        ),
    )

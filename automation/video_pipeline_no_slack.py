#!/usr/bin/env python3
import os
import json
import argparse
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
import socket

XAI_API_KEY = os.getenv("XAI_API_KEY", "")
XAI_MODEL = os.getenv("XAI_MODEL", "grok-4-latest")
ASANA_ACCESS_TOKEN = os.getenv("ASANA_ACCESS_TOKEN", "")
ASANA_PROJECT_ID = os.getenv("ASANA_PROJECT_ID", "1213285186847847").strip()
HTTP_TIMEOUT = int(os.getenv("HTTP_TIMEOUT", "60"))
HTTP_RETRIES = int(os.getenv("HTTP_RETRIES", "2"))
OUTPUT_DIR = os.getenv("OUTPUT_DIR", "automation/output")


def http_json(url, method="GET", headers=None, body=None):
    req = Request(url, method=method)
    # xAI API occasionally rejects default urllib UA (Cloudflare 1010).
    req.add_header("User-Agent", "openclaw-video-pipeline/1.0")
    req.add_header("Accept", "application/json")
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        req.add_header("Content-Type", "application/json")

    last_err = None
    for _ in range(max(1, HTTP_RETRIES + 1)):
        try:
            with urlopen(req, data=data, timeout=HTTP_TIMEOUT) as r:
                return json.loads(r.read().decode("utf-8"))
        except HTTPError as e:
            raw = e.read().decode("utf-8", errors="ignore")
            raise RuntimeError(f"HTTP {e.code} {url}: {raw}")
        except (URLError, socket.timeout, TimeoutError) as e:
            last_err = e
            continue

    raise RuntimeError(f"Network timeout/error for {url}: {last_err}")


def save_json(data, prefix="research"):
    Path(OUTPUT_DIR).mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    path = Path(OUTPUT_DIR) / f"{prefix}-{ts}.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    return str(path)


def research_topic(topic, tweet_count=10):
    prompt = f"""
You are researching X/Twitter discussions.
Topic: {topic}
Return STRICT JSON with this schema:
{{
  "summary": "short summary in Japanese",
  "tweets": [
    {{"author":"...","text":"...","url":"https://x.com/...","reason":"relevance"}}
  ],
  "outline": ["hook", "problem", "proof", "cta"],
  "storyboard": [
    {{"scene": 1, "sec": "0-5", "visual": "...", "narration": "..."}}
  ]
}}
Return exactly {tweet_count} tweets and 6 storyboard scenes. No markdown.
""".strip()

    res = http_json(
        "https://api.x.ai/v1/chat/completions",
        method="POST",
        headers={"Authorization": f"Bearer {XAI_API_KEY}"},
        body={
            "model": XAI_MODEL,
            "messages": [
                {"role": "system", "content": "You are a precise JSON generator."},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.2,
        },
    )
    text = res["choices"][0]["message"]["content"]
    try:
        return json.loads(text)
    except Exception:
        cleaned = text.strip().strip("`")
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        return json.loads(cleaned[start:end+1])


def verify_asana_project(project_id):
    return http_json(
        f"https://app.asana.com/api/1.0/projects/{project_id}",
        method="GET",
        headers={"Authorization": f"Bearer {ASANA_ACCESS_TOKEN}"},
    )


def create_asana_task(topic, research, source="manual", project_id=None, tweet_count=10):
    title = f"【動画案】{topic}"
    lines = [
        f"作成日時: {datetime.now(timezone.utc).isoformat()}",
        f"source: {source}",
        "",
        "■ 調査サマリー",
        research.get("summary", ""),
        "",
        f"■ 関連ツイート Top{tweet_count}",
    ]

    for i, t in enumerate(research.get("tweets", [])[:tweet_count], 1):
        lines.append(f"{i}. {t.get('author','')} - {t.get('text','')}")
        lines.append(f"   URL: {t.get('url','')}")
        lines.append(f"   理由: {t.get('reason','')}")

    lines.extend(["", "■ 提案アウトライン"])
    for i, item in enumerate(research.get("outline", []), 1):
        lines.append(f"{i}. {item}")

    lines.extend(["", "■ Storyboard (30-60秒)"])
    for s in research.get("storyboard", []):
        lines.append(f"Scene{s.get('scene')}: [{s.get('sec')}] {s.get('visual')}")
        lines.append(f"  Narration: {s.get('narration')}")

    pid = (project_id or ASANA_PROJECT_ID or "").strip()
    if not pid.isdigit() or pid == "0":
        raise RuntimeError(f"Invalid ASANA project id: '{pid}'")

    body = {
        "data": {
            "name": title,
            "notes": "\n".join(lines),
            "projects": [pid],
            "memberships": [{"project": pid}],
        }
    }
    print(f"[asana] payload.projects={body['data']['projects']} memberships={body['data']['memberships']}")
    return http_json(
        "https://app.asana.com/api/1.0/tasks",
        method="POST",
        headers={"Authorization": f"Bearer {ASANA_ACCESS_TOKEN}"},
        body=body,
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--idea", required=True, help="video idea text")
    parser.add_argument("--project-id", default="", help="Asana project gid override")
    parser.add_argument("--tweet-count", type=int, default=5, help="number of tweets to collect (cost control)")
    args = parser.parse_args()

    if not XAI_API_KEY or not ASANA_ACCESS_TOKEN:
        raise SystemExit("Missing XAI_API_KEY or ASANA_ACCESS_TOKEN")

    tweet_count = max(1, min(args.tweet_count, 10))
    print(f"[research] {args.idea} (tweets={tweet_count})")
    research = research_topic(args.idea, tweet_count=tweet_count)
    out = save_json({"idea": args.idea, "research": research}, prefix="video-idea")
    print(f"[output] {out}")

    pid = (args.project_id or ASANA_PROJECT_ID).strip()
    print(f"[asana] project_id={pid}")
    project = verify_asana_project(pid)
    print(f"[asana] project_ok name={project.get('data',{}).get('name','(unknown)')}")
    task = create_asana_task(args.idea, research, project_id=pid, tweet_count=tweet_count)
    gid = task.get("data", {}).get("gid")
    print(f"[done] asana task gid={gid}")


if __name__ == "__main__":
    main()

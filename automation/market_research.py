#!/usr/bin/env python3
"""Market research workflow using Brave Search API.

Features:
- Competitor discovery
- Pricing model extraction
- Market gap hypotheses
- Markdown report output
- Optional Asana task creation

Env vars:
- BRAVE_API_KEY (required)
- ASANA_ACCESS_TOKEN (optional, for --create-asana)
- ASANA_PROJECT_GID (optional, for --create-asana)
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from collections import Counter
from dataclasses import dataclass
from typing import Dict, List, Tuple

BRAVE_ENDPOINT = "https://api.search.brave.com/res/v1/web/search"


@dataclass
class SearchItem:
    title: str
    url: str
    description: str


def brave_search(api_key: str, query: str, count: int = 10, country: str = "JP", lang: str = "en") -> List[SearchItem]:
    params = urllib.parse.urlencode(
        {
            "q": query,
            "count": str(count),
            "country": country,
            "search_lang": lang,
            "ui_lang": lang,
            "safesearch": "moderate",
        }
    )
    req = urllib.request.Request(
        f"{BRAVE_ENDPOINT}?{params}",
        headers={
            "Accept": "application/json",
            "Accept-Encoding": "gzip",
            "X-Subscription-Token": api_key,
            "User-Agent": "openclaw-market-research/1.0",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        payload = json.loads(resp.read().decode("utf-8"))

    items = []
    for r in (payload.get("web") or {}).get("results", []) or []:
        items.append(
            SearchItem(
                title=(r.get("title") or "").strip(),
                url=(r.get("url") or "").strip(),
                description=(r.get("description") or "").strip(),
            )
        )
    return items


def domain_of(url: str) -> str:
    try:
        return urllib.parse.urlparse(url).netloc.lower()
    except Exception:
        return ""


def normalize_name(title: str, domain: str) -> str:
    if title:
        left = re.split(r"\s[\-|–|—]\s", title)[0].strip()
        if 2 <= len(left) <= 60:
            return left
    return domain.replace("www.", "")


def collect_sources(api_key: str, topic: str, country: str, lang: str, count: int) -> Dict[str, List[SearchItem]]:
    queries = {
        "competitors": [
            f"{topic} competitors",
            f"best {topic} tools",
            f"{topic} alternatives",
        ],
        "pricing": [
            f"{topic} pricing",
            f"{topic} plans free trial",
            f"{topic} enterprise pricing",
        ],
        "gaps": [
            f"{topic} pain points",
            f"problems with {topic}",
            f"{topic} reddit review",
        ],
    }

    out: Dict[str, List[SearchItem]] = {"competitors": [], "pricing": [], "gaps": []}
    for section, qlist in queries.items():
        seen = set()
        for q in qlist:
            for item in brave_search(api_key, q, count=count, country=country, lang=lang):
                key = item.url
                if key in seen:
                    continue
                seen.add(key)
                out[section].append(item)
    return out


def extract_competitors(items: List[SearchItem], limit: int = 12) -> List[Tuple[str, str, str]]:
    by_domain = {}
    for it in items:
        d = domain_of(it.url)
        if not d:
            continue
        if any(x in d for x in ["youtube.com", "reddit.com", "x.com", "twitter.com", "wikipedia.org"]):
            continue
        if d not in by_domain:
            by_domain[d] = it

    competitors = []
    for d, it in by_domain.items():
        name = normalize_name(it.title, d)
        competitors.append((name, d, it.url))
    return competitors[:limit]


def infer_pricing_models(items: List[SearchItem], limit: int = 10) -> List[Tuple[str, str, str]]:
    models = []
    keywords = [
        ("free", "Free plan or free usage tier"),
        ("trial", "Free trial"),
        ("freemium", "Freemium"),
        ("subscription", "Subscription"),
        ("monthly", "Monthly subscription"),
        ("seat", "Per-seat pricing"),
        ("usage", "Usage-based pricing"),
        ("api", "API metered pricing"),
        ("enterprise", "Enterprise/custom pricing"),
    ]

    for it in items:
        text = f"{it.title} {it.description}".lower()
        matched = [desc for k, desc in keywords if k in text]
        if matched:
            models.append((it.title, ", ".join(sorted(set(matched))), it.url))
    return models[:limit]


def infer_market_gaps(gap_items: List[SearchItem], pricing_items: List[SearchItem], competitor_count: int) -> List[str]:
    corpus = " ".join([f"{x.title} {x.description}" for x in gap_items + pricing_items]).lower()

    signals = {
        "Transparent pricing is unclear": ["contact sales", "enterprise", "custom pricing"],
        "SMB/solo-friendly onboarding remains weak": ["complex", "setup", "learning curve", "onboarding"],
        "ROI visibility/dashboarding is under-served": ["roi", "analytics", "report", "dashboard"],
        "Cost predictability is a pain point": ["cost", "pricing", "expensive", "budget", "usage"],
        "Localization and non-English support opportunity": ["japanese", "multi-language", "localization", "jp"],
    }

    ranked = []
    for gap, terms in signals.items():
        score = sum(corpus.count(t) for t in terms)
        ranked.append((score, gap))

    ranked.sort(reverse=True)
    selected = [g for s, g in ranked if s > 0][:4]
    if not selected:
        selected = [
            "Pricing transparency and predictability opportunity",
            "Simple onboarding for non-technical teams",
            "Niche vertical workflow bundles",
        ]

    if competitor_count < 6:
        selected.append("Market appears fragmented; opportunity for clearer category positioning")

    return selected


def build_markdown(topic: str, sources: Dict[str, List[SearchItem]]) -> Tuple[str, List[str]]:
    competitors = extract_competitors(sources["competitors"])
    pricing = infer_pricing_models(sources["pricing"])
    gaps = infer_market_gaps(sources["gaps"], sources["pricing"], len(competitors))

    date_str = dt.date.today().isoformat()
    key_findings = [
        f"Identified {len(competitors)} likely competitors in/around '{topic}'",
        f"Observed {len(pricing)} pricing references across free/trial/subscription/enterprise patterns",
        f"Top gap hypotheses: {gaps[0] if gaps else 'N/A'}",
    ]

    lines = [
        f"# Market Research Report: {topic}",
        "",
        f"Date: {date_str}",
        "Method: Brave Search API (SERP-based desk research)",
        "",
        "## Executive Summary",
    ]
    lines.extend([f"- {x}" for x in key_findings])

    lines.extend(["", "## Competitor Landscape", ""])
    for name, domain, url in competitors:
        lines.append(f"- **{name}** ({domain}) — {url}")

    lines.extend(["", "## Pricing Model Signals", ""])
    for title, model, url in pricing:
        lines.append(f"- **{title}**")
        lines.append(f"  - Model signals: {model}")
        lines.append(f"  - Source: {url}")

    lines.extend(["", "## Market Gaps / Opportunities", ""])
    for g in gaps:
        lines.append(f"- {g}")

    lines.extend(["", "## Source Notes", ""])
    for section in ["competitors", "pricing", "gaps"]:
        lines.append(f"### {section.title()}")
        for it in sources[section][:12]:
            lines.append(f"- {it.title} — {it.url}")
        lines.append("")

    return "\n".join(lines).strip() + "\n", key_findings


def create_asana_task(summary_title: str, findings: List[str], report_path: str, topic: str) -> str:
    token = os.getenv("ASANA_ACCESS_TOKEN", "").strip()
    project_gid = os.getenv("ASANA_PROJECT_GID", "").strip()
    if not token or not project_gid:
        raise RuntimeError("ASANA_ACCESS_TOKEN and ASANA_PROJECT_GID are required for --create-asana")

    notes = "\n".join(["Key findings:"] + [f"- {x}" for x in findings] + ["", f"Report: {report_path}", f"Topic: {topic}"])
    data = {
        "data": {
            "name": f"Market Research: {topic}",
            "notes": notes,
            "projects": [project_gid],
        }
    }

    req = urllib.request.Request(
        "https://app.asana.com/api/1.0/tasks",
        method="POST",
        data=json.dumps(data).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        payload = json.loads(resp.read().decode("utf-8"))

    return payload.get("data", {}).get("gid", "")


def main() -> int:
    parser = argparse.ArgumentParser(description="SERP-driven market research report generator")
    parser.add_argument("topic", help="e.g. 'AI automation tools'")
    parser.add_argument("--out", default="research/ai-automation-market.md", help="Output markdown path")
    parser.add_argument("--country", default="JP")
    parser.add_argument("--lang", default="en")
    parser.add_argument("--count", type=int, default=8, help="Results per query")
    parser.add_argument("--create-asana", action="store_true", help="Create Asana task with key findings")
    args = parser.parse_args()

    api_key = os.getenv("BRAVE_API_KEY", "").strip()
    if not api_key:
        print("[error] BRAVE_API_KEY is missing. Add it to .env or shell environment.", file=sys.stderr)
        return 1

    try:
        sources = collect_sources(api_key, args.topic, country=args.country, lang=args.lang, count=args.count)
        report, findings = build_markdown(args.topic, sources)

        out_path = args.out
        os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(report)

        result = {
            "ok": True,
            "topic": args.topic,
            "out": out_path,
            "competitors": len(extract_competitors(sources["competitors"])),
            "pricing_signals": len(infer_pricing_models(sources["pricing"])),
        }

        if args.create_asana:
            gid = create_asana_task("Market Research", findings, out_path, args.topic)
            result["asana_task_gid"] = gid

        print(json.dumps(result, ensure_ascii=False))
        return 0
    except Exception as e:
        print(f"[error] {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

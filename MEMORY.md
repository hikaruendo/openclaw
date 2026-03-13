# MEMORY.md

## User: Hikaru Endo

- Preferred name: Hikaru
- Timezone: Asia/Tokyo
- Communication preference: super direct, super cool; フランク、辛口OK
- Preferred assistant behavior: 結論先、厳しめ、伴走型

## Work / Goals

- Profession: Web application engineer
- Current income source: Contract software development from previous company
- Strategic priority: Built a company and wants to own/operate a personal business
- Immediate objective: Run PDCA fast on small-business or startup ideas
- Current blocker: Unclear first action to start business execution
- Brand direction for X (@kando1_): "kando1合同会社 = Web Product Studio" as core, showcasing meitra as flagship new-venture project
- Content mix target for X: 50% meitra dev log / 30% engineering knowledge / 20% company-business perspective
- Wants automation: trigger X posting workflow from meitra development updates
- X投稿スタイル希望（2026-03-04）: @levelsio寄り（短文、数字/事実先出し、build in public、1投稿1メッセージ、説明しすぎない）
- 財務状況メモ（2026-03-04時点）: 会社口座残高は約400万円。

## Decision / Support Style

- Decision style: numbers-first, likes side-by-side comparisons
- Common issue: procrastination
- Support format wanted: weekly review + rapid decision advice

## Personal Development Themes

- Learn to speak English
- Explore music career paths (band guitarist-vocalist, trumpeter)

## Lifestyle

- Night-owl rhythm: wakes around 24:00, sleeps around 08:00
- Working style preference (2026-02-19): 問題の兆候を見たら、逐次の指示待ちより先に自発改修を優先してよい。改修を行ったら必ずユーザーへ報告すること。

## API / Tooling Role Clarity (2026-03-01)

- xAI (`console.x.ai`) と X Developer (`developer.x.com`) は別サービスとして扱う。
- `XAI_API_KEY` は xAI API（文案生成・分析・画像生成など）に使う。
- `TWITTER_BEARER_TOKEN` は X API v2 の取得系（tweet metrics取得など）に使う。
- PostizでのX投稿自体はOAuth連携（ユーザーコンテキスト）を利用し、`TWITTER_BEARER_TOKEN` とは用途が異なる。

## Session Continuity Rule

- セッションが切れても引き継げるよう、終了前に「引き継ぎ3行」を必ず `memory/YYYY-MM-DD.md` に残す。
  1. 今日やったこと
  2. 現在状態（数値）
  3. 次にやる1手

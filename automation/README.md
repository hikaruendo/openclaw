# Automation Scripts

`automation/` 配下の自動化スクリプト一覧です。  
**スクリプトごとに用途・必要なAPI・実行方法を分けて記載**しています。

---

## 1) `video_pipeline_no_slack.py`

### 目的
動画アイデア文字列から、X調査 → Asanaタスク作成までを自動化（Slack連携なし）。

### できること
- 動画アイデアを入力
- xAI APIでX/Twitter関連情報を調査
  - 要約
  - 関連投稿（デフォルト5件、最大10件）
  - アウトライン
  - 簡易ストーリーボード
- Asanaプロジェクトにタスク作成
- 調査結果JSONをローカル保存

### 必要な環境変数（`automation/.env`）
```env
XAI_API_KEY=xai-...
XAI_MODEL=grok-4-1-fast-non-reasoning
ASANA_ACCESS_TOKEN=...
ASANA_PROJECT_ID=1213285063310079
HTTP_TIMEOUT=90
HTTP_RETRIES=3
OUTPUT_DIR=automation/output
```

### 実行
```bash
cd /Users/hikaruendo/Projects/openclaw
./run_video_idea.sh "how to automate video production with AI"
```

または直接:
```bash
cd /Users/hikaruendo/Projects/openclaw
set -a; source automation/.env; set +a
python3 automation/video_pipeline_no_slack.py --idea "how to automate video production with AI"
```

### 主なオプション
- `--project-id <gid>`: Asana project IDを一時上書き
- `--tweet-count <1-10>`: 収集投稿数（デフォルト5）

### 出力
- `automation/output/video-idea-YYYYMMDD-HHMMSS.json`
- Asanaタスク作成時は `gid` を標準出力

---

## 2) `market_research.py`

### 目的
市場調査（競合・価格モデル・市場ギャップ仮説）をMarkdownレポート化。

### できること
- Brave Search API を使った競合候補の収集
- 価格モデルのシグナル抽出（free/trial/subscription/enterprise等）
- 市場ギャップ仮説の生成
- レポート保存（Markdown）
- 任意でAsanaタスク作成

### 必要な環境変数
```env
BRAVE_API_KEY=...
# optional:
ASANA_ACCESS_TOKEN=...
ASANA_PROJECT_GID=...
```

### 実行
```bash
cd /Users/hikaruendo/Projects/openclaw
python3 automation/market_research.py "AI automation tools" \
  --out research/ai-automation-market.md
```

Asana作成付き:
```bash
python3 automation/market_research.py "AI automation tools" \
  --out research/ai-automation-market.md \
  --create-asana
```

### 主なオプション
- `--country`（デフォルト: `JP`）
- `--lang`（デフォルト: `en`）
- `--count`（クエリごとの取得件数）
- `--create-asana`

### 出力
- 指定したMarkdown（例: `research/ai-automation-market.md`）
- 標準出力にJSONサマリ

### 課金メモ（2026-02-18時点）
- Brave Search APIはダッシュボード上、**最低 $5/月サブスク前提**に見える
- **無料の従量課金のみ運用は難しいため、現時点では導入ステイ**
- 実運用再開時に、他API（Exa等）含めて再比較する

---

## 共通ファイル
- `.env` : ローカル環境変数（Gitにコミットしない）
- `.env.no-slack.example` : `video_pipeline_no_slack.py` 用テンプレ

---

## セキュリティ
- `.env` はGitにコミットしない
- APIキー漏えい時は即Revoke

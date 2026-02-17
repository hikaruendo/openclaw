# Automation (No-Slack Video Pipeline)

`automation/` は、**アイデア文字列から X調査 → Asanaタスク作成**までを自動化するフォルダです。  
Slack連携は不要版です。

---

## できること

- 動画アイデアを入力
- xAI APIでX/Twitter関連情報を調査
  - 要約
  - 関連投稿（デフォルト5件、最大10件）
  - アウトライン
  - 簡易ストーリーボード
- Asanaプロジェクトにタスク作成
- 調査結果JSONをローカル保存

---

## ファイル構成

- `video_pipeline_no_slack.py`  
  メイン実行スクリプト
- `.env.no-slack.example`  
  環境変数テンプレート
- `output/`  
  実行時に調査JSONを保存

---

## セットアップ

```bash
cd /Users/hikaruendo/Projects/openclaw
cp automation/.env.no-slack.example automation/.env
```

`automation/.env` を編集:

```env
XAI_API_KEY=xai-...
XAI_MODEL=grok-4-1-fast-non-reasoning
ASANA_ACCESS_TOKEN=...
ASANA_PROJECT_ID=1213285063310079
HTTP_TIMEOUT=90
HTTP_RETRIES=3
OUTPUT_DIR=automation/output
```

---

## 実行方法

### 1) かんたん実行（推奨）

```bash
cd /Users/hikaruendo/Projects/openclaw
./run_video_idea.sh "how to automate video production with AI"
```

### 2) 直接実行

```bash
cd /Users/hikaruendo/Projects/openclaw
set -a; source automation/.env; set +a
python3 automation/video_pipeline_no_slack.py --idea "how to automate video production with AI"
```

### オプション

- `--project-id <gid>`: Asana project IDを一時上書き
- `--tweet-count <1-10>`: 収集投稿数（デフォルト5）

例:

```bash
python3 automation/video_pipeline_no_slack.py \
  --idea "how to automate video production with AI" \
  --tweet-count 8 \
  --project-id 1213285063310079
```

---

## 出力

- 標準出力に進捗表示
- Asanaタスク作成時に `gid` を表示
- `automation/output/video-idea-YYYYMMDD-HHMMSS.json` に保存

---

## トラブルシュート

### 1) xAI 403 / 1010
- APIキー権限（Model/Endpoint）を見直す
- `Chat` endpointを許可
- モデル許可を `.env` の `XAI_MODEL` と一致させる

### 2) Asana 404 / Not a recognized ID: 0
- `ASANA_PROJECT_ID` を確認
- トークンでアクセス可能なプロジェクトIDか確認
- 必要なら `--project-id` で明示指定

### 3) タイムアウト
- `HTTP_TIMEOUT` を上げる（例: 90）
- `HTTP_RETRIES` を増やす（例: 3）

---

## コスト最適化

- `--tweet-count` を5以下にする
- 高頻度実行しない（手動トリガー中心）
- モデルを軽量寄りにする（必要に応じて）

---

## セキュリティ

- `.env` はGitにコミットしない
- APIキー漏えい時は即Revoke

# Discord Webhook設定手順（承認キュー通知）

## 1) Webhook作成
1. Discordで対象サーバーを開く
2. サーバー名をクリック → **Server Settings**
3. 左メニュー **Integrations** を開く
4. **Webhooks** を選択
5. **New Webhook**
6. 投稿先チャンネル（例: `#approval-queue`）を選ぶ
7. **Copy Webhook URL** を押してURLをコピー

## 2) ローカル環境変数に設定
```bash
export DISCORD_WEBHOOK_URL='https://discord.com/api/webhooks/....'
```

zsh永続化する場合（任意）:
```bash
echo "export DISCORD_WEBHOOK_URL='https://discord.com/api/webhooks/....'" >> ~/.zshrc
source ~/.zshrc
```

## 3) 動作確認
```bash
node automation/dropshipping/run-pipeline.mjs
```

実行ログに以下が出ればOK:
- `=== DISCORD ===`
- `{ ok: true, ... }`

## 4) 通知フォーマット
- manual_review_count
- 上位10件の注文ID / 金額 / risk / 理由

## 5) トラブル時
- 401/403: URLミス or webhook削除
- 404: Webhook URLが無効
- 通知なし: `DISCORD_WEBHOOK_URL` 未設定

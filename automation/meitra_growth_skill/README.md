# Meitra Growth Skill (Custom)

Larryの思想を参照しつつ、Meitra専用に最短運用するための自作スキル。

## 最短スタート
```bash
cd /Users/hikaruendo/Projects/openclaw/automation/meitra_growth_skill
cp .env.example .env
node scripts/generate_post_pack.mjs --angle "初心者が最初にやりがちなミス" --proof "初手で逆転された局面" --cta "#meitra を付けてスクショ投稿して。毎日紹介します"
```

## 重要
- AI生成だけで投稿しない
- 実プレイ素材を必ず混ぜる
- 投稿はまずDraftで運用（事故防止）

## X / TikTok 自動投稿（meitra）
### 下書き作成（推奨）
```bash
node scripts/postiz_autopost_meitra.mjs \
  --angle "初心者が最初にやりがちなミス" \
  --proof "実対戦で逆転した局面" \
  --cta "続き見たい人はフォロー" \
  --channels x,tiktok \
  --mode draft
```

### 予約投稿
```bash
node scripts/postiz_autopost_meitra.mjs \
  --angle "今日の開発ログ" \
  --proof "新機能の実装動画あり" \
  --cta "詳細はプロフィールから" \
  --channels x,tiktok \
  --mode schedule \
  --publishAt "2026-03-02T12:00:00+09:00"
```

必要なenv:
- `POSTIZ_API_KEY`
- `POSTIZ_WORKSPACE_ID`
- `POSTIZ_CHANNEL_X_ID`
- `POSTIZ_CHANNEL_TIKTOK_ID`

## 分析ループ（追加）
投稿後に最低限の数値を記録して、勝ちパターンを翌日に反映する。

### 1) 投稿実績を記録
```bash
node scripts/record_post_result.mjs \
  --postId tiktok_20260301_01 \
  --platform tiktok \
  --angle "初心者が最初にやりがちなミス" \
  --hook "逆転された理由は1手前" \
  --cta "スクショを #meitra で投稿" \
  --views 1200 --likes 88 --comments 12 --shares 9 --saves 20 \
  --profileClicks 25 --linkClicks 11 --installs 4 --trialStarts 2 --paidStarts 0
```

### 2) Postizの投稿メトリクスを同期（投稿IDベース）
```bash
node scripts/sync_postiz_metrics.mjs --postId <POSTIZ_POST_ID> --platform tiktok
```

### 3) X投稿メトリクスを同期（status IDベース）
```bash
node scripts/sync_x_metrics.mjs --ids 2028011452116963687,2028012210648502390 --angle "site_renewal_beta" --cta "beta_signup"
```

### 4) レポートを生成
```bash
node scripts/analyze_results.mjs --from 2026-03-01 --to 2026-03-07
```

出力先:
- `output/analytics/YYYY-MM-DD.jsonl`
- `output/analytics-reports/report-*.md`
- `output/analytics-reports/report-*.json`

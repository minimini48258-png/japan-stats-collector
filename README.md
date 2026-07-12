# 統計データ収集ツール（japan-stats-collector）

都道府県・市区町村・分野・年度を選んで、公的統計データ（人口・産業・物価・地価など）を一括ダウンロードできるWebアプリ。

要件定義・設計の詳細は社内Google Driveを参照:
- `00_新規事業検討/03_プロダクト開発/要件定義/20260712_統計データ収集アプリ_要件定義.md`
- `00_新規事業検討/03_プロダクト開発/設計・仕様/統計データ収集アプリ_設計書.md`

## 構成

- `src/` — Next.js（App Router, `output: 'export'` の静的サイト）。本体はブラウザから直接e-Stat APIを呼び出す
- `worker/` — Cloudflare Workers。不動産情報ライブラリAPI（地価公示・地価調査）とGSI住所検索APIはCORS非対応・キーが必要なため、この薄いプロキシ経由で呼び出す

## セットアップ

```bash
npm install
cp .env.local.example .env.local
# .env.local に e-Stat の appId とプロキシURLを設定
npm run dev
```

- e-Stat APIキー（無料・即時発行）: https://www.e-stat.go.jp/mypage/user/preregister
- 不動産情報ライブラリAPIキー（無料・審査あり）: https://www.reinfolib.mlit.go.jp/api/request/

## デプロイ

### 本体（静的サイト）

```bash
npm run build:embed   # BASE_PATH=/tools/stats-collector で書き出す
```

生成された `out/` を shiso-lab-site リポジトリの `public/tools/stats-collector/` にコピーし、shiso-lab-site の既存CI（GitHub Actions → ロリポップFTP）でデプロイする。

### プロキシ（Cloudflare Workers）

```bash
cd worker
npm install
npx wrangler secret put REINFOLIB_API_KEY   # 初回のみ
npm run deploy
```

デプロイ後に払い出されるWorkerのURLを、本体の `.env.local`（および本番ビルド環境）の `NEXT_PUBLIC_REINFOLIB_PROXY_BASE_URL` に設定する。

## データカタログ

`src/lib/catalog.ts` に、都市計画基礎調査で使われる統計項目（人口・産業・土地利用・建物・都市施設・交通・地価・自然的環境・災害・その他）を網羅的に登録している。実際に自動ダウンロードできるのは `apiAvailable: true` の項目のみ（e-Stat・不動産情報ライブラリの公式APIがあるもの）。それ以外は画面上に一覧表示しつつ、出典情報へのリンクを示すだけに留めている。

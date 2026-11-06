> **公開予定URL：https://hasshaku.autoarticles.net/** （Firebase `hasshaku-hashito`、GA4 `G-K3EE3L77BK`）
>
> game-kit の **3D一人称標準（standard 1.5）** で作っています。骨組み（`js/kit/`）は game-kit から `kit-sync` で同期し、直接変更しません。作品固有のコードは `js/ext/` だけです。
> Game-fleet の `projects/hasshaku` に登録。

# 八尺様 ― 境の夜

ネット怪談「八尺様」を題材にした、五段階で進む一人称3D探索ホラーです。ブラウザだけで動き、PC とスマホに対応します（約25分）。

二〇〇八年八月。祖父に頼まれた夕暮れの買い物の帰り道で、生垣より背の高い女を見た。盛り塩と札で守られた部屋で、朝七時まで、知っている人の声にも返事をしてはいけない。

| 段階 | 名前 | すること |
|---|---|---|
| 1 | 異影 | 地図を見て夕霧商店へ。帰り道、生垣の上の白い帽子を見る。祖父に話す |
| 2 | 四隅 | 台所の塩・納戸の新聞・仏壇の横の札を集め、北の座敷の四隅に塩を盛り、窓をふさぎ、襖に札を貼る |
| 3 | 呼び声 | 01:00〜07:00。黒くなる塩を替える。戸の外の祖父の声に返事をしない（開けると死ぬ） |
| 4 | 迎えの道 | 朝の村道を、白い姿に見つからないように北へ。三つの回し金で車止めを開け、車に乗る |
| 5 | 境越え | 札を握って目を伏せ、窓を見続けずに村境の地蔵を越える |

結末は二つ（三つの記録をすべて読んだか）。どの死に方も、その段階の始めからやり直せます。

## 構成（標準 1.5）

| パス | 内容 |
|---|---|
| `game.json` | 作品の定義（標準・テーマ・プリセット・データの一覧・拡張） |
| `data/*.json` | 図面（`plan.json`：家・商店・村の道を部屋と扉で）、段階・タスク・持ち物・記録・調べる物・結末・怪異・会話（`talk.json`）・更新情報 |
| `tools/authoring/make-plan.py` `make-data.py` | 上の JSON を作るスクリプト（`npm run data`）。文章を直すときはここ |
| `js/ext/` | 作品固有：`story.js`（五段階の流れ・夜・車・死・結末）、`village.js`（村と家の見た目・人物）、`hasshaku.js`（八尺様の姿）、`minigames.js`（塩・回し金）、`sound.js`（合成音） |
| `js/kit/` `css/kit.css` `css/theme.css` `css/shell.css` `tools/*.mjs` | game-kit の標準（同期のみ） |
| `css/theme-game.css` | 作品のテーマ（トークン）と ext の部品 |
| `assets/photos/` | v4 の挿絵を切り出した写真（タイトル・会話・結末・死亡） |
| `assets/textures/` | game-kit の共通テクスチャ（`kit.json` の `textures`） |

v4（単一の HTML）からの載せ替えで、三つの記録の名前と置き場所、札の場所、門の貼り紙の向き、桃の台詞の名残などの食い違いを直しました。旧版は git の履歴（`dist/index.html`）にあります。

## 確認

```bash
npm test                 # データ・図面・CSS・選択しやすさ（W18）
npm run check            # check-game-data / check-plan / check-escape（序盤の追跡はどこからでも逃げられる）
npm run smoke            # ヘッドレスで タイトル→全タスク→結末（PC）
npm run smoke:mobile     # 同じくスマホ（タッチ）
node tools/playthrough.mjs   # 死に方4種・やり直し・二つの結末
npm run check:contrast   # 文字と背景のコントラスト（U30）
```

ブラウザは `BROWSER=<Chrome のパス>`、GPU のない環境は `GF_SOFTWARE_GL=1`。`?qa=1` のとき、ミニゲームと会話は即座に進み、夜と車は10倍の速さで進みます（テスト用）。

## 公開

全ゲーム共通ルール A4 の手順です（Game-fleet `docs/all-games-rules.md`）。

1. Firebase プロジェクト `hasshaku-hashito` を作り、Hosting を有効にする。
2. 独自ドメイン `hasshaku.autoarticles.net` を登録し、Cloud DNS に CNAME（→ `hasshaku-hashito.web.app`）を足す。
3. GA4 の測定 ID は `site.json` の `gaId`（`G-K3EE3L77BK`）。
4. `npm test && npm run check && npm run build` → `firebase deploy --only hosting --project hasshaku-hashito`。
5. Game-fleet の `portal/overrides.json` から `hasshaku` の `"status": "wip"` を外す。

共有画像は `node tools/make-og.mjs`（タイトル画面を 1200×630 で撮影 → `assets/og-image.png`）。

<!-- scene-links:start -->
## テスト用の場面リンク

`?scene=<id>` を付けて開くと、テストモードでその場面から始まります（前の作業は済んだことになり、会話は飛ばします）。
テストモードではセーブを書かず、消しもしません（画面の上に「テストモード」の札が出ます）。`?test` だけを付けると、最初からテストモードで遊べます。
知らない id のときは最初から始まります。場面の一覧は `js/ext/test-scenes.js`、この表は `node tools/scene-links.mjs` で作り直します。


### 段階の頭

| 場面 | 公開版 | 手元 (npm run serve) |
|---|---|---|
| 1. 板塀の向こう | [stage:L1](https://hasshaku.autoarticles.net/?scene=stage:L1) | [local](http://localhost:8000/?scene=stage:L1) |
| 2. 今夜を越す部屋 | [stage:L2](https://hasshaku.autoarticles.net/?scene=stage:L2) | [local](http://localhost:8000/?scene=stage:L2) |
| 3. 朝になるまで、開けない | [stage:L3](https://hasshaku.autoarticles.net/?scene=stage:L3) | [local](http://localhost:8000/?scene=stage:L3) |
| 4. 朝にも、まだいる | [stage:L4](https://hasshaku.autoarticles.net/?scene=stage:L4) | [local](http://localhost:8000/?scene=stage:L4) |
| 5. 窓の外を、確かめない | [stage:L5](https://hasshaku.autoarticles.net/?scene=stage:L5) | [local](http://localhost:8000/?scene=stage:L5) |

<!-- scene-links:end -->

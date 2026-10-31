# 素材の記録

| 素材 | 出所 | ライセンス |
|---|---|---|
| Three.js（`vendor/three`） | https://threejs.org/ | MIT（`THREE-LICENSE.txt`） |
| 写真 `assets/photos/*`（道・家・塩の皿・地図・顔） | v4 パッケージ（`hasshaku-boundary-v4.html`）に同梱の画像を切り出し。制作者の提供 | 本作用 |
| テクスチャ `assets/textures/*` | game-kit の共通テクスチャ集（SDXL 生成ほか、各 `catalog.json` に出典） | catalog.json のとおり（CC0 for Game-fleet） |
| `assets/monster/*.svg` | game-kit が配る「みる風車」の絵（Twemoji）。本作では使っていない | CC BY 4.0（Twemoji, Twitter Inc. and other contributors） |
| 人物・家具・車（3D） | game-kit の標準モデル（`js/kit/character.js` `props.js` `env-props.js`）と `js/ext/village.js` の手続き生成 | MIT |
| 怪声・ノック・環境音 | `js/ext/sound.js` の Web Audio 合成 | MIT |
| 声 `assets/voice/*.mp3`（31 本） | VOICEVOX（ローカル）で生成：`tools/media/gen-voices.mjs`。祖父と「戸の向こう」の声＝VOICEVOX:ちび式じい、Ｋさん＝VOICEVOX:東北イタコ、店のおばさん＝VOICEVOX:もち子さん、窓の外の「ぽ、ぽ、ぽ」＝VOICEVOX:冥鳴ひまり。戸・襖・窓越しの声は再生時に `js/kit/voice-fx.js` の wall で帯域を狭める（S15）。台詞との対応は `assets/voice/manifest.json` | 各キャラクターの VOICEVOX 利用規約に従う（クレジット表記：VOICEVOX:ちび式じい、VOICEVOX:東北イタコ、VOICEVOX:もち子さん、VOICEVOX:冥鳴ひまり） |
| 共有画像 `assets/og-image.png` | `tools/make-og.mjs` でタイトル画面を撮影 | 本作用 |

まだ作っていない素材（写真・声・環境音）は GitHub の Issue「素材の制作（画像・テクスチャ・音声）」に書いてあります。

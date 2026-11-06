# imtart

Three.js で魚の群れを描く Boids シミュレーションです。ブラウザで個体数を変えながら、近くの魚と向きをそろえたり、近づきすぎた魚から離れたりする様子を観察できます。

## ローカルで動かす

GitHub Pages のビルド環境と同じ Node.js 20 を使い、リポジトリ直下で実行します。

```sh
npm install
npx vite
```

ターミナルに表示された URL を開きます。各ページのスライダーで個体数を 10〜100 の範囲で変更できます。

| ページ | パス | 実装 |
| --- | --- | --- |
| CPU | `/` | [src/main.js](src/main.js) |
| GPU Boids Playground | `/gpu.html` | [src/gpu-main.js](src/gpu-main.js) |

## シミュレーションの設計

各ページは独立した Three.js のシーン、カメラ、WebGL レンダラーを持ちます。魚の胴体と尾は円錐メッシュで構成し、速度ベクトルに合わせて魚の向きを更新します。

各フレームで、各個体から他の全個体までの距離を調べ、次のルールで速度を調整します。

| ルール | 魚の動き |
| --- | --- |
| 整列 | 近くの魚の平均速度に自分の速度を近づける |
| 結合 | 近くの魚の平均位置へ向かう |
| 分離 | 一定距離より近い魚から離れる |
| 中心への引力 | 群れが広がりすぎないように原点へ引き寄せる |

両ページとも群れの計算は JavaScript が担い、描画は WebGL が担います。近傍探索の比較回数は個体数 N に対して O(N²) です。CPU ページは位置・速度を `fishBoids` にまとめ、GPU ページは各オブジェクトの `position` と `userData.velocity` を使います。近傍の半径、力の強さ、速度上限はページごとに定義されているため、挙動を調整するときは対象ページの実装を編集します。

## ビルドと公開

```sh
npm run build
npx vite preview
```

[Vite 設定](vite.config.js) は `src/` をルートにして [CPU 用 HTML](src/index.html) と [GPU 用 HTML](src/gpu.html) をビルドし、結果を `dist/` に出力します。プレビューでも両ページを同じパスで確認できます。

`main` への push を契機に、[公開ワークフロー](.github/workflows/deploy.yml) が依存関係をインストールし、ビルドした `dist/` を GitHub Pages にデプロイします。リポジトリ直下の [index.html](index.html) は、[style.css](style.css) と [img/](img/) を使う独立したタルトアートの静的ギャラリーです。

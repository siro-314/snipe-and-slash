# Snipe and Slash - Claude専用引き継ぎファイル

## 1. プロジェクトの目的（判断の軸）

**目標**: WebXRベースのブラウザVRゲーム「SNIPE & SLASH」のTypeScriptリファクタリング
- 1268行の巨大main.jsをクリーンアーキテクチャに移行
- **判断基準**: 疎結合、拡張性、堅牢性を重視したクリーンコード
- **優先順位**: 
  1. 既存機能の100%保持（動作保証）
  2. 段階的リファクタリング（急がない）
  3. VR実機確認 → Phase 3完了後に実施中

**ターゲット**: 無料で遊びたいライトユーザー（子供・VRCユーザー層）
**差別化**: ブラウザで無料、スプラトゥーン的なポップで明るい体験
**収益化戦略**: 初期は無料公開、後からheyVR等で広告SDK組み込み

---

## 2. ディレクトリマップと役割

### 現在の構造（Phase 3完了）
```
snipe-and-slash/
├── public/
│   ├── drone_white.glb      # 白ドローンGLBモデル
│   ├── drone_black.glb      # 黒ドローンGLBモデル
│   └── sword.glb            # 剣GLBモデル（弓変形機能付き）
├── src/
│   ├── domain/              # ✅ ドメインロジック（Pure State）
│   │   ├── gameState.ts     # GameStateManager（状態管理）
│   │   └── types.ts         # 型定義
│   ├── managers/            # ✅ マネージャー層
│   │   ├── modelManager.ts  # ModelManager（GLTFローダー）
│   │   └── hudManager.ts    # HUDManager（UI更新）
│   ├── utils/               # ✅ ユーティリティ
│   │   └── helpers.ts       # ヘルパー関数（座標変換等）
│   ├── components/          # 🚧 A-Frameコンポーネント（Phase 4予定）
│   │   ├── weapons/
│   │   └── enemies/
│   └── main.ts              # ✅ 1193行（Phase 3完了、1268行→75行削減）
├── dist/                    # ビルド出力
│   └── assets/
│       └── main-B14rv-Ck.js # 243.18kB (gzipped 66.06kB)
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── netlify.toml            # Netlify自動デプロイ設定
├── HANDOVER.md             # このファイル
└── 開発日記.md              # 時系列の記録（人間用）
```

### Phase 4以降の目標構造
```
src/components/
├── weapons/
│   ├── swordComponent.ts     # AFRAME.registerComponent('sword')
│   ├── bowComponent.ts       # AFRAME.registerComponent('bow')
│   └── projectileComponent.ts
├── enemies/
│   ├── enemyMobile.ts        # enemy-mobile
│   ├── enemyTurret.ts        # enemy-turret
│   └── enemyDroneBlack.ts    # enemy-drone-black
└── ui/
    └── weaponSelector.ts     # weapon-selector

最終的なmain.ts: 200-300行まで削減予定
```

---

## 3. 技術選定と制約

### 技術スタック
- **WebXR**: A-Frame 1.4.2（VR対応が簡単）
- **言語**: TypeScript 5.3.3
- **ビルドツール**: Vite 5.0.11（高速HMR、VR開発向き）
- **3D**: Three.js 0.160.0
- **デプロイ**: Netlify（自動デプロイ設定済み）

### 環境設定
- **開発サーバー**: `npm run dev` → http://localhost:8080
- **ビルド**: `npm run build` → dist/に出力
- **型チェック**: `npm run type-check`
- **Gitブランチ**: `refactor/typescript-migration`

### 完成機能リスト
✅ VR操作システム
  - トリガー: 剣 → 弓切替 → 射撃 → 剣復帰
  - グリップ: 弓の弦引き演出
  - 剣振りモーション検出で攻撃判定
✅ 敵2種（白ドローン・黒ドローン）+ AI
✅ GLBモデル対応 + フォールバック機構
✅ 剣の物理判定（Box3による高精度接触判定）
✅ 3秒ディレイによる即死バグ対策
✅ 弾丸システム（プレイヤー・敵）
✅ HUD表示（キル数・被弾数・時間）
✅ スコア計算＆クリア画面
✅ スタート画面
✅ 宇宙船風ステージ（マゼンタ背景・水色グリッド）
✅ GitHub連携 + Netlify自動デプロイ

### 既存の優れた点（保持すべき資産）
- GLBロード機構（ModelManager）
- Blender座標系変換ロジック（helpers.ts）
- 3秒ディレイによる即死バグ対策
- Box3による高精度当たり判定
- 敵AIの挙動調整（カクカク移動・爆発タイミング等）
- ゲームバランス（敵速度・弾速・ダメージ）

### 制約・妥協ポイント
1. **A-Frame型定義の不完全性**: 一部`any`型で回避（Phase 6で改善予定）
2. **Three.js多重インポート警告**: Phase 6でモジュール統合予定
3. **ビルドサイズ増加**: 22.99kB → 243.18kB（gzip後66.06kBは許容範囲）
4. **グローバル変数の一部残存**: Phase 6で完全削除予定

---

## 4. 現状と次の一手

### ✅ Phase 4完了: A-Frameコンポーネント分割完了（2026-02-11）

**成果**:
- main.ts: 1193行 → 273行（**920行削減！77%減少**）
- コンポーネントファイル総計: 849行（8ファイル）
- ビルドサイズ: 251.57kB（gzip 69.23kB）← 前回243.18kB (gzip 66.06kB) から微増

**分割完了したコンポーネント**:
```
src/components/
├── weapons/
│   ├── swordComponent.ts (319行) - 剣/弓の統合武器システム
│   ├── projectileComponent.ts (38行) - 弾丸の飛行ロジック
│   └── playerArrowComponent.ts (29行) - 矢の当たり判定
├── enemies/
│   ├── enemyMobileComponent.ts (137行) - 白ドローン（射撃型）
│   ├── enemyBulletComponent.ts (26行) - 敵の弾丸
│   ├── enemyTurretComponent.ts (150行) - 青八面体（固定砲台）
│   └── enemyDroneBlackComponent.ts (139行) - 黒ドローン（自爆型）
└── weaponControllerComponent.ts (未カウント) - VRコントローラー
```

**型定義の改善**:
- Enemy型にtakeDamage()とlastHitTimeを追加
- THREE.js型の明示的インポート完了
- A-Frameカメラの型キャストを統一（any型で統一）

**main.tsの最終構成（273行）**:
- import文: 41行
- コンポーネント登録: 14行
- 初期化処理: 30行
- 敵生成関数: 80行
- ゲームクリア処理: 108行

---

### 🎮 Phase 5: VR実機確認（次のタスク）

**Quest 2確認チェックリスト**:

#### 基本動作
- [ ] ゲームが起動する
- [ ] VRモードに入れる
- [ ] コントローラーが認識される

#### 武器システム
- [ ] 剣を選択できる（weapon-selector）
- [ ] 弓を選択できる
- [ ] 剣を振り下ろせる（トリガー）
- [ ] 弓を引いて射撃できる（握力→トリガー）

#### 敵システム
- [ ] 敵が出現する（白ドローン）
- [ ] 敵が移動する
- [ ] 敵を倒せる
- [ ] キル数がカウントされる

#### HUD表示
- [ ] キル数が表示される
- [ ] 命中率が表示される
- [ ] 数字が更新される

#### バグチェック
- [ ] エラーが出ていない（開発者コンソール）
- [ ] フレームレートが安定している
- [ ] クラッシュしない

**VR確認後のアクション**:
1. バグがなければ → Phase 4（A-Frameコンポーネント分割）
2. バグがあれば → 修正してから次へ

---

### 🚀 Phase 4: A-Frameコンポーネント分割（完了✅）

**目的**: main.tsのA-Frameコンポーネントを個別ファイルに分離

**完了内容**:
✅ 全8コンポーネントの抽出完了
✅ main.tsから920行削除（77%削減）
✅ 型定義の改善（Enemy型にtakeDamage追加）
✅ ビルド確認完了（251.57kB, gzip 69.23kB）

**Phase 4成果物**:
- swordComponent.ts (319行)
- projectileComponent.ts (38行)
- playerArrowComponent.ts (29行)
- enemyMobileComponent.ts (137行)
- enemyBulletComponent.ts (26行)
- enemyTurretComponent.ts (150行)
- enemyDroneBlackComponent.ts (139行)
- weaponControllerComponent.ts (154行)

**最終的なmain.ts**: 273行（目標の200-300行達成！）

---

### 📋 Phase 6-7の予定

**Phase 6**: 最適化・リファクタリング（2-3時間）
- 型定義の強化（A-Frame型定義の完全化）
- Three.js多重インポート警告の解消
- パフォーマンス最適化（Tree Shaking）
- グローバル変数の完全削除

**Phase 7**: ドキュメント整備（1-2時間）
- README.md更新
- API_DESIGN.md作成
- TROUBLESHOOTING.md作成

---

## 5. アカウント切り替え後の再開コマンド

### 状態確認
```bash
cd ~/Desktop/snipe-and-slash

# 現在のPhase確認
git log --oneline -5

# ブランチ確認
git branch

# ビルド状態確認
npm run build
```

### 開発再開
```bash
# 開発サーバー起動
npm run dev
# → http://localhost:8080

# 型チェック
npm run type-check
```

### 緊急ロールバック
```bash
# Phase 3に戻す
git reset --hard 75778f2

# Phase 2に戻す
git reset --hard phase-2-complete

# Phase 1に戻す
git reset --hard phase-1-complete
```

---

## 6. Phase別進捗管理

| Phase | 状態 | 完了日 | 備考 |
|-------|------|--------|------|
| Phase 0 | ✅ 完了 | 2026-02-10 | 計画書作成完了 |
| Phase 1 | ✅ 完了 | 2026-02-10 | TypeScript環境構築完了 |
| Phase 2 | ✅ 完了 | 2026-02-10 | ファイル分割完了（468行の新規コード） |
| Phase 3 | ✅ 完了 | 2026-02-10 | クラス化・依存性注入完了 |
| Phase 4 | ✅ 完了 | 2026-02-11 | コンポーネント分割完了（920行削減） |
| Phase 5 | ⏳ 次回 | - | VR実機確認予定 |
| Phase 6 | ⏳ 未着手 | - | 最適化・型定義強化 |
| Phase 7 | ⏳ 未着手 | - | ドキュメント整備 |

---

**本番URL**: https://playful-concha-6af59f.netlify.app  
**GitHub**: https://github.com/siro-314/snipe-and-slash  
**最終更新**: 2026-02-11 Phase 4完了・GitHubプッシュ完了（commit abd2074）  
**次のタスク**: Netlify設定確認 → VR実機確認（Phase 5）

---

## 🚨 次のClaude向け重要メモ

### Netlify自動デプロイが動いていない可能性

**状況**:
- Phase 4完了後、GitHubへpush完了（commit abd2074）
- しかし、Netlifyが自動デプロイされていない様子
- 本番URLが更新されていない可能性が高い

**原因の可能性**:
1. Netlifyのブランチ設定が `main` のみで、`refactor/typescript-migration` ブランチを監視していない
2. ビルドコマンドやデプロイ設定に問題がある
3. GitHubとNetlifyの連携が切れている

**次回の対応手順**:
1. **ブラウザMCPを使ってNetlify管理画面にアクセス**
   ```
   browser_navigate: https://app.netlify.com
   ```

2. **サイト設定を確認**
   - Site settings → Build & deploy → Continuous deployment
   - Branch deploysの設定を確認
   - `refactor/typescript-migration` ブランチが監視対象になっているか確認

3. **ブランチデプロイ設定を追加**
   - 「Deploy contexts」で `refactor/typescript-migration` を追加
   - または、`main` ブランチにマージしてから確認

4. **手動デプロイでテスト**
   - Deploys → Trigger deploy → Deploy site
   - これで最新のコミットがデプロイされるか確認

5. **ビルドログを確認**
   - デプロイ失敗している場合、ログでエラーを確認
   - `npm run build` が正常に動作しているか確認

**推奨アクション**:
- まずはブラウザMCPでNetlify管理画面を開く
- Site settings → Build & deploy を確認
- 必要に応じて手動デプロイを実行
- 設定変更後、再度GitHubへpushして自動デプロイをテスト

**緊急時の代替案**:
- `refactor/typescript-migration` を `main` にマージする
- Vercelなど別のホスティングサービスに切り替える

---
---

## 🚨 次のClaude向け重要メモ

### Netlify自動デプロイが動いていない可能性

**状況**:
- Phase 4完了後、GitHubへpush完了（commit abd2074）
- しかし、Netlifyが自動デプロイされていない様子
- 本番URLが更新されていない可能性が高い

**詳細な対応手順は `NEXT_CLAUDE_TODO.md` を参照してください！**

このファイルには以下が記載されています：
- ブラウザMCPを使ったNetlify設定確認の具体的手順
- Branch deploys設定の変更方法
- 手動デプロイの実行方法
- トラブルシューティングガイド
- 完了後の次のステップ

**クイックアクション**:
1. `NEXT_CLAUDE_TODO.md` を読む
2. ブラウザMCPでNetlify管理画面を開く
3. Branch deploys設定を確認・修正
4. 手動デプロイを実行して動作確認

---

## 5. アカウント切り替え後の再開コマンド

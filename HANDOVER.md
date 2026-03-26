# Snipe and Slash - Claude専用引き継ぎファイル

## 1. プロジェクトの目的（判断の軸）

**目標**: WebXRベースのブラウザVRゲーム「SNIPE & SLASH」のTypeScriptリファクタリング
- クリーンアーキテクチャへの移行完了
- **判断基準**: 疎結合、拡張性、堅牢性

## 2. ディレクトリマップと役割

```
snipe-and-slash/
├── src/
│   ├── domain/      # ドメインロジック
│   ├── managers/    # マネージャー層
│   ├── components/  # A-Frameコンポーネント
│   ├── utils/       # ユーティリティ
│   ├── global.d.ts  # グローバルTHREE型定義
│   └── main.ts      # エントリーポイント
└── HANDOVER.md      # このファイル
```

## 3. 技術選定

- **WebXR**: A-Frame 1.4.2 (CDN)
- **3D**: A-FrameのグローバルTHREE（Three.js r147内包）
- **言語**: TypeScript 5.3.3
- **ビルド**: Vite 5（threeをexternalに設定）
- **デプロイ**: Netlify（自動デプロイ）

## 4. 重要な技術的判断

### ✅ Three.js重複インスタンス問題の解決（2026-02-12）

**根本原因**: `import * as THREE from 'three'` でViteが**別のThree.js**をバンドルしていた。
A-Frame（CDN）も自前のThree.jsを持つため、2つのThree.jsが共存。
→ `instanceof THREE.Object3D` が常にfalse → `setObject3D` エラー

**解決策**:
1. 全ファイルから `import * as THREE from 'three'` を削除
2. A-FrameのグローバルTHREEを使用
3. `vite.config.ts` で `three` を `external` に設定
4. `src/global.d.ts` で型定義

### ✅ console警告の完全排除（2026-02-12）
- **Three.js重複警告**: `aframe-extras` を `movement-controls` のみの個別ビルド（`aframe-extras.controls.min.js`）に変更し解消。
- **Raycaster警告**: `index.html` に `raycaster="objects: [data-raycastable]"` を追加しパフォーマンス警告を解消。

## 5. 現状と次の一手

### ✅ 弓の弦掴みバグ修正（2026-03-26）

**根本原因2点（Valve SteamVR Longbowとの比較で特定）**:
1. `isNearString()` で `nockMarker.position`（ローカル座標）と `otherHand.getWorldPosition()`（ワールド座標）を比較していた → 常にfalseでstartDraw()が呼ばれなかった
2. 引き量計算が単純距離だったため、前後左右どの方向に動かしても反応してしまっていた

**修正内容**:
1. `nockMarker.getWorldPosition()` でワールド座標に統一
2. 引き量を「弓の後方向への内積」で計算（Valve方式）→ 正しく後ろに引いたときだけ増加

**コミット**: `c28d6aa`

---

### ✅ Phase 5 完了 - 100点満点状態（2026-02-12）

**現状**:
- コンソールエラー・警告（`emissive`等のschema警告を除く）が**ゼロ**。
- `setObject3D` エラー解消済。
- モデルロード、敵スポーン、武器生成すべて正常。
- バンドルサイズ: 約24KB（最適化済）

**デプロイ情報**:
- コミット: `main@64e1894`
- 本番URL: https://playful-concha-6af59f.netlify.app

---

### 🎮 次のタスク: VR実機テスト & Phase 6

**タスク1**: VR実機確認（Quest 2）  **← NOW!**
- サイトにアクセスし、VRモードに入る
- コントローラー操作確認（トリガー、グリップ、剣の振り）
- パフォーマンス（FPS）確認

**タスク2**: Phase 6「ゲーム性の強化」へ
- 敵のバリエーション追加
- エフェクト追加（斬撃、爆発）
- スコア・ランキング機能実装

---

## 6. アカウント切り替え後の再開コマンド

```bash
cd ~/Desktop/snipe-and-slash
git log --oneline -5
npm run dev
```

---

## 7. Phase別進捗管理

| Phase | 状態 | 完了日 |
|-------|------|--------|
| Phase 0-4 | ✅ 完了 | 2026-02-11 |
| **Phase 5** | **✅ 完了** | **2026-02-12** |
| Phase 5 確認 | **✅ 完了** | **2026-02-12** |
| Phase 6 | ⏳ 未着手 | - |

---

**本番URL**: https://playful-concha-6af59f.netlify.app  
**GitHub**: https://github.com/siro-314/snipe-and-slash  
**最終更新**: 2026-03-26 弓の弦掴みバグ修正コミット c28d6aa をプッシュ・Netlify反映済み  
**次のタスク**: Quest 2でVR実機テスト（弓の弦を握って引く動作の確認）

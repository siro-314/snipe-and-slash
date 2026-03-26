# Snipe and Slash - Claude専用引き継ぎファイル

## 1. プロジェクトの目的（判断の軸）
WebXRブラウザVRゲーム「SNIPE & SLASH」。剣＋弓のアクションゲーム。
判断基準: 疎結合・拡張性・堅牢性。

## 2. ディレクトリマップと役割
```
snipe-and-slash/
├── src/
│   ├── domain/       # ドメインロジック・gameState
│   ├── managers/     # modelManager等
│   ├── components/
│   │   ├── weaponControllerComponent.ts  # 右手のみweapon-controller（修正済）
│   │   ├── weapons/
│   │   │   ├── swordComponent.ts         # 剣＋弓モード。otherHand=左手
│   │   │   ├── playerArrowComponent.ts
│   │   │   └── projectileComponent.ts
│   │   ├── enemies/
│   │   ├── debug/
│   │   │   └── bowDebugComponent.ts      # VR内デバッグパネル（a-text）
│   │   └── ui/
│   ├── global.d.ts   # グローバルTHREE型定義
│   └── main.ts
├── index.html        # leftHandにweapon-controllerなし（修正済）
└── HANDOVER.md
```

## 3. 技術選定と制約
- A-Frame 1.4.2 (CDN) + TypeScript 5.3.3 + Vite 5 + Netlify自動デプロイ
- `import THREE from 'three'` 禁止（A-Frame CDN版と競合する）→ グローバルTHREEを使用
- vite.config.ts で three を external 設定済み

## 4. 現状と次の一手

### ✅ Phase 0〜5 完了（〜2026-02-12）
TypeScript移行・Three.js重複インスタンス問題解消・コンソールエラーゼロ・Netlify本番デプロイ済み。

### ✅ 弓バグ調査・修正中（2026-03-26）

#### 解決した問題
- **isNearString()の座標系不一致**: nockMarker.position（ローカル）とotherHand.getWorldPosition()（ワールド）を混在 → getWorldPosition()に統一
- **nockMarkerを廃止**: this.string.getWorldPosition()で弦の座標を直接取得するよう変更

#### バグA・C修正（コミット 780a4be）
- **バグC**: leftHandにもweapon-controllerが設定されていた → swordが2つ生成され競合
  - 修正: index.html の leftHand から weapon-controller を削除
- **バグA**: setOtherHandのタイミング不確実（componentinitialized）
  - 修正: weaponEntity.hasLoaded チェック + loaded イベント(once) で確実実行

#### 現在のデバッグ状態
- bowDebugComponent.ts が有効（カメラ70cm前方にa-textパネル表示）
- 弦を中心とした円柱（半径0.3m・高さ0.8m）が可視化済み
- isNearString() は座標判定有効（0.3m以内で黄色）
- shoot() の drawProgress ガードは撤廃済み（0でも発射）

### 🎮 次のタスク

**今すぐ**: Quest 2でデプロイを確認
- https://playful-concha-6af59f.netlify.app
- デバッグパネルで [A]otherHand: OK(leftHand) / [C]sword=right を確認
- 弓モード → 左手を円柱（弦の位置）に入れる → 黄色になるか
- グリップ → 赤・draw%増加するか
- グリップ離す → 矢が飛ぶか

**動作確認後**: bowDebugComponent と nockCylinder を削除してPhase 6へ

## 5. 再開コマンド
```bash
cd ~/Desktop/snipe-and-slash && git log --oneline -5 && npm run dev
```

**本番URL**: https://playful-concha-6af59f.netlify.app  
**GitHub**: https://github.com/siro-314/snipe-and-slash  
**最終更新**: 2026-03-26 バグA・C修正 コミット 780a4be  
**次のタスク**: Quest 2でデバッグパネルを見ながら弓動作確認

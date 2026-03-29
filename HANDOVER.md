# Snipe and Slash - Claude専用引き継ぎファイル

## 1. プロジェクトの目的
WebXRブラウザVRゲーム「SNIPE & SLASH」。剣＋弓のアクションゲーム。
判断基準: 疎結合・拡張性・堅牢性。

## 2. ディレクトリマップと役割
```
src/components/
  weaponControllerComponent.ts  # 両手独立。triggerHeldフラグで発射後の弓維持を制御
  weapons/
    swordComponent.ts           # 剣＋弓。nockOffsetで握り判定位置管理。shootDirPitchで射出補正
    projectileComponent.ts      # gravity属性で放物線。進行方向にlookAt
    playerArrowComponent.ts
  debug/
    bowDebugComponent.ts        # CALIBシステム全体を管理（下記詳細）
index.html                      # 両手にweapon-controller
```

## 3. 技術選定と制約
- A-Frame 1.4.2 (CDN) + TypeScript 5.3.3 + Vite 5 + Netlify自動デプロイ
- `import THREE from 'three'` 禁止 → グローバルTHREEを使用
- 戻り値型アノテーションは省略（THREE.Vector3等はNG）
- `handEl` など HTMLElement は必ず `as any` でキャストしてからA-Frame APIを使う
- レイキャスト不使用 → UI操作は「手を近づける・矢を当てる」方式で統一
- PITCH/YAWの補正ステップは90度単位固定（軸ズレ対応用、連続調整はしない）
- モデルのrotationは触らない。射出方向ズレは shootDirPitch の初期値で補正する

## 4. 現状と次の一手

### ✅ コミット 78ed4a8（最新）
bowDebugComponent.ts を正式実装：
- **[CALIB] ボタン**: 前方2m。手/矢で触れてON/OFF
- **[NOCK CALIB] サブボタン**（CALIB ON中）:
  - 押すと調整専用の別弓セット（緑の大球）がシーン左前方 -0.8 1.2 -1.5 に出現
  - 手元の弓は一切変更しない（別セット）
  - グリップで緑球を掴んで動かす → 両手の[sword]コンポーネントのnockOffsetにリアルタイム反映
  - もう一度押すと非表示
  - デバッグパネルに `OFS:x y z GRAB:YES/no` を数値表示
- **[PITCH+/-][YAW+/-] ボタン**: 90度ステップで矢の射出角補正
  - デバッグパネルに `PITCH:Xd YAW:Yd` を数値表示

### ✅ コミット 19f3f5e
- shootDirPitch = -Math.PI/2 を初期値として設定（Quest 2での調査結果）
- model.rotation は元の +PI/2 に維持

### ⚠️ 過去の再試行ループによる破損（解消済み）
- 17:37〜17:46の間、別セッションのClaudeが記憶なしでedit_blockやwrite_fileを複数回実行
- bowDebugComponent.tsが47行の壊れた状態になっていた
- git checkout -- で復旧し、今回の78ed4a8で正式実装

### ❓ 次にテストしてほしいこと（Quest 2）
1. 矢が正面に飛ぶか（shootDirPitch=-90度デフォルト）
2. 弓の見た目が正常か（model.rotation変更は取り消し済み）
3. NOCK CALIB: 左前方に緑球が出るか、グリップで掴んで動かせるか
4. デバッグパネルにOFS数値が更新されるか
5. PITCH+/-/YAW+/-ボタンで数値が90度刻みで変化するか

## 5. 再開コマンド
```bash
cd ~/Desktop/snipe-and-slash && git log --oneline -5 && npm run dev
```

**本番URL**: https://playful-concha-6af59f.netlify.app
**GitHub**: https://github.com/siro-314/snipe-and-slash
**最終更新**: 2026-03-29 コミット 78ed4a8

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
- PITCH/YAWの補正ステップは90度単位固定
- モデルのrotationは触らない。射出方向ズレは shootDirPitch 初期値で補正

## 4. 現状と次の一手

### ✅ コミット 9f5babf（最新）
- **nockSphere 形状変更**: SphereGeometry → CapsuleGeometry(r=0.12, len=0.24) でY軸方向に長い楕円形
- **nockOffset デフォルト値**: `z=-1.0` に設定（Quest 2 CALIB調査結果）
- **isNearString 判定**: 球の距離判定 → 楕円判定（XZ方向r=0.12, Y方向h=0.24）

### ⚠️ 将来の弓サイズ縮小時のメモ
- 弓モデルのスケールを変更する場合は nockOffset も同倍率で調整が必要
- 理想は弓モデルの object3D スケールを参照して自動追従させる設計
- 変更箇所: swordComponent.ts の `this.nockOffset` 初期値 + nockSphere の CapsuleGeometry サイズ
**根本原因の修正**: `oculus-touch-controls` は毎フレーム position を上書きするため
`setAttribute('position', ...)` では絶対に固定できなかった。

**正しい解決策**:
- `sword.setCalibrationMode(true, fixedWorldPos)` で固定座標を渡す
- `swordComponent.tick()` の**先頭**で毎フレーム `object3D.position` を強制上書き
- `oculus-touch-controls` の更新より後で実行されるので勝てる
- CALIB OFF → `calibFixedWorldPos = null` にして固定解除、自然に手追従に戻る

**CALIBの新しい設計（3本目の弓を出す発想を廃止）:**
- CALIB ON → 左手エンティティ（#leftHand）の position を固定座標 `0 1.2 -1.7` に変更
  - 左手の弓がCALIBボタン前に固定表示される（手元の弓そのもの）
  - CALIB OFF → removeAttribute('position') で元の手追従に戻す
- [AXIS:X/Y/Z] ボタンで操作軸を選択（デフォルト Y）
  - グリップ握りながら手を動かすと選択軸方向にのみ nockOffset が変化（感度1.5倍）
- [PITCH+/-] [YAW+/-] → 90度ステップで射出補正（変更なし）
- デバッグパネルに `AXIS:[Y] grip:YES/no / OFS X:0.000 Y:0.000 Z:0.000 / PITCH:Xd YAW:Yd` 表示

### ✅ コミット 19f3f5e
- shootDirPitch = -Math.PI/2 を初期値として設定（Quest 2での調査結果）

### ❓ 次にテストしてほしいこと（Quest 2）
1. CALIB ON で左手の弓がボタン前（前方 1.7m 高さ 1.2m）に固定されるか
2. AXIS:Y を選択してグリップ握りながら手を上下に動かすと OFS Y 値が変化するか
3. AXIS:X/Z も同様に動作するか
4. CALIB OFF で左手の弓が手の位置追従に戻るか
5. nockSphere が調整した位置に追従しているか（弓モード中も確認）

## 5. 再開コマンド
```bash
cd ~/Desktop/snipe-and-slash && git log --oneline -5 && npm run dev
```

**本番URL**: https://playful-concha-6af59f.netlify.app
**GitHub**: https://github.com/siro-314/snipe-and-slash
**最終更新**: 2026-03-29 コミット 4e7f684

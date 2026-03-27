# Snipe and Slash - Claude専用引き継ぎファイル

## 1. プロジェクトの目的
WebXRブラウザVRゲーム「SNIPE & SLASH」。剣＋弓のアクションゲーム。
判断基準: 疎結合・拡張性・堅牢性。

## 2. ディレクトリマップと役割
```
src/components/
  weaponControllerComponent.ts  # 両手独立。triggerHeld フラグで発射後の弓維持を制御
  weapons/
    swordComponent.ts           # 剣＋弓。nockOffset で握り判定位置を管理。lastShootLog で発射ログ
    projectileComponent.ts      # gravity属性で放物線。進行方向にlookAt
    playerArrowComponent.ts
  debug/
    bowDebugComponent.ts        # CALIBシステム全体を管理
                                # - デバッグテキスト: CALIBボタン上部に固定（カメラ追従ではない）
                                # - CALIBボタン: シーン固定（前方2m高さ1.4m）、手 or 矢で触れるとトグル
                                # - CALIB ON中: 参照弓（-0.8 1.2 -1.5固定）を表示
                                #   参照弓のnockSphere（緑球）をグリップで掴んで動かす
                                #   → 手元の弓のnockOffsetに即反映
                                # - PITCH/YAW: 矢の発射方向を90度単位で補正
index.html                      # 両手にweapon-controller
```

## 3. 技術選定と制約
- A-Frame 1.4.2 (CDN) + TypeScript 5.3.3 + Vite 5 + Netlify自動デプロイ
- `import THREE from 'three'` 禁止 → グローバルTHREEを使用
- 戻り値型アノテーションは省略（THREE.Vector3等はNG）
- `handEl` など HTMLElement は必ず `as any` でキャストしてからA-Frame APIを使う
- レイキャスト不使用 → UI操作は「手を近づける・矢を当てる」方式で統一
- CALIBモードの手元弓移動ロジックは bowDebugComponent が担当（swordComponent は nockOffset の公開のみ）

## 4. 現状と次の一手

### ✅ コミット 7e824b2（最新）
- **デバッグテキスト固定**: カメラ追従をやめてCALIBボタン上部に固定（btnRoot の子）
- **参照弓CALIBシステム**: CALIB ON時にシーン内固定位置（-0.8 1.2 -1.5）に参照弓表示
  - 参照弓のnockSphere（緑球）を両手グリップで掴んで動かせる
  - 動かした量が手元の弓の nockOffset に即反映
  - bowDebugComponent が両手のgripdown/gripupリスナーを管理（CALIB ON/OFFで付け外し）
- **swordComponent 整理**: CALIBモードの移動ロジックを除去、nockOffset は公開プロパティのみ
- **ボタン判定**: _checkHit 半径を0.22mに拡大（当たりやすく）

### 🎮 次のタスク（Quest 2でテスト）
1. CALIBボタン（前方2m白いブロック）に手を近づけてONになるか確認
2. CALIB ON後、左前方（-0.8 1.2 -1.5付近）に緑の球が出るか確認
3. 参照弓の緑球をグリップで掴んで動かせるか確認
4. 動かすと手元の弓のnockSphere（弦付近）も同じ位置に移動するか確認
5. PITCH/YAWボタンで矢の方向調整→正面に飛ぶPITCH/YAW値を確認して定数化
6. 確認後: bowDebugComponent削除・定数化してPhase 6へ

### ❓ 未解決の疑問（テスト後に判断）
- `fallback: false` はGLBの矢を使用中 = 正常。矢が細い場合は arrowPrefab スケールを上げる
- 矢の方向ズレは PITCH 補正で対応（現在90度単位で調整可能）

## 5. 再開コマンド
```bash
cd ~/Desktop/snipe-and-slash && git log --oneline -5 && npm run dev
```

**本番URL**: https://playful-concha-6af59f.netlify.app
**GitHub**: https://github.com/siro-314/snipe-and-slash
**最終更新**: 2026-03-27 コミット 7e824b2

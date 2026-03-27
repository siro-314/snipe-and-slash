# Snipe and Slash - Claude専用引き継ぎファイル

## 1. プロジェクトの目的
WebXRブラウザVRゲーム「SNIPE & SLASH」。剣＋弓のアクションゲーム。
判断基準: 疎結合・拡張性・堅牢性。

## 2. ディレクトリマップと役割
```
src/components/
  weaponControllerComponent.ts  # 両手独立。トリガーdown=弓、up=剣（引き中は無視）
  weapons/
    swordComponent.ts           # 剣＋弓モード。calibrationMode内蔵
    projectileComponent.ts      # 弾丸。gravity属性で放物線対応
    playerArrowComponent.ts     # 矢のマーカー（当たり判定用）
  debug/
    bowDebugComponent.ts        # VR内デバッグパネル。剣で斬るorボタンに矢を当てるとCALIBトグル
index.html                      # 両手に weapon-controller あり
```

## 3. 技術選定と制約
- A-Frame 1.4.2 (CDN) + TypeScript 5.3.3 + Vite 5 + Netlify自動デプロイ
- `import THREE from 'three'` 禁止 → グローバルTHREEを使用
- 型アノテーション `THREE.Vector3` などの戻り値型は省略（グローバル宣言と競合する場合あり）
- レイキャストはゲーム中は非表示 → UI操作は「剣で斬る・矢を当てる」方式で統一

## 4. 現状と次の一手

### ✅ コミット f5364a1（最新）修正内容
- **トリガー離し→剣に戻る**（弦を引いている最中はトリガー離しを無視、グリップ離し発射後に剣復帰）
- **連射**: トリガー押しっぱなしで弦引き→離し→また引きで連射可能
- **矢の方向**: カメラの向き基準に変更（弓モデルの回転補正に依存しない）
- **矢の太さ**: フォールバックをCylinderGeometry(r=0.015, h=0.6)に変更、モデル矢はスケール2.5倍
- **威力カーブ**: drawProgress二乗カーブ。0.3未満はキャンセル。0.3→遅い, 0.7→実用, 1.0→最速
- **重力**: projectileにgravity属性追加。弱いほど重力大で山なり軌道
- **CALIBボタン**: レイキャスト不要。剣で斬るか矢を当てるとON/OFFトグル

### 🔍 弦の握り判定位置について
- 現在は `this.string.getWorldPosition()` + `nockOffset` で調整可能
- CALIBモードで握り判定球（緑の球）をグリップで掴んで動かすと OFFSET 値がパネルに表示される
- ユーザーが OFFSET 値を読んで教えてくれれば `nockOffset` を定数化してCALIBモードを削除できる

### 🎮 次のタスク
1. Quest 2でテスト:
   - トリガー離しで剣に戻るか
   - 矢が正面方向に飛ぶか
   - 引き量で威力・軌道が変わるか（0.3未満でキャンセル確認）
   - CALIBボタンに剣を当てるとONになるか
   - CALIB ON中に握り判定球を弦の正しい位置に動かしてOFFSET値を確認
2. OFFSET値をもらったら nockOffset を定数化、bowDebugComponent削除してPhase 6へ

## 5. 再開コマンド
```bash
cd ~/Desktop/snipe-and-slash && git log --oneline -5 && npm run dev
```

**本番URL**: https://playful-concha-6af59f.netlify.app
**GitHub**: https://github.com/siro-314/snipe-and-slash
**最終更新**: 2026-03-27 コミット f5364a1

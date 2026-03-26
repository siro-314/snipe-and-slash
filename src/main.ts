/**
 * SNIPE & SLASH - メインエントリーポイント
 * 
 * WebXR VRゲーム - ブラウザで遊べる剣と弓のアクションゲーム
 * 
 * Phase 3開始: クラス化・依存性注入
 * - GameStateManager統合（Step 3.1）
 * - ModelManager統合予定（Step 3.2）
 * - HUDManager統合予定（Step 3.3）
 */

// @ts-nocheck - A-Frameコンポーネント対応のため型チェック緩和

import type {
  WeaponType,
  HandType,
  ModelName,
  ModelManagerType
} from './domain/types';

// Domain層
import { gameState } from './domain/gameState';

// Managers層（段階的に統合）
import { modelManager } from './managers/modelManager';
import { hudManager } from './managers/hudManager';

// Utils層
import { getDistance, getRandomSpawnPosition } from './utils/helpers';

// Components層（Phase 4で分割完了）
import {
  registerSwordComponent,
  registerProjectileComponent,
  registerPlayerArrowComponent,
  registerEnemyMobileComponent,
  registerEnemyBulletComponent,
  registerEnemyTurretComponent,
  registerEnemyDroneBlackComponent,
  registerWeaponControllerComponent
} from './components';

// デバッグコンポーネント
import { registerBowDebugComponent } from './components/debug/bowDebugComponent';

// ========================================
// ユーティリティ関数
// ========================================
function updateHUD(): void {
  hudManager.update(gameState);
}

// ========================================
// 武器コンポーネント: 剣 → weapons/swordComponent.tsに移動
// ========================================
// (抽出済み: Phase 4)

// ========================================
// 武器コンポーネント: 弓
// ========================================
// ========================================
// 武器コンポーネント: 弓 (廃止 - swordコンポーネントに統合)
// ========================================
/*
AFRAME.registerComponent('bow', {
  // ... (旧実装はswordに統合済み) ...
});
*/

// ========================================
// 弾丸コンポーネント → weapons/projectileComponent.tsに移動
// ========================================
// (抽出済み: Phase 4)

// ========================================
// 敵コンポーネント: 移動型（白ドローン - 射撃型）→ enemies/enemyMobileComponent.tsに移動
// ========================================
// (抽出済み: Phase 4)

// ========================================
// 敵の弾丸（プレイヤーに当たったら被弾）→ enemies/enemyBulletComponent.tsに移動
// ========================================
// (抽出済み: Phase 4)

// ========================================
// 敵コンポーネント: 固定型（青八面体）→ enemies/enemyTurretComponent.tsに移動
// ========================================
// (抽出済み: Phase 4)

// ========================================
// コンポーネント登録（Phase 4: 全コンポーネント分割完了）
// ========================================
// 武器コンポーネント
registerSwordComponent();
registerProjectileComponent();
registerPlayerArrowComponent();

// 敵コンポーネント
registerEnemyMobileComponent(checkGameClear);
registerEnemyBulletComponent();
registerEnemyTurretComponent(updateHUD, checkGameClear);
registerEnemyDroneBlackComponent(updateHUD, checkGameClear);

// コントローラーコンポーネント
registerWeaponControllerComponent();

// デバッグコンポーネント（弓の状態可視化）
registerBowDebugComponent();

// ========================================
// 初期化: ModelManager初期化 → 敵配置はSTARTボタン後
// ========================================
document.addEventListener('DOMContentLoaded', function () {
  const scene = document.querySelector('a-scene');

  scene.addEventListener('loaded', async function () {
    console.log('[Game] Scene loaded, initializing...');

    // ModelManagerの初期化（ローダーのみセットアップ）
    modelManager.init();
    console.log('[Game] ModelManager initialized');

    // HUD更新ループ
    setInterval(updateHUD, 100);

    console.log('[Game] Scene initialization complete');
  });
});

/**
 * GLBモデルをプリロード
 * - STARTボタンクリック時に実行
 * - 全モデルのロード完了を待つ
 */
async function preloadModels() {
  try {
    const v = Date.now();
    console.log('[Game] Preloading models...');
    
    await Promise.all([
      modelManager.load('drone_white', `/drone_white.glb?v=${v}`),
      modelManager.load('drone_black', `/drone_black.glb?v=${v}`),
      modelManager.load('sword', `/sword.glb?v=${v}`)
    ]);
    
    console.log('[Game] ✅ All models loaded successfully');
  } catch (error) {
    console.warn('[Game] ⚠️ Some models failed to load, using fallback geometry:', error.message);
  }
}

// ========================================
// 敵コンポーネント: 黒ドローン（自爆型）→ enemies/enemyDroneBlackComponent.tsに移動
// ========================================
// (抽出済み: Phase 4)

function spawnEnemies() {
  const scene = document.querySelector('a-scene');

  // 白ドローン（射撃型）を3体配置
  for (let i = 0; i < 3; i++) {
    const enemy = document.createElement('a-entity');
    enemy.setAttribute('enemy-mobile', '');
    const angle = (i / 3) * Math.PI * 2;
    const radius = 10;
    enemy.setAttribute('position', `${Math.cos(angle) * radius} 1.5 ${Math.sin(angle) * radius}`);
    scene.appendChild(enemy);
  }

  // 黒ドローン（自爆型）を2体配置
  for (let i = 0; i < 2; i++) {
    const enemy = document.createElement('a-entity');
    enemy.setAttribute('enemy-drone-black', '');
    const angle = ((i + 0.5) / 2) * Math.PI * 2;
    const radius = 15;
    enemy.setAttribute('position', `${Math.cos(angle) * radius} 1.5 ${Math.sin(angle) * radius}`);
    scene.appendChild(enemy);
  }

  // 固定型敵（タレット）を2体配置
  const turret1 = document.createElement('a-entity');
  turret1.setAttribute('enemy-turret', '');
  turret1.setAttribute('position', '5 2 -15');
  scene.appendChild(turret1);

  const turret2 = document.createElement('a-entity');
  turret2.setAttribute('enemy-turret', '');
  turret2.setAttribute('position', '-5 2 -15');
  scene.appendChild(turret2);
}

console.log('SNIPE & SLASH - Game Loaded!');

// ========================================
// VRコントローラー操作管理 → weaponControllerComponent.tsに移動
// ========================================
// (抽出済み: Phase 4)

// ========================================
// 弓コンポーネントに弦引きメソッド追加（廃止済み）
// ========================================
/*
// 既存のbowコンポーネントを拡張
const bowProto = AFRAME.components.bow.Component.prototype;
const originalBowInit = bowProto.init;

bowProto.init = function () {
  originalBowInit.call(this);
  this.drawProgress = 0;
};

bowProto.startDraw = function () {
  this.isDrawn = true;
  this.drawStartTime = Date.now();
};

bowProto.tick = function (time, delta) {
  if (this.isDrawn) {
    const elapsed = Date.now() - this.drawStartTime;
    this.drawProgress = Math.min(elapsed / 1000, 1); // 1秒で最大

    // 弦を引くアニメーション（弓を少し傾ける）
    this.el.object3D.rotation.x = -this.drawProgress * 0.3;
  }
};
*/

// ========================================
// プレイヤーの矢が敵に当たる判定 → weapons/playerArrowComponent.tsに移動
// ========================================
// (抽出済み: Phase 4)

// ========================================
// ゲームクリア・リスタート機能
// ========================================
function checkGameClear() {
  if (gameState.getEnemies().length === 0) {
    showGameClear();
  }
}

function showGameClear() {
  const elapsed = Math.floor((Date.now() - gameState.getStartTime()) / 1000);
  const score = calculateScore(elapsed, gameState.getKills(), gameState.getHits());

  const hud = document.getElementById('hud');
  hud.innerHTML = `
    <h2 style="color: #00ff00; font-size: 24px;">🎉 GAME CLEAR!</h2>
    <div>時間: ${elapsed}秒</div>
    <div>キル数: ${gameState.kills}</div>
    <div>被弾数: ${gameState.hits}</div>
    <div style="font-size: 20px; margin-top: 10px;">スコア: ${score}</div>
    <button onclick="restartGame()" style="margin-top: 15px; padding: 10px 20px; font-size: 16px; cursor: pointer;">
      もう一度プレイ
    </button>
  `;
}

function calculateScore(time, kills, hits) {
  // スコア計算: キル数×100 - 被弾×50 - 時間×2
  const baseScore = kills * 100;
  const hitPenalty = hits * 50;
  const timePenalty = time * 2;

  return Math.max(0, baseScore - hitPenalty - timePenalty);
}

function restartGame() {
  location.reload();
}

// グローバルに公開
window.restartGame = restartGame;

// ========================================
// スタート画面の制御
// ========================================
document.addEventListener('DOMContentLoaded', function () {
  const startButton = document.getElementById('startButton');
  const startScreen = document.getElementById('startScreen');

  startButton.addEventListener('click', async function () {
    // STARTボタンを無効化（二重クリック防止）
    startButton.disabled = true;
    startButton.textContent = 'Loading...';
    
    // モデルプリロード完了を待つ
    await preloadModels();
    
    // 敵を配置
    spawnEnemies();
    
    // 武器を生成（カスタムイベント発火）
    const scene = document.querySelector('a-scene');
    scene.dispatchEvent(new Event('game-started'));
    
    // スタート画面を非表示
    startScreen.style.display = 'none';
    
    // ゲーム開始時刻をリセット
    gameState.startTime = Date.now();
    
    console.log('[Game] Game started!');
  });
});

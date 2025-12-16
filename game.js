// ========================================
// グローバル状態管理
// ========================================
const GameState = {
  kills: 0,
  hits: 0,
  startTime: Date.now(),
  enemies: [],
  projectiles: [],
  currentWeapon: 'sword', // 'sword' or 'bow'
  activeHand: 'right' // 'left' or 'right'
};

// ========================================
// ユーティリティ関数
// ========================================
function updateHUD() {
  document.getElementById('kills').textContent = GameState.kills;
  document.getElementById('hits').textContent = GameState.hits;
  const elapsed = Math.floor((Date.now() - GameState.startTime) / 1000);
  document.getElementById('timer').textContent = elapsed;
}

// ========================================
// 武器コンポーネント: 剣
// ========================================
AFRAME.registerComponent('sword', {
  schema: {
    hand: { type: 'string', default: 'right' }
  },
  
  init: function() {
    // 剣のビジュアル作成（黒グリップ + 水色半透明ブレード）
    const grip = document.createElement('a-cylinder');
    grip.setAttribute('radius', '0.02');
    grip.setAttribute('height', '0.15');
    grip.setAttribute('color', '#1a1a1a');
    grip.setAttribute('position', '0 0 -0.1');
    grip.setAttribute('rotation', '90 0 0');
    
    const blade = document.createElement('a-box');
    blade.setAttribute('width', '0.05');
    blade.setAttribute('height', '0.6');
    blade.setAttribute('depth', '0.01');
    blade.setAttribute('color', '#00d4ff');
    blade.setAttribute('opacity', '0.7');
    blade.setAttribute('transparent', 'true');
    blade.setAttribute('position', '0 0 -0.4');
    blade.setAttribute('rotation', '90 0 0');
    
    // 発光エフェクト
    blade.setAttribute('material', 'shader: flat; emissive: #00d4ff; emissiveIntensity: 2');
    
    this.el.appendChild(grip);
    this.el.appendChild(blade);
    
    // 当たり判定用
    this.blade = blade;
  },
  
  tick: function() {
    // 剣の振り判定はここで実装予定
  }
});

// ========================================
// 武器コンポーネント: 弓
// ========================================
AFRAME.registerComponent('bow', {
  schema: {
    hand: { type: 'string', default: 'right' }
  },
  
  init: function() {
    // 弓本体（黒ベース + 水色発光ライン）
    const bowBody = document.createElement('a-curve');
    
    // シンプルな弓の形状
    const upperLimb = document.createElement('a-box');
    upperLimb.setAttribute('width', '0.02');
    upperLimb.setAttribute('height', '0.4');
    upperLimb.setAttribute('depth', '0.02');
    upperLimb.setAttribute('color', '#0a0a0a');
    upperLimb.setAttribute('position', '0 0.2 0');
    
    const lowerLimb = document.createElement('a-box');
    lowerLimb.setAttribute('width', '0.02');
    lowerLimb.setAttribute('height', '0.4');
    lowerLimb.setAttribute('depth', '0.02');
    lowerLimb.setAttribute('color', '#0a0a0a');
    lowerLimb.setAttribute('position', '0 -0.2 0');
    
    // エネルギーライン（水色発光）
    const energyLine = document.createElement('a-box');
    energyLine.setAttribute('width', '0.01');
    energyLine.setAttribute('height', '0.5');
    energyLine.setAttribute('depth', '0.01');
    energyLine.setAttribute('color', '#00d4ff');
    energyLine.setAttribute('opacity', '0.8');
    energyLine.setAttribute('transparent', 'true');
    energyLine.setAttribute('material', 'shader: flat; emissive: #00d4ff; emissiveIntensity: 3');
    
    this.el.appendChild(upperLimb);
    this.el.appendChild(lowerLimb);
    this.el.appendChild(energyLine);
    
    this.isDrawn = false;
    this.drawStartPos = null;
  },
  
  tick: function() {
    // 弓を引く処理は後で実装
  },
  
  shoot: function() {
    // 矢（エネルギー弾）を発射
    const arrow = document.createElement('a-sphere');
    arrow.setAttribute('radius', '0.05');
    arrow.setAttribute('color', '#00d4ff');
    arrow.setAttribute('material', 'shader: flat; emissive: #00d4ff; emissiveIntensity: 4');
    
    const pos = this.el.object3D.getWorldPosition(new THREE.Vector3());
    const dir = new THREE.Vector3(0, 0, -1);
    dir.applyQuaternion(this.el.object3D.getWorldQuaternion(new THREE.Quaternion()));
    
    arrow.setAttribute('position', pos);
    arrow.setAttribute('projectile', `direction: ${dir.x} ${dir.y} ${dir.z}; speed: 10`);
    arrow.setAttribute('player-arrow', '');
    
    document.querySelector('a-scene').appendChild(arrow);
  }
});

// ========================================
// 弾丸コンポーネント
// ========================================
AFRAME.registerComponent('projectile', {
  schema: {
    direction: { type: 'vec3', default: { x: 0, y: 0, z: -1 } },
    speed: { type: 'number', default: 5 }
  },
  
  init: function() {
    this.velocity = new THREE.Vector3(
      this.data.direction.x,
      this.data.direction.y,
      this.data.direction.z
    ).normalize().multiplyScalar(this.data.speed);
    
    // 5秒後に自動削除
    setTimeout(() => {
      if (this.el.parentNode) {
        this.el.parentNode.removeChild(this.el);
      }
    }, 5000);
  },
  
  tick: function(time, delta) {
    const deltaSeconds = delta / 1000;
    const pos = this.el.object3D.position;
    
    pos.x += this.velocity.x * deltaSeconds;
    pos.y += this.velocity.y * deltaSeconds;
    pos.z += this.velocity.z * deltaSeconds;
  }
});

// ========================================
// 敵コンポーネント: 移動型（白球体）
// ========================================
AFRAME.registerComponent('enemy-mobile', {
  init: function() {
    // 白球体ボディ
    const body = document.createElement('a-sphere');
    body.setAttribute('radius', '0.3');
    body.setAttribute('color', '#ffffff');
    body.setAttribute('metalness', '0.5');
    body.setAttribute('roughness', '0.3');
    
    // 赤い目
    const eye = document.createElement('a-sphere');
    eye.setAttribute('radius', '0.08');
    eye.setAttribute('color', '#ff0000');
    eye.setAttribute('material', 'shader: flat; emissive: #ff0000; emissiveIntensity: 3');
    eye.setAttribute('position', '0 0 0.25');
    
    this.el.appendChild(body);
    this.el.appendChild(eye);
    
    this.health = 1; // 一撃で倒せる
    this.shootCooldown = 2000; // 2秒ごとに射撃
    this.lastShot = Date.now();
    
    GameState.enemies.push(this);
  },
  
  tick: function(time, delta) {
    // プレイヤーの方を向く
    const camera = document.querySelector('[camera]');
    if (!camera) return;
    
    const targetPos = camera.object3D.position;
    this.el.object3D.lookAt(targetPos);
    
    // 射撃処理
    const now = Date.now();
    if (now - this.lastShot > this.shootCooldown) {
      this.shoot();
      this.lastShot = now;
    }
  },
  
  shoot: function() {
    const bullet = document.createElement('a-sphere');
    bullet.setAttribute('radius', '0.1');
    bullet.setAttribute('color', '#ff6666');
    bullet.setAttribute('material', 'shader: flat; emissive: #ff0000; emissiveIntensity: 2');
    
    const pos = this.el.object3D.getWorldPosition(new THREE.Vector3());
    const camera = document.querySelector('[camera]');
    const dir = camera.object3D.position.clone().sub(pos).normalize();
    
    bullet.setAttribute('position', pos);
    bullet.setAttribute('projectile', `direction: ${dir.x} ${dir.y} ${dir.z}; speed: 3`);
    bullet.setAttribute('enemy-bullet', '');
    
    document.querySelector('a-scene').appendChild(bullet);
  },
  
  takeDamage: function() {
    this.health -= 1;
    if (this.health <= 0) {
      this.die();
    }
  },
  
  die: function() {
    GameState.kills++;
    updateHUD();
    
    // 配列から削除
    const index = GameState.enemies.indexOf(this);
    if (index > -1) {
      GameState.enemies.splice(index, 1);
    }
    
    // エンティティ削除
    if (this.el.parentNode) {
      this.el.parentNode.removeChild(this.el);
    }
    
    // クリアチェック
    checkGameClear();
  }
});

// ========================================
// 敵の弾丸（プレイヤーに当たったら被弾）
// ========================================
AFRAME.registerComponent('enemy-bullet', {
  tick: function() {
    const camera = document.querySelector('[camera]');
    if (!camera) return;
    
    const dist = this.el.object3D.position.distanceTo(camera.object3D.position);
    if (dist < 0.3) {
      GameState.hits++;
      updateHUD();
      
      // 弾丸削除
      if (this.el.parentNode) {
        this.el.parentNode.removeChild(this.el);
      }
    }
  }
});

// ========================================
// 敵コンポーネント: 固定型（青八面体）
// ========================================
AFRAME.registerComponent('enemy-turret', {
  init: function() {
    // 青い透明な正八面体
    const geometry = new THREE.OctahedronGeometry(0.4);
    const material = new THREE.MeshPhysicalMaterial({
      color: 0x0088ff,
      transparent: true,
      opacity: 0.6,
      metalness: 0.8,
      roughness: 0.2,
      emissive: 0x0088ff,
      emissiveIntensity: 1
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    this.el.setObject3D('mesh', mesh);
    
    this.health = 1;
    this.chargeDuration = 3000; // 3秒チャージ
    this.isCharging = false;
    this.chargeStart = 0;
    this.shootCooldown = 5000; // 5秒に一回
    this.lastShot = Date.now() - 3000; // 最初は少し待つ
    
    GameState.enemies.push(this);
  },
  
  tick: function(time, delta) {
    const now = Date.now();
    const camera = document.querySelector('[camera]');
    if (!camera) return;
    
    // プレイヤーの方を向く
    this.el.object3D.lookAt(camera.object3D.position);
    
    // チャージ開始
    if (!this.isCharging && now - this.lastShot > this.shootCooldown) {
      this.isCharging = true;
      this.chargeStart = now;
    }
    
    // チャージ中のアニメーション
    if (this.isCharging) {
      const chargeProgress = (now - this.chargeStart) / this.chargeDuration;
      
      // 回転速度を上げる
      this.el.object3D.rotation.x += delta * 0.01 * (1 + chargeProgress * 5);
      this.el.object3D.rotation.y += delta * 0.01 * (1 + chargeProgress * 5);
      
      // 発光を強める
      const mesh = this.el.getObject3D('mesh');
      if (mesh && mesh.material) {
        mesh.material.emissiveIntensity = 1 + chargeProgress * 4;
      }
      
      // チャージ完了で射撃
      if (chargeProgress >= 1) {
        this.shoot();
        this.isCharging = false;
        this.lastShot = now;
        
        // 発光を戻す
        if (mesh && mesh.material) {
          mesh.material.emissiveIntensity = 1;
        }
      }
    }
  },
  
  shoot: function() {
    // 高速ビーム（複数の小さな弾で表現）
    const camera = document.querySelector('[camera]');
    const pos = this.el.object3D.getWorldPosition(new THREE.Vector3());
    const dir = camera.object3D.position.clone().sub(pos).normalize();
    
    // ビームを5連射で表現
    for (let i = 0; i < 5; i++) {
      setTimeout(() => {
        const beam = document.createElement('a-box');
        beam.setAttribute('width', '0.1');
        beam.setAttribute('height', '0.1');
        beam.setAttribute('depth', '0.3');
        beam.setAttribute('color', '#00ffff');
        beam.setAttribute('material', 'shader: flat; emissive: #00ffff; emissiveIntensity: 5');
        beam.setAttribute('position', pos);
        beam.setAttribute('projectile', `direction: ${dir.x} ${dir.y} ${dir.z}; speed: 20`);
        beam.setAttribute('enemy-bullet', '');
        
        document.querySelector('a-scene').appendChild(beam);
      }, i * 50);
    }
  },
  
  takeDamage: function() {
    this.health -= 1;
    if (this.health <= 0) {
      this.die();
    }
  },
  
  die: function() {
    GameState.kills++;
    updateHUD();
    
    const index = GameState.enemies.indexOf(this);
    if (index > -1) {
      GameState.enemies.splice(index, 1);
    }
    
    if (this.el.parentNode) {
      this.el.parentNode.removeChild(this.el);
    }
    
    // クリアチェック
    checkGameClear();
  }
});

// ========================================
// 初期化: 敵配置とHUD更新ループ
// ========================================
document.addEventListener('DOMContentLoaded', function() {
  const scene = document.querySelector('a-scene');
  
  scene.addEventListener('loaded', function() {
    // 敵を配置
    spawnEnemies();
    
    // HUD更新ループ
    setInterval(updateHUD, 100);
  });
});

function spawnEnemies() {
  const scene = document.querySelector('a-scene');
  
  // 移動型敵を3体配置
  for (let i = 0; i < 3; i++) {
    const enemy = document.createElement('a-entity');
    enemy.setAttribute('enemy-mobile', '');
    const angle = (i / 3) * Math.PI * 2;
    const radius = 10;
    enemy.setAttribute('position', `${Math.cos(angle) * radius} 1.5 ${Math.sin(angle) * radius}`);
    scene.appendChild(enemy);
  }
  
  // 固定型敵を2体配置
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
// VRコントローラー操作管理
// ========================================
AFRAME.registerComponent('weapon-controller', {
  schema: {
    hand: { type: 'string', default: 'right' }
  },
  
  init: function() {
    this.weaponEntity = null;
    this.triggerPressed = false;
    this.gripPressed = false;
    
    // 初期武器（剣）を装備
    this.equipWeapon('sword');
    
    // イベントリスナー
    this.el.addEventListener('triggerdown', this.onTriggerDown.bind(this));
    this.el.addEventListener('triggerup', this.onTriggerUp.bind(this));
    this.el.addEventListener('gripdown', this.onGripDown.bind(this));
    this.el.addEventListener('gripup', this.onGripUp.bind(this));
  },
  
  equipWeapon: function(weaponType) {
    // 既存の武器を削除
    if (this.weaponEntity) {
      this.el.removeChild(this.weaponEntity);
    }
    
    // 新しい武器を作成
    this.weaponEntity = document.createElement('a-entity');
    this.weaponEntity.setAttribute(weaponType, `hand: ${this.data.hand}`);
    this.weaponEntity.setAttribute('position', '0 0 -0.1');
    this.el.appendChild(this.weaponEntity);
    
    GameState.currentWeapon = weaponType;
  },
  
  onTriggerDown: function(evt) {
    this.triggerPressed = true;
    
    // 弓の場合: トリガーで弓に切り替え
    if (GameState.currentWeapon === 'sword') {
      this.equipWeapon('bow');
    }
  },
  
  onTriggerUp: function(evt) {
    this.triggerPressed = false;
    
    // 弓の場合: トリガーを離したら剣に戻る
    if (GameState.currentWeapon === 'bow') {
      // 矢を射る
      if (this.weaponEntity && this.weaponEntity.components.bow) {
        this.weaponEntity.components.bow.shoot();
      }
      
      // 剣に切り替え
      this.equipWeapon('sword');
    }
  },
  
  onGripDown: function(evt) {
    this.gripPressed = true;
    
    // 弓を持っている時にグリップで弦を引く
    if (GameState.currentWeapon === 'bow' && this.weaponEntity) {
      const bow = this.weaponEntity.components.bow;
      if (bow) {
        bow.startDraw();
      }
    }
  },
  
  onGripUp: function(evt) {
    this.gripPressed = false;
  },
  
  tick: function() {
    // 剣の振りモーション検出
    if (GameState.currentWeapon === 'sword' && this.weaponEntity) {
      const velocity = this.el.object3D.getWorldDirection(new THREE.Vector3());
      const speed = velocity.length();
      
      // 速く振ったら攻撃判定
      if (speed > 0.5) {
        this.checkSwordHit();
      }
    }
  },
  
  checkSwordHit: function() {
    const swordPos = this.weaponEntity.object3D.getWorldPosition(new THREE.Vector3());
    
    // 全ての敵との距離をチェック
    GameState.enemies.forEach(enemy => {
      if (!enemy.el) return;
      
      const enemyPos = enemy.el.object3D.position;
      const distance = swordPos.distanceTo(enemyPos);
      
      // 剣の射程内なら攻撃ヒット
      if (distance < 1.0) {
        enemy.takeDamage();
      }
    });
  }
});

// ========================================
// 弓コンポーネントに弦引きメソッド追加
// ========================================
// 既存のbowコンポーネントを拡張
const bowProto = AFRAME.components.bow.Component.prototype;
const originalBowInit = bowProto.init;

bowProto.init = function() {
  originalBowInit.call(this);
  this.drawProgress = 0;
};

bowProto.startDraw = function() {
  this.isDrawn = true;
  this.drawStartTime = Date.now();
};

bowProto.tick = function(time, delta) {
  if (this.isDrawn) {
    const elapsed = Date.now() - this.drawStartTime;
    this.drawProgress = Math.min(elapsed / 1000, 1); // 1秒で最大
    
    // 弦を引くアニメーション（弓を少し傾ける）
    this.el.object3D.rotation.x = -this.drawProgress * 0.3;
  }
};

// ========================================
// プレイヤーの矢が敵に当たる判定
// ========================================
AFRAME.registerComponent('player-arrow', {
  tick: function() {
    const arrowPos = this.el.object3D.position;
    
    GameState.enemies.forEach(enemy => {
      if (!enemy.el) return;
      
      const enemyPos = enemy.el.object3D.position;
      const distance = arrowPos.distanceTo(enemyPos);
      
      if (distance < 0.5) {
        enemy.takeDamage();
        
        // 矢を削除
        if (this.el.parentNode) {
          this.el.parentNode.removeChild(this.el);
        }
      }
    });
  }
});

// ========================================
// ゲームクリア・リスタート機能
// ========================================
function checkGameClear() {
  if (GameState.enemies.length === 0) {
    showGameClear();
  }
}

function showGameClear() {
  const elapsed = Math.floor((Date.now() - GameState.startTime) / 1000);
  const score = calculateScore(elapsed, GameState.kills, GameState.hits);
  
  const hud = document.getElementById('hud');
  hud.innerHTML = `
    <h2 style="color: #00ff00; font-size: 24px;">🎉 GAME CLEAR!</h2>
    <div>時間: ${elapsed}秒</div>
    <div>キル数: ${GameState.kills}</div>
    <div>被弾数: ${GameState.hits}</div>
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
document.addEventListener('DOMContentLoaded', function() {
  const startButton = document.getElementById('startButton');
  const startScreen = document.getElementById('startScreen');
  
  startButton.addEventListener('click', function() {
    startScreen.style.display = 'none';
    GameState.startTime = Date.now(); // ゲーム開始時刻をリセット
  });
});

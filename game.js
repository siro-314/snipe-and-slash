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

  init: function () {
    // === 剣のビジュアル改修 V2: 本気の清書モード (Hollow Energy Katana) ===
    const container = new THREE.Object3D();

    // --- 1. Grip (柄) ---
    // マットブラックの角ばったグリップ
    const gripGeo = new THREE.BoxGeometry(0.025, 0.03, 0.25);
    const gripMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.7, metalness: 0.3 });
    const grip = new THREE.Mesh(gripGeo, gripMat);
    grip.position.z = 0.1; // 手のひら位置調整
    container.add(grip);

    // 青いLEDインジケーター
    const ledGeo = new THREE.BoxGeometry(0.01, 0.005, 0.03);
    const ledMat = new THREE.MeshBasicMaterial({ color: 0x00d4ff });
    const led = new THREE.Mesh(ledGeo, ledMat);
    led.position.set(0, 0.016, 0.15); // グリップの上部手前
    container.add(led);

    // --- 2. Blade (刃) - 中空構造の実現 ---
    // Shapeを作成して押し出すアプローチ
    const bladeLength = 1.2; // 長く！(野太刀サイズ)
    const bladeWidth = 0.06;
    const holeWidth = 0.025; // 中空部分の幅

    const shape = new THREE.Shape();

    // 外側の輪郭 (緩やかなカーブを描く刀身)
    shape.moveTo(0, 0);
    shape.lineTo(bladeWidth, 0); // 根本の幅
    // 刃先に向かって緩やかに細くなるカーブ
    shape.lineTo(bladeWidth * 0.8, bladeLength * 0.6);
    shape.lineTo(0, bladeLength); // 切っ先 (鋭利に)
    shape.lineTo(0, 0); // 背側は真っ直ぐ

    // 内側の穴 (Hollow design)
    const holePath = new THREE.Path();
    const margin = 0.01; // 縁の厚み
    const holeLen = bladeLength * 0.85;

    holePath.moveTo(margin, margin * 2);
    holePath.lineTo(bladeWidth - margin, margin * 2);
    holePath.lineTo((bladeWidth * 0.8) - margin, holeLen * 0.6);
    holePath.lineTo(margin, holeLen); // 穴の先端
    holePath.lineTo(margin, margin * 2);

    shape.holes.push(holePath);

    // 押し出し設定 (薄いエネルギー体)
    const extrudeSettings = {
      steps: 1,
      depth: 0.005, // 薄さ
      bevelEnabled: true,
      bevelThickness: 0.002,
      bevelSize: 0.002,
      bevelSegments: 2
    };

    const bladeGeo = new THREE.ExtrudeGeometry(shape, extrudeSettings);

    // マテリアル (Cyber Neon)
    // 透過度高め、発光強め
    const bladeMat = new THREE.MeshPhysicalMaterial({
      color: 0x00ffcc, // Cyan-Teal mix
      emissive: 0x00ffcc,
      emissiveIntensity: 3,
      transparent: true,
      opacity: 0.7,
      transmission: 0.2,
      side: THREE.DoubleSide,
      metalness: 0.8,
      roughness: 0
    });

    const blade = new THREE.Mesh(bladeGeo, bladeMat);

    // 位置合わせ (ExtrudeはZ方向に押し出すので回転させる)
    blade.rotation.x = -Math.PI / 2; // 寝かせる
    blade.rotation.z = -Math.PI / 2; // 刃を前に向ける
    // 刃の背を中心に合わせる調整
    blade.position.set(0, 0, -0.05);

    // 刃の向きを修正（切っ先が前）
    // Shapeの座標系とThree.jsの座標系の整合性を取るためコンテナに入れる
    const bladePivot = new THREE.Object3D();
    bladePivot.add(blade);
    // グリップの先端から伸びるように
    bladePivot.position.z = -0.05;
    bladePivot.rotation.x = Math.PI; // 上下反転（刃のカーブを適切な向きに）
    bladePivot.rotation.z = Math.PI;

    container.add(bladePivot);

    this.el.setObject3D('mesh', container);

    // 当たり判定用（先端の位置を取得するため）
    this.blade = blade;
  },

  tick: function () {
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

  init: function () {
    // === 弓ビジュアル改修: テクノアーク ===
    const container = new THREE.Object3D();

    // 1. 弓の本体（上下のリブ）: 流線型の黒パーツ
    const limbGeo = new THREE.TorusGeometry(0.3, 0.02, 8, 30, Math.PI / 1.5); // 円弧の一部
    const limbMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5 });

    const upperLimb = new THREE.Mesh(limbGeo, limbMat);
    upperLimb.rotation.z = Math.PI / 2 + 0.5;
    upperLimb.position.y = 0;
    container.add(upperLimb);

    // 2. エネルギーライン（発光脈）
    const veinGeo = new THREE.TorusGeometry(0.305, 0.005, 4, 30, Math.PI / 1.5);
    const veinMat = new THREE.MeshBasicMaterial({ color: 0x00d4ff });
    const vein = new THREE.Mesh(veinGeo, veinMat);
    vein.rotation.z = Math.PI / 2 + 0.5;
    container.add(vein);

    // 3. ハンドル部分
    const handleGeo = new THREE.BoxGeometry(0.05, 0.1, 0.05);
    const handleMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const handle = new THREE.Mesh(handleGeo, handleMat);
    container.add(handle);

    // 4. 弦（エネルギー）
    // 引いてない状態の直線
    const stringGeo = new THREE.CylinderGeometry(0.002, 0.002, 0.55);
    const stringMat = new THREE.MeshBasicMaterial({ color: 0x00d4ff, transparent: true, opacity: 0.5 });
    const bowString = new THREE.Mesh(stringGeo, stringMat);
    bowString.position.x = -0.08; // 弓の内側
    container.add(bowString);

    this.el.setObject3D('mesh', container);
    this.bowString = bowString; // アニメーション用参照

    this.isDrawn = false;
    // this.drawStartPos = null; // Removed as it was unused or will be handled differently
  },

  tick: function () {
    // 弓を引く処理は後で実装
  },

  shoot: function () {
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

  init: function () {
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

  tick: function (time, delta) {
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
  init: function () {
    // === 敵Mobileビジュアル: トリオン兵風 ===
    const container = new THREE.Object3D();

    // 1. ボディ: 元より少し複雑な白球体
    const bodyGeo = new THREE.IcosahedronGeometry(0.3, 1); // 少しカクカクしている
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.4,
      flatShading: true
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    container.add(body);

    // 2. 目: 赤いレンズ
    const eyeBaseGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.05, 16);
    const eyeBaseMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const eyeBase = new THREE.Mesh(eyeBaseGeo, eyeBaseMat);
    eyeBase.rotation.x = Math.PI / 2;
    eyeBase.position.z = 0.25;
    container.add(eyeBase);

    const eyeGeo = new THREE.SphereGeometry(0.08, 16, 16);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.z = 0.28;
    container.add(eye);

    // 3. 浮遊パーツ（衛星）: 回転するリング
    const ringGeo = new THREE.TorusGeometry(0.5, 0.01, 4, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.5 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    this.ring = ring; // アニメーション用
    container.add(ring);

    this.el.setObject3D('mesh', container);

    this.health = 1; // 一撃で倒せる
    this.shootCooldown = 2000; // 2秒ごとに射撃
    this.lastShot = Date.now();

    GameState.enemies.push(this);
  },

  tick: function (time, delta) {
    // プレイヤーの方を向く
    const camera = document.querySelector('[camera]');
    if (!camera) return;

    const targetPos = camera.object3D.position;
    this.el.object3D.lookAt(targetPos);

    // アニメーション: リング回転
    if (this.ring) {
      this.ring.rotation.x += delta * 0.001;
      this.ring.rotation.y += delta * 0.002;
    }

    // 射撃処理
    const now = Date.now();
    if (now - this.lastShot > this.shootCooldown) {
      this.shoot();
      this.lastShot = now;
    }
  },

  shoot: function () {
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

  takeDamage: function () {
    this.health -= 1;
    if (this.health <= 0) {
      this.die();
    }
  },

  die: function () {
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
  tick: function () {
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
  init: function () {
    // === 敵Turretビジュアル: ラミエル風 ===
    const container = new THREE.Object3D();

    // 1. 外殻: 巨大な半透明青八面体
    const shellGeo = new THREE.OctahedronGeometry(0.8, 0);
    const shellMat = new THREE.MeshPhysicalMaterial({
      color: 0x0088ff,
      transparent: true,
      opacity: 0.4,
      transmission: 0.2,
      roughness: 0,
      metalness: 0.1,
      side: THREE.DoubleSide
    });
    const shell = new THREE.Mesh(shellGeo, shellMat);
    this.shell = shell;
    container.add(shell);

    // 2. コア: 内部の輝く結晶
    const coreGeo = new THREE.OctahedronGeometry(0.3, 0);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff }); // チャージ時に色変える
    const core = new THREE.Mesh(coreGeo, coreMat);
    this.core = core;
    container.add(core);

    // 3. ワイヤーフレーム（幾何学感強調）
    const wireGeo = new THREE.WireframeGeometry(shellGeo);
    const wireMat = new THREE.LineBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.3 });
    const wire = new THREE.LineSegments(wireGeo, wireMat);
    container.add(wire);

    this.el.setObject3D('mesh', container);

    this.health = 1;
    this.chargeDuration = 3000; // 3秒チャージ
    this.isCharging = false;
    this.chargeStart = 0;
    this.shootCooldown = 5000; // 5秒に一回
    this.lastShot = Date.now() - 3000; // 最初は少し待つ

    GameState.enemies.push(this);
  },

  tick: function (time, delta) {
    const now = Date.now();
    const camera = document.querySelector('[camera]');
    if (!camera) return;

    // プレイヤーの方を向く
    this.el.object3D.lookAt(camera.object3D.position);

    // チャージ開始
    if (!this.isCharging && now - this.lastShot > this.shootCooldown) {
      this.isCharging = true;
      this.chargeStart = now;
      // チャージ音とかあればここで
    }

    // チャージ中のアニメーション
    if (this.isCharging) {
      const chargeProgress = (now - this.chargeStart) / this.chargeDuration;

      // 回転速度を上げる + 振動
      this.el.object3D.rotation.x += delta * 0.002 * (1 + chargeProgress * 10);
      this.el.object3D.rotation.y += delta * 0.002 * (1 + chargeProgress * 10);
      const shake = (Math.random() - 0.5) * 0.05 * chargeProgress;
      this.el.object3D.position.x += shake;

      // コアの色変化: 白 -> 赤
      if (this.core) {
        const r = 1;
        const g = 1 - chargeProgress;
        const b = 1 - chargeProgress;
        this.core.material.color.setRGB(r, g, b);
      }

      // チャージ完了で射撃
      if (chargeProgress >= 1) {
        this.shoot();
        this.isCharging = false;
        this.lastShot = now;

        // 色を戻す
        if (this.core) this.core.material.color.setHex(0xffffff);
      }
    } else {
      // 通常回転
      this.el.object3D.rotation.x += delta * 0.0005;
      this.el.object3D.rotation.y += delta * 0.001;
    }
  },

  shoot: function () {
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

  takeDamage: function () {
    this.health -= 1;
    if (this.health <= 0) {
      this.die();
    }
  },

  die: function () {
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
document.addEventListener('DOMContentLoaded', function () {
  const scene = document.querySelector('a-scene');

  scene.addEventListener('loaded', function () {
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

  init: function () {
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

  equipWeapon: function (weaponType) {
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

  onTriggerDown: function (evt) {
    this.triggerPressed = true;

    // 弓の場合: トリガーで弓に切り替え
    if (GameState.currentWeapon === 'sword') {
      this.equipWeapon('bow');
    }
  },

  onTriggerUp: function (evt) {
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

  onGripDown: function (evt) {
    this.gripPressed = true;

    // 弓を持っている時にグリップで弦を引く
    if (GameState.currentWeapon === 'bow' && this.weaponEntity) {
      const bow = this.weaponEntity.components.bow;
      if (bow) {
        bow.startDraw();
      }
    }
  },

  onGripUp: function (evt) {
    this.gripPressed = false;
  },

  tick: function () {
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

  checkSwordHit: function () {
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

// ========================================
// プレイヤーの矢が敵に当たる判定
// ========================================
AFRAME.registerComponent('player-arrow', {
  tick: function () {
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
document.addEventListener('DOMContentLoaded', function () {
  const startButton = document.getElementById('startButton');
  const startScreen = document.getElementById('startScreen');

  startButton.addEventListener('click', function () {
    startScreen.style.display = 'none';
    GameState.startTime = Date.now(); // ゲーム開始時刻をリセット
  });
});

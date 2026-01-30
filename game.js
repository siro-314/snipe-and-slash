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
// GLBモデル管理（疎結合・エラーログ付き）
// ========================================
const ModelManager = {
  models: {},
  loader: null,

  init: function () {
    if (typeof THREE !== 'undefined' && THREE.GLTFLoader) {
      this.loader = new THREE.GLTFLoader();
      console.log('[ModelManager] GLTFLoader initialized');
    } else {
      console.warn('[ModelManager] GLTFLoader not available, will use fallback geometry');
    }
  },

  load: function (name, url) {
    return new Promise((resolve, reject) => {
      if (!this.loader) {
        const err = new Error(`[ModelManager] Loader not initialized. Cannot load: ${url}`);
        console.error(err.message);
        reject(err);
        return;
      }

      console.log(`[ModelManager] Loading model: ${name} from ${url}`);

      this.loader.load(
        url,
        (gltf) => {
          this.models[name] = gltf.scene;
          console.log(`[ModelManager] ✓ Loaded: ${name}`);
          resolve(gltf.scene);
        },
        (progress) => {
          // Loading progress (optional)
        },
        (error) => {
          console.error(`[ModelManager] ✗ Failed to load ${name} from ${url}:`, error.message || error);
          reject(error);
        }
      );
    });
  },

  getClone: function (name) {
    if (this.models[name]) {
      return this.models[name].clone();
    }
    console.warn(`[ModelManager] Model not found: ${name}, returning null`);
    return null;
  }
};

// ========================================
// ユーティリティ関数
// ========================================
function updateHUD() {
  const killsEl = document.getElementById('kills');
  const hitsEl = document.getElementById('hits');
  const timerEl = document.getElementById('timer');

  // 要素が存在しない場合（クリア画面やロード前）は更新しない
  if (!killsEl || !hitsEl || !timerEl) return;

  killsEl.textContent = GameState.kills;
  hitsEl.textContent = GameState.hits;
  const elapsed = Math.floor((Date.now() - GameState.startTime) / 1000);
  timerEl.textContent = elapsed;
}

// ========================================
// 武器コンポーネント: 剣
// ========================================
AFRAME.registerComponent('sword', {
  schema: {
    hand: { type: 'string', default: 'right' }
  },

  init: function () {
    this.modelLoaded = false;
    this.retryTimer = 0;
    this.isReady = false;

    // 状態管理
    this.mode = 'sword'; // 'sword' or 'bow'
    this.isDrawn = false;
    this.drawProgress = 0;

    // 両手操作用
    this.otherHand = null;
    this.isGrabbingString = false;
    this.otherHandGripping = false;

    // メッシュ参照
    this.upperBlade = null;
    this.lowerBlade = null;
    this.arrow = null;
    this.arrowPrefab = null; // 矢の原本（クローン用）

    // デバッグ用マーカー（弦の掴み位置）
    const markerGeo = new THREE.SphereGeometry(0.05, 16, 16);
    const markerMat = new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.5, wireframe: true });
    this.nockMarker = new THREE.Mesh(markerGeo, markerMat);
    this.nockMarker.visible = false;
    this.el.sceneEl.object3D.add(this.nockMarker);

    // 当たり判定有効化（3秒後）
    setTimeout(() => {
      this.isReady = true;
      console.log('[sword] Ready to slash!');
    }, 3000);

    // フォールバック表示
    this.createFallbackGeometry();

    // モデルロード試行
    this.tryLoadModel();
  },

  tryLoadModel: function () {
    const model = ModelManager.getClone('sword');

    if (model) {
      model.scale.set(1, 1, 1);
      // 回転修正: Blender(X90, Y90) -> (Math.PI/2, Math.PI/2, 0) を試行
      model.rotation.set(Math.PI / 2, Math.PI / 2, 0);
      console.log(`[sword] Applied rotation: ${model.rotation.x}, ${model.rotation.y}, ${model.rotation.z}`);

      // モデル内のパーツを取得
      model.traverse(node => {
        if (node.isMesh) {
          if (node.name.includes('上ブレード')) this.upperBlade = node;
          if (node.name.includes('下ブレード')) this.lowerBlade = node;
          if (node.name.includes('弦')) this.string = node;
          if (node.name.includes('矢')) {
            this.arrow = node;
            this.arrowPrefab = node.clone();
            this.arrowPrefab.visible = true;
            if (this.arrowPrefab.morphTargetInfluences) {
              this.arrowPrefab.morphTargetInfluences[0] = 0;
            }
            if (this.arrowPrefab.material) {
              this.arrowPrefab.material = this.arrowPrefab.material.clone();
              this.arrowPrefab.material.transparent = false;
              this.arrowPrefab.material.opacity = 1;
            }
          }
        }
      });

      this.morphIndex = 0;

      // メッシュ差し替え
      if (this.el.getObject3D('mesh')) {
        this.el.removeObject3D('mesh');
      }
      this.el.setObject3D('mesh', model);
      this.blade = model;

      this.modelLoaded = true;
      console.log('[sword] Switched to new GLB model');

      // 初期状態セット
      this.setMode('sword');

    } else {
      console.warn('[sword] GLB not available');
    }
  },

  createFallbackGeometry: function () {
    const geo = new THREE.BoxGeometry(0.1, 0.1, 1);
    const mat = new THREE.MeshBasicMaterial({ color: 'red', wireframe: true });
    this.el.setObject3D('mesh', new THREE.Mesh(geo, mat));
  },

  // 逆の手を設定（weapon-controllerから呼ばれる）
  setOtherHand: function (el) {
    this.otherHand = el;

    // イベントリスナー
    el.addEventListener('gripdown', () => {
      this.otherHandGripping = true;
      // 弦の近くなら掴み開始
      if (this.mode === 'bow' && this.isNearString()) {
        this.startDraw();
      }
    });

    el.addEventListener('gripup', () => {
      this.otherHandGripping = false;
      // 掴んでいたら発射
      if (this.isGrabbingString) {
        this.shoot();
      }
    });
  },

  // 弦に近いか判定
  isNearString: function () {
    if (!this.otherHand || !this.nockMarker) return false;
    const handPos = this.otherHand.object3D.getWorldPosition(new THREE.Vector3());
    const markerPos = this.nockMarker.position;
    const dist = handPos.distanceTo(markerPos);
    return dist < 0.4; // 判定緩和
  },

  setMode: function (mode) {
    this.mode = mode;
    if (!this.modelLoaded) return;

    if (mode === 'bow') {
      if (this.upperBlade && this.upperBlade.morphTargetInfluences) {
        this.upperBlade.morphTargetInfluences[this.morphIndex] = 1;
      }
      if (this.lowerBlade) this.lowerBlade.visible = true;
      if (this.string) this.string.visible = true;

      if (this.arrow) {
        this.arrow.visible = false;
        if (this.arrow.material) this.arrow.material.opacity = 0;
      }

      if (this.nockMarker) this.nockMarker.visible = true;

    } else {
      if (this.upperBlade && this.upperBlade.morphTargetInfluences) {
        this.upperBlade.morphTargetInfluences[this.morphIndex] = 0;
      }
      if (this.lowerBlade) this.lowerBlade.visible = false;
      if (this.string) this.string.visible = false;
      if (this.arrow) this.arrow.visible = false;

      this.isGrabbingString = false;
      this.isDrawn = false;

      if (this.nockMarker) this.nockMarker.visible = false;
    }
  },

  startDraw: function () {
    if (this.mode !== 'bow') return;
    this.isGrabbingString = true;
    this.isDrawn = true;

    if (this.arrow) {
      this.arrow.visible = true;
      if (this.arrow.material) this.arrow.material.opacity = 0;
    }
  },

  shoot: function () {
    if (this.mode !== 'bow' || !this.isDrawn) return;

    // 最低限引いてないと撃てない（誤射防止）
    if (this.drawProgress < 0.2) {
      // キャンセル扱い
      this.isGrabbingString = false;
      this.isDrawn = false;
      this.updateMorphs(0);
      if (this.arrow) this.arrow.visible = false;
      return;
    }

    // 矢の発射（モデルクローン）
    let arrowMesh;
    if (this.arrowPrefab) {
      arrowMesh = this.arrowPrefab.clone();
      if (arrowMesh.material) {
        arrowMesh.material = this.arrowPrefab.material.clone();
        arrowMesh.material.transparent = false; // 確実に表示
        arrowMesh.material.opacity = 1.0;
      }
      // モーフィングリセット
      if (arrowMesh.morphTargetInfluences) {
        arrowMesh.morphTargetInfluences[0] = 0;
      }
    } else {
      // フォールバック
      arrowMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.05),
        new THREE.MeshBasicMaterial({ color: '#00d4ff' })
      );
    }

    const arrowEntity = document.createElement('a-entity');
    arrowEntity.setObject3D('mesh', arrowMesh);

    const pos = this.el.object3D.getWorldPosition(new THREE.Vector3());
    const dir = new THREE.Vector3(0, 0, -1);
    dir.applyQuaternion(this.el.object3D.getWorldQuaternion(new THREE.Quaternion()));

    // スケール補正: 元の矢のワールドスケールを適用
    if (this.arrow) {
      const worldScale = new THREE.Vector3();
      this.arrow.getWorldScale(worldScale);
      arrowEntity.object3D.scale.copy(worldScale);
    }

    arrowEntity.setAttribute('position', pos);

    // 威力や速度を引き具合で変える？ 今回は固定かつ高速に（少し遅くして視認性確保）
    const speed = 10 + (this.drawProgress * 15); // 10~25
    arrowEntity.setAttribute('projectile', `direction: ${dir.x} ${dir.y} ${dir.z}; speed: ${speed}`);
    arrowEntity.setAttribute('player-arrow', '');

    document.querySelector('a-scene').appendChild(arrowEntity);

    // リセット
    this.isGrabbingString = false;
    this.isDrawn = false;
    this.drawProgress = 0;
    this.updateMorphs(0);
    if (this.arrow) this.arrow.visible = false;

    // 他で色制御するのでここではリセット不要（tickで更新）

    if (this.el.components.haptics) {
      this.el.components.haptics.pulse(1.0, 50);
    }
  },

  updateMorphs: function (value) {
    if (this.string && this.string.morphTargetInfluences) {
      this.string.morphTargetInfluences[this.morphIndex] = value;
    }
    if (this.arrow && this.arrow.morphTargetInfluences) {
      this.arrow.morphTargetInfluences[this.morphIndex] = value;
    }
  },

  tick: function (time, delta) {
    if (!this.modelLoaded) {
      this.retryTimer += delta;
      if (this.retryTimer > 500) {
        this.retryTimer = 0;
        this.tryLoadModel();
      }
      return;
    }

    // マーカー位置更新
    if (this.mode === 'bow' && this.nockMarker) {
      // グリップから少しずらした位置を判定基準にする
      const offset = new THREE.Vector3(0, 0, 0.2);
      offset.applyQuaternion(this.el.object3D.getWorldQuaternion(new THREE.Quaternion()));
      const worldPos = this.el.object3D.getWorldPosition(new THREE.Vector3()).add(offset);
      this.nockMarker.position.copy(worldPos);

      // 色制御: 掴んでいれば赤、近ければ黄色、それ以外は緑
      if (this.isGrabbingString) {
        this.nockMarker.material.color.setHex(0xff0000);
      } else if (this.isNearString()) {
        this.nockMarker.material.color.setHex(0xffff00);
      } else {
        this.nockMarker.material.color.setHex(0x00ff00);
      }
    }

    // 両手操作ロジック
    if (this.mode === 'bow' && this.isGrabbingString && this.otherHand) {
      const handPos = this.otherHand.object3D.getWorldPosition(new THREE.Vector3());
      const bowPos = this.el.object3D.getWorldPosition(new THREE.Vector3());
      const dist = handPos.distanceTo(bowPos);

      // 0.1mから引き始め、0.6mで最大(1.0)
      this.drawProgress = Math.min(Math.max((dist - 0.1) / 0.5, 0), 1);

      this.updateMorphs(this.drawProgress);

      if (this.arrow && this.arrow.material) {
        this.arrow.material.opacity = this.drawProgress;
      }

      // 振動フィードバック
      if (this.drawProgress > 0 && this.drawProgress < 1) {
        // 弓を持ってる手
        if (this.el.components.haptics && Math.random() < 0.1) {
          this.el.components.haptics.pulse(0.1 + this.drawProgress * 0.2, 10);
        }
        // 引いてる手（otherHandにもhapticsがあれば）
        // ※ access to otherHand components might be needed
      }
    }
  }
});

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
// 敵コンポーネント: 移動型（白ドローン - 射撃型）
// ========================================
AFRAME.registerComponent('enemy-mobile', {
  init: function () {
    this.health = 1;
    this.shootCooldown = 2000;
    this.lastShot = Date.now();
    this.modelLoaded = false;

    // GLBモデルを試行、失敗時はフォールバック
    this.loadModel();

    GameState.enemies.push(this);
  },

  loadModel: function () {
    const model = ModelManager.getClone('drone_white');

    if (model) {
      // GLBモデル使用
      model.scale.set(0.5, 0.5, 0.5); // サイズ調整
      this.el.setObject3D('mesh', model);
      this.modelLoaded = true;
      console.log('[enemy-mobile] Using GLB model');
    } else {
      // フォールバック: 既存ジオメトリ
      console.warn('[enemy-mobile] GLB not available, using fallback geometry');
      this.createFallbackGeometry();
    }
  },

  createFallbackGeometry: function () {
    const container = new THREE.Object3D();

    // 1. ボディ: カクカクした白球体
    const bodyGeo = new THREE.IcosahedronGeometry(0.3, 1);
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
    this.ring = ring;
    container.add(ring);

    this.el.setObject3D('mesh', container);
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
// 初期化: モデルプリロード → 敵配置
// ========================================
document.addEventListener('DOMContentLoaded', function () {
  const scene = document.querySelector('a-scene');

  scene.addEventListener('loaded', async function () {
    console.log('[Game] Scene loaded, initializing...');

    // ModelManagerの初期化
    ModelManager.init();

    // GLBモデルをプリロード（失敗してもゲームは続行）
    try {
      const v = Date.now();
      await Promise.all([
        ModelManager.load('drone_white', `./drone_white.glb?v=${v}`),
        ModelManager.load('drone_black', `./drone_black.glb?v=${v}`),
        ModelManager.load('sword', `./sword.glb?v=${v}`)
      ]);
      console.log('[Game] All models loaded successfully');
    } catch (error) {
      console.warn('[Game] Some models failed to load, using fallback geometry:', error.message);
    }

    // 敵を配置
    spawnEnemies();

    // HUD更新ループ
    setInterval(updateHUD, 100);

    console.log('[Game] Initialization complete');
  });
});

// ========================================
// 敵コンポーネント: 黒ドローン（自爆型）
// カクカク移動 → タメ → 爆発
// ========================================
AFRAME.registerComponent('enemy-drone-black', {
  init: function () {
    this.health = 1;
    this.state = 'approaching'; // 'approaching', 'charging', 'exploding'
    this.chargeTime = 1500; // タメ時間（ms）
    this.chargeStarted = 0;
    this.moveTimer = 0;
    this.moveInterval = 300; // カクカク移動の間隔（ms）
    this.modelLoaded = false;

    this.loadModel();

    GameState.enemies.push(this);
  },

  loadModel: function () {
    const model = ModelManager.getClone('drone_black');

    if (model) {
      model.scale.set(0.5, 0.5, 0.5);
      this.el.setObject3D('mesh', model);
      this.modelLoaded = true;
      console.log('[enemy-drone-black] Using GLB model');
    } else {
      console.warn('[enemy-drone-black] GLB not available, using fallback geometry');
      this.createFallbackGeometry();
    }
  },

  createFallbackGeometry: function () {
    // 黒いカクカク球体（フォールバック）
    const bodyGeo = new THREE.IcosahedronGeometry(0.3, 1);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x222222,
      roughness: 0.3,
      flatShading: true
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);

    // 赤い目
    const eyeGeo = new THREE.SphereGeometry(0.1, 16, 16);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.z = 0.25;

    const container = new THREE.Object3D();
    container.add(body);
    container.add(eye);
    this.el.setObject3D('mesh', container);
  },

  tick: function (time, delta) {
    const camera = document.querySelector('[camera]');
    if (!camera) return;

    const myPos = this.el.object3D.position;
    const targetPos = camera.object3D.position;
    const distance = myPos.distanceTo(targetPos);

    // プレイヤーの方を向く
    this.el.object3D.lookAt(targetPos);

    if (this.state === 'approaching') {
      // カクカク移動（雷のような軌道）
      this.moveTimer += delta;
      if (this.moveTimer >= this.moveInterval) {
        this.moveTimer = 0;

        // プレイヤー方向 + ランダムなブレ
        const dir = targetPos.clone().sub(myPos).normalize();
        dir.x += (Math.random() - 0.5) * 0.5;
        dir.y += (Math.random() - 0.5) * 0.3;
        dir.z += (Math.random() - 0.5) * 0.5;
        dir.normalize();

        // 瞬間移動っぽく動く
        myPos.add(dir.multiplyScalar(0.8));
      }

      // 近づいたらタメ状態へ
      if (distance < 2) {
        this.state = 'charging';
        this.chargeStarted = time;
        console.log('[enemy-drone-black] Charging...');
      }
    } else if (this.state === 'charging') {
      // タメ中（点滅など演出可能）
      const elapsed = time - this.chargeStarted;

      // スケールで膨らむ演出
      const scale = 1 + Math.sin(elapsed * 0.01) * 0.1;
      this.el.object3D.scale.set(scale, scale, scale);

      if (elapsed > this.chargeTime) {
        this.explode();
      }
    }
  },

  explode: function () {
    this.state = 'exploding';
    console.log('[enemy-drone-black] Explode!');

    // プレイヤーにダメージ（距離に応じて）
    const camera = document.querySelector('[camera]');
    if (camera) {
      const distance = this.el.object3D.position.distanceTo(camera.object3D.position);
      if (distance < 3) {
        GameState.hits++;
        updateHUD();
        console.log('[enemy-drone-black] Player hit by explosion!');
      }
    }

    this.die();
  },

  takeDamage: function () {
    this.health -= 1;
    if (this.health <= 0) {
      console.log('[enemy-drone-black] Destroyed before explosion');
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

    checkGameClear();
  }
});

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

    // 逆の手を取得
    const otherHandId = this.data.hand === 'right' ? 'leftHand' : 'rightHand';
    this.otherHand = document.getElementById(otherHandId);

    // 武器エンティティを作成（swordコンポーネント付き）
    this.weaponEntity = document.createElement('a-entity');
    this.weaponEntity.setAttribute('sword', `hand: ${this.data.hand}`);
    this.weaponEntity.setAttribute('position', '0 0 -0.1');
    this.el.appendChild(this.weaponEntity);

    // 逆の手の参照を渡す（コンポーネント初期化待ちが必要な場合があるため、少し遅らせるか、コンポーネント側で処理）
    // A-Frameのコンポーネントは同期的に初期化されるはずだが、安全のためsetTimeoutを使うか、
    // loadedイベントを待つ。ここでは直接アクセスを試みる。
    if (this.weaponEntity.components.sword) {
      this.weaponEntity.components.sword.setOtherHand(this.otherHand);
    } else {
      this.weaponEntity.addEventListener('componentinitialized', (evt) => {
        if (evt.detail.name === 'sword') {
          this.weaponEntity.components.sword.setOtherHand(this.otherHand);
        }
      });
    }

    // 初期状態は剣
    GameState.currentWeapon = 'sword';

    // イベントリスナー
    this.el.addEventListener('triggerdown', this.onTriggerDown.bind(this));
    this.el.addEventListener('triggerup', this.onTriggerUp.bind(this));
    this.el.addEventListener('gripdown', this.onGripDown.bind(this));
    this.el.addEventListener('gripup', this.onGripUp.bind(this));
  },

  equipWeapon: function (weaponType) {
    // モード切替のみ行う
    if (this.weaponEntity && this.weaponEntity.components.sword) {
      this.weaponEntity.components.sword.setMode(weaponType);
    }
    GameState.currentWeapon = weaponType;

    // 振動フィードバック
    if (this.el.components.haptics) {
      this.el.components.haptics.pulse(0.5, 100);
    }
  },

  onTriggerDown: function (evt) {
    this.triggerPressed = true;

    // 剣モードなら弓モードへ切り替え
    if (GameState.currentWeapon === 'sword') {
      this.equipWeapon('bow');
      // 自動掴みは廃止（両手操作へ移行）
    }
  },

  onTriggerUp: function (evt) {
    this.triggerPressed = false;

    // 弓モードなら矢を放って剣に戻る
    if (GameState.currentWeapon === 'bow') {
      if (this.weaponEntity && this.weaponEntity.components.sword) {
        this.weaponEntity.components.sword.shoot();
      }

      // 少し遅れて剣に戻す（余韻）
      setTimeout(() => {
        this.equipWeapon('sword');
      }, 200);
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
    if (!this.weaponEntity) return;

    // swordコンポーネントからblade（当たり判定用メッシュ）を取得
    const swordComp = this.weaponEntity.components.sword;
    if (!swordComp || !swordComp.blade || !swordComp.isReady) return; // 準備完了まで判定しない

    // 剣の当たり判定ボックスを更新
    const swordMesh = swordComp.blade;
    const swordBox = new THREE.Box3().setFromObject(swordMesh);

    // デバッグ: 判定がデカすぎないかチェック
    const size = new THREE.Vector3();
    swordBox.getSize(size);
    if (size.length() > 5) { // 5m以上の剣は異常として無視
      // 初回のみ警告
      if (!this.warnedHugeBox) {
        console.warn('[checkSwordHit] Sword Box too huge! Ignoring hit.', size);
        this.warnedHugeBox = true;
      }
      return;
    }

    // 全ての敵との接触判定
    GameState.enemies.forEach(enemy => {
      const enemyEl = enemy.el;
      if (!enemyEl) return;

      const enemyMesh = enemyEl.getObject3D('mesh');
      if (!enemyMesh) return;

      const enemyBox = new THREE.Box3().setFromObject(enemyMesh);

      // 交差判定 (intersectsBox)
      if (swordBox.intersectsBox(enemyBox)) {
        // ヒットした場合のクールダウン処理（多段ヒット防止）
        const now = Date.now();
        if (!enemy.lastHitTime || now - enemy.lastHitTime > 400) {
          enemy.takeDamage();
          enemy.lastHitTime = now;

          // ヒット時の振動（Haptics）
          const gamepads = navigator.getGamepads();
          if (gamepads) {
            for (let i = 0; i < gamepads.length; i++) {
              const gp = gamepads[i];
              if (gp && gp.hapticActuators && gp.hapticActuators.length > 0) {
                gp.hapticActuators[0].pulse(1.0, 50);
              }
            }
          }

          console.log('Sword SLASH Hit!');
        }
      }
    });
  }
});

// ========================================
// 弓コンポーネントに弦引きメソッド追加
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

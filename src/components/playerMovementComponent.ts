// THREE はA-Frameのグローバルを使用（global.d.ts で型定義）

/**
 * プレイヤー移動コンポーネント（ジャンプ・縮地）
 *
 * 操作:
 *   - 地上でAボタン → ジャンプ
 *   - 空中でAボタン → 縮地（左スティック入力があればその方向、なければカメラ向き）
 *
 * 設計:
 *   - rigエンティティに付与
 *   - movement-controlsと共存（Y座標のみ独自管理）
 *   - 縮地はスティック入力 or カメラforwardの水平方向に dashDistance 移動
 *   - 地面判定は Y <= GROUND_Y で簡易管理
 *   - 集中線エフェクト: カメラの子としてThree.js MeshをアタッチするVR正攻法
 *     HTMLオーバーレイはVRモード中HMDに映らないため使えない（WebXR仕様上の制約）
 *     RingGeometryでドーナツ型メッシュをカメラの子に置くと両目に正しくレンダリングされる
 *     参考: https://discourse.threejs.org/t/how-to-modify-individually-the-frames-rendered-in-left-right-eyes-in-vr/60576
 */
export function registerPlayerMovementComponent() {
  AFRAME.registerComponent('player-movement', {
    schema: {
      jumpForce:    { type: 'number', default: 6.0 },   // ジャンプ初速 (m/s)
      gravity:      { type: 'number', default: 16.0 },  // 重力加速度 (m/s²)
      groundY:      { type: 'number', default: 0.0 },   // 地面Y座標
      dashDistance: { type: 'number', default: 8.0 },   // 縮地移動距離 (m)
      dashDuration: { type: 'number', default: 150 },   // 縮地にかける時間 (ms)
    },

    init: function () {
      this.verticalVelocity = 0;
      this.isGrounded = true;
      this.canDash = false;

      // 縮地アニメーション用
      this.isDashing    = false;
      this.dashProgress = 0;
      this.dashFrom     = new THREE.Vector3();
      this.dashTo       = new THREE.Vector3();

      // カメラエンティティ参照
      this.cameraEl = this.el.querySelector('[camera]');

      // スティック入力を保持（縮地方向決定に使用）
      this.stickInput = { x: 0, y: 0 };

      // 集中線エフェクト管理（Three.js Mesh、カメラの子として追加するVR正攻法）
      this.vignetteRing     = null;  // Three.Mesh: ドーナツ型リング
      this.vignetteMat      = null;  // Three.MeshBasicMaterial
      this.speedLineElapsed = 0;
      this.speedLineDur     = 0;
      this.speedLineActive  = false;

      // 右手: Aボタン
      const rightHand = document.getElementById('rightHand');
      if (rightHand) {
        rightHand.addEventListener('abuttondown', this._onAButton.bind(this));
        rightHand.addEventListener('thumbstickmoved', this._onStick.bind(this));
      }
      // 左手: Xボタン + スティック
      const leftHand = document.getElementById('leftHand');
      if (leftHand) {
        leftHand.addEventListener('xbuttondown', this._onAButton.bind(this));
        leftHand.addEventListener('thumbstickmoved', this._onStick.bind(this));
      }
    },

    _onStick: function (evt: any) {
      // A-Frameのthumbstickmovedはdetail.x, detail.yで[-1,1]の値を返す
      const { x, y } = evt.detail;
      this.stickInput.x = x;
      this.stickInput.y = y;
    },

    _onAButton: function () {
      if (this.isGrounded) {
        // 地上 → ジャンプ
        this.verticalVelocity = this.data.jumpForce;
        this.isGrounded = false;
        this.canDash = true; // 次のAボタンで縮地可能に
      } else if (this.canDash && !this.isDashing) {
        // 空中 → 縮地
        this._startDash();
        this.canDash = false; // 縮地は1回限り
      }
    },

    _startDash: function () {
      if (!this.cameraEl) return;

      // ── 縮地方向の決定 ──────────────────────────────────────────────
      // スティックが倒されていれば（閾値0.3）その方向、なければカメラforward
      const STICK_THRESHOLD = 0.3;
      const sx = this.stickInput.x;
      const sy = this.stickInput.y; // A-Frame: y+ = 上 = コントローラー前方 → ワールド前方

      const camQuat = this.cameraEl.object3D.getWorldQuaternion(new THREE.Quaternion());
      let dashDir: any;

      if (Math.abs(sx) > STICK_THRESHOLD || Math.abs(sy) > STICK_THRESHOLD) {
        // A-Frameのthumbstickmoved: スティック前倒し=y マイナス、後ろ倒し=y プラス
        // ワールドのZ-方向（前方）に対応させるには sy をそのまま使う（符号反転不要）
        const stickLocal = new THREE.Vector3(sx, 0, sy); // sy: 前倒し=-1 → Z+方向なので反転なし
        stickLocal.normalize();
        dashDir = stickLocal.applyQuaternion(camQuat);
        dashDir.y = 0;
        if (dashDir.length() < 0.001) {
          dashDir = new THREE.Vector3(0, 0, -1).applyQuaternion(camQuat);
          dashDir.y = 0;
        }
        dashDir.normalize();
      } else {
        // カメラforward方向（水平成分のみ）
        dashDir = new THREE.Vector3(0, 0, -1).applyQuaternion(camQuat);
        dashDir.y = 0;
        if (dashDir.length() < 0.001) return;
        dashDir.normalize();
      }

      this.dashFrom.copy(this.el.object3D.position);
      this.dashTo.copy(this.dashFrom).addScaledVector(dashDir, this.data.dashDistance);
      this.dashTo.y = this.dashFrom.y;

      this.isDashing    = true;
      this.dashProgress = 0;

      // 集中線エフェクト開始（tick管理）
      this._initSpeedLines();
    },

    // ── 集中線エフェクト：初期化 ──────────────────────────────────────
    // カメラの子としてドーナツ型（RingGeometry）Meshを追加する。
    // カメラの子にすることで両目に正しくレンダリングされる（WebXR VR正攻法）。
    // 外側を白・半透明にして画面端に白いフラッシュを出す。
    // depthTest:falseで常に最前面に表示。
    _initSpeedLines: function () {
      const cam = this.cameraEl?.object3D;
      if (!cam) return;

      // 前のエフェクトが残っていれば即削除
      this._removeSpeedLines();

      // カメラの直前に置くZ距離（小さいほどFOVを大きく覆う）
      const Z_DIST    = -0.5;   // カメラから0.5m前
      // RingGeometryの内径・外径（この距離でのFOVをカバーするよう調整）
      // Quest2のFOV≈90°: tan(45°)*0.5 ≈ 0.5m → 外径0.8でほぼ全画面、内径0.4で中心を透過
      const innerR    = 0.38;   // 内径（中心の透明部分）
      const outerR    = 1.2;    // 外径（画面外まで確実にカバー）
      const segments  = 64;

      const geo = new THREE.RingGeometry(innerR, outerR, segments);
      const mat = new THREE.MeshBasicMaterial({
        color:       0xffffff,
        transparent: true,
        opacity:     0.85,
        side:        THREE.FrontSide,
        depthTest:   false,
        depthWrite:  false,
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(0, 0, Z_DIST);
      mesh.renderOrder = 999;

      cam.add(mesh);
      this.vignetteRing     = mesh;
      this.vignetteMat      = mat;
      this.speedLineElapsed = 0;
      this.speedLineDur     = this.data.dashDuration;
      this.speedLineActive  = true;
    },

    // ── 集中線の強制削除 ──
    _removeSpeedLines: function () {
      if (this.vignetteRing) {
        const cam = this.cameraEl?.object3D;
        cam?.remove(this.vignetteRing);
        this.vignetteRing.geometry.dispose();
        this.vignetteMat.dispose();
        this.vignetteRing    = null;
        this.vignetteMat     = null;
        this.speedLineActive = false;
      }
    },

    remove: function () {
      this._removeSpeedLines();
    },

    tick: function (_time: number, deltaMs: number) {
      const dt = deltaMs / 1000;
      const pos = this.el.object3D.position;

      // ── 集中線フェードアウト（tick内で管理） ──
      if (this.speedLineActive && this.vignetteMat) {
        this.speedLineElapsed += deltaMs;
        const t = Math.min(this.speedLineElapsed / this.speedLineDur, 1);
        this.vignetteMat.opacity = 0.85 * (1 - t * t); // easeOutQuad
        if (t >= 1) {
          this._removeSpeedLines();
        }
      }

      // ── 縮地アニメーション（水平移動） ──
      if (this.isDashing) {
        this.dashProgress += deltaMs / this.data.dashDuration;
        if (this.dashProgress >= 1) {
          this.dashProgress = 1;
          this.isDashing = false;
        }
        const t = 1 - (1 - this.dashProgress) * (1 - this.dashProgress);
        pos.x = this.dashFrom.x + (this.dashTo.x - this.dashFrom.x) * t;
        pos.z = this.dashFrom.z + (this.dashTo.z - this.dashFrom.z) * t;
      }

      // ── 垂直方向の物理（重力・ジャンプ） ──
      if (!this.isGrounded) {
        this.verticalVelocity -= this.data.gravity * dt;
        pos.y += this.verticalVelocity * dt;

        if (pos.y <= this.data.groundY) {
          pos.y = this.data.groundY;
          this.verticalVelocity = 0;
          this.isGrounded = true;
          this.canDash    = false;
          this.isDashing  = false;
          this._removeSpeedLines(); // 着地時も確実にクリーンアップ
        }
      }
    }
  });
}

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
 *   - 集中線エフェクトはrequestAnimationFrameを使わずtick内で管理（XR環境でのバグ回避）
 *   - FOVはハードウェアから実際に取得して画面端の座標を計算
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
      // x: 左右, y: 前後（A-Frameのthumbstickmoved準拠）
      this.stickInput = { x: 0, y: 0 };

      // 集中線エフェクト管理（tick内で処理、rAFは使わない）
      this.speedLineGroup   = null;
      this.speedLineMat     = null;
      this.speedLineElapsed = 0;   // 経過ms
      this.speedLineDur     = 0;   // 総持続ms（dashDurationと同期）

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

    // ── 集中線エフェクト：初期化（ダッシュ発動時に1回だけ呼ぶ） ──────────
    // tick内でフェードアウトするのでrequestAnimationFrameは使わない（XR環境安全）
    // FOVはハードウェアから実際に取得し、画面の80%位置を端として集中線を配置する
    _initSpeedLines: function () {
      const cam = this.cameraEl?.object3D;
      if (!cam) return;

      // 前の集中線が残っていれば即削除（増殖防止）
      this._removeSpeedLines();

      // ── FOVから画面端の座標を計算 ──────────────────────────────────
      // WebXR環境: renderer.xr.getCamera() からProjectionMatrixを取得してtanFOVを逆算
      // 非XR環境: scene.cameraのfovプロパティを使用
      // どちらも「ニア平面z=-1での端の座標」を求めてEDGE_RATIOで内側に絞る
      const EDGE_RATIO  = 0.80; // 画面端の何割に線を出すか（0.8=画面端の80%位置）
      const LINE_COUNT  = 28;
      // z値は「計算用の投影面」として使う。depthTestオフなので実際の描画位置は関係ない。
      // tanFOV * |FAR_Z| で端の座標が決まるので、FAR_Z を大きくするほど端が広がる。
      const FAR_Z       = -1.0;  // 開始点Z（端の座標計算基準。大きいほど端に広がる）
      const NEAR_Z      = -0.5;  // 収束点Z（中心に向かう方向）
      const duration    = this.data.dashDuration;

      let tanHalfFovY = Math.tan((75 / 2) * Math.PI / 180); // デフォルト75°
      let aspectRatio = 1.0;

      try {
        const renderer = (this.el.sceneEl as any).renderer;
        if (renderer?.xr?.isPresenting) {
          // XRカメラのprojectionMatrixからtanFOVを逆算
          const xrCam = renderer.xr.getCamera();
          const pm = xrCam.projectionMatrix;
          // projectionMatrix[5] = 1/tan(halfFovY), projectionMatrix[0] = 1/(aspect*tan(halfFovY))
          tanHalfFovY = 1.0 / pm.elements[5];
          aspectRatio  = pm.elements[5] / pm.elements[0];
        } else {
          const sceneCamera = (this.el.sceneEl as any).camera;
          if (sceneCamera?.fov) {
            tanHalfFovY = Math.tan((sceneCamera.fov / 2) * Math.PI / 180);
            aspectRatio  = sceneCamera.aspect ?? 1.0;
          }
        }
      } catch (_) { /* fallback値を使う */ }

      // z=-1平面での端の半幅・半高さ（比例してFAR_Zにスケール）
      const edgeH = tanHalfFovY * Math.abs(FAR_Z) * EDGE_RATIO;
      const edgeW = edgeH * aspectRatio;

      const group = new THREE.Group();
      group.renderOrder = 999;

      const mat = new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.95,
        depthTest: false,
        depthWrite: false,
      });

      for (let i = 0; i < LINE_COUNT; i++) {
        const angle = (i / LINE_COUNT) * Math.PI * 2;
        // 楕円形の端（アスペクト比を反映）
        const r   = 0.7 + Math.random() * 0.3;
        const ex  = Math.cos(angle) * edgeW * r;
        const ey  = Math.sin(angle) * edgeH * r;
        // 収束点は中心付近の微小オフセット
        const cx  = (Math.random() - 0.5) * 0.015;
        const cy  = (Math.random() - 0.5) * 0.015;

        const geo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(ex, ey, FAR_Z),
          new THREE.Vector3(cx, cy, NEAR_Z),
        ]);
        group.add(new THREE.Line(geo, mat));
      }

      cam.add(group);
      this.speedLineGroup   = group;
      this.speedLineMat     = mat;
      this.speedLineElapsed = 0;
      this.speedLineDur     = duration;
    },

    // ── 集中線の強制削除（着地・再ダッシュ・コンポーネント削除時に呼ぶ） ──
    _removeSpeedLines: function () {
      if (this.speedLineGroup) {
        const cam = this.cameraEl?.object3D;
        cam?.remove(this.speedLineGroup);
        this.speedLineGroup.children.forEach((line: any) => line.geometry.dispose());
        this.speedLineMat?.dispose();
        this.speedLineGroup = null;
        this.speedLineMat   = null;
      }
    },

    remove: function () {
      // コンポーネント削除時にクリーンアップ
      this._removeSpeedLines();
    },

    tick: function (_time: number, deltaMs: number) {
      const dt = deltaMs / 1000;
      const pos = this.el.object3D.position;

      // ── 集中線フェードアウト（tick内で管理、rAF不使用） ──
      if (this.speedLineGroup && this.speedLineMat) {
        this.speedLineElapsed += deltaMs;
        const t = Math.min(this.speedLineElapsed / this.speedLineDur, 1);
        this.speedLineMat.opacity = 0.95 * (1 - t * t); // easeOutQuad
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

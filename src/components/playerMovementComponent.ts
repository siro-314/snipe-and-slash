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

      // 集中線エフェクト管理（2D HTMLCanvas方式、tick内でフェード）
      this.speedLineCanvas  = document.getElementById('speedline-overlay') as HTMLCanvasElement | null;
      this.speedLineElapsed = 0;
      this.speedLineDur     = 0;
      this.speedLineActive  = false;
      // 線の定義を一度だけ生成して使い回す（毎フレームの乱数を避けるため）
      this.speedLineSeeds   = [] as Array<{ angle: number; r: number; cx: number; cy: number }>;

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
    // HTMLCanvasに2Dで描画するのでThree.js / WebXRのカメラ座標系と完全に無関係。
    // 画面端＝canvasの端なので位置がズレることがない。
    _initSpeedLines: function () {
      const canvas = this.speedLineCanvas as HTMLCanvasElement;
      if (!canvas) return;

      // canvas サイズをウィンドウに合わせる
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;

      const LINE_COUNT = 32;
      const EDGE_RATIO = 0.82; // 画面端の何割の位置から線を開始するか

      // 線ごとのランダムな形状をシードとして保存（tick内で毎回再計算しない）
      this.speedLineSeeds = [];
      for (let i = 0; i < LINE_COUNT; i++) {
        this.speedLineSeeds.push({
          angle: (i / LINE_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.15,
          r:     EDGE_RATIO + Math.random() * (1.0 - EDGE_RATIO), // EDGE_RATIO〜1.0の範囲
          cx:    (Math.random() - 0.5) * 8,  // 収束点の微小オフセット(px)
          cy:    (Math.random() - 0.5) * 8,
        });
      }

      this.speedLineActive  = true;
      this.speedLineElapsed = 0;
      this.speedLineDur     = this.data.dashDuration;
    },

    // ── 集中線の強制クリア ──
    _removeSpeedLines: function () {
      if (!this.speedLineActive) return;
      this.speedLineActive = false;
      const canvas = this.speedLineCanvas as HTMLCanvasElement;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
      }
    },

    remove: function () {
      this._removeSpeedLines();
    },

    tick: function (_time: number, deltaMs: number) {
      const dt = deltaMs / 1000;
      const pos = this.el.object3D.position;

      // ── 集中線フェードアウト（2D Canvas、tick内で管理） ──
      if (this.speedLineActive) {
        this.speedLineElapsed += deltaMs;
        const t = Math.min(this.speedLineElapsed / this.speedLineDur, 1);
        const opacity = 0.85 * (1 - t * t); // easeOutQuad

        const canvas = this.speedLineCanvas as HTMLCanvasElement;
        if (canvas) {
          const ctx = canvas.getContext('2d')!;
          const W = canvas.width;
          const H = canvas.height;
          const cx = W / 2;
          const cy = H / 2;

          ctx.clearRect(0, 0, W, H);

          if (t < 1) {
            ctx.globalAlpha = opacity;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth   = 1.5;
            ctx.lineCap     = 'round';

            for (const seed of this.speedLineSeeds) {
              // 端の点: 画面の中心から seed.r * 半対角線分の距離を angle 方向に
              // 楕円形（アスペクト比反映）で画面端をなぞる
              const halfW = cx * seed.r;
              const halfH = cy * seed.r;
              const ex = cx + Math.cos(seed.angle) * halfW;
              const ey = cy + Math.sin(seed.angle) * halfH;

              ctx.beginPath();
              ctx.moveTo(ex, ey);
              ctx.lineTo(cx + seed.cx, cy + seed.cy);
              ctx.stroke();
            }
          } else {
            this._removeSpeedLines();
          }
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

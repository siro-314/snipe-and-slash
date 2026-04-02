// THREE はA-Frameのグローバルを使用（global.d.ts で型定義）

/**
 * プレイヤー移動コンポーネント（ジャンプ・縮地）
 *
 * 操作:
 *   - 地上でAボタン → ジャンプ
 *   - 空中でAボタン → 縮地（カメラ向き方向へ瞬間移動、1回限り）
 *
 * 設計:
 *   - rigエンティティに付与
 *   - movement-controlsと共存（Y座標のみ独自管理）
 *   - 縮地はカメラのforward方向（水平成分のみ）に dashDistance 移動
 *   - 地面判定は Y <= GROUND_Y で簡易管理
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
      this.canDash = false;      // 空中でダッシュ可能か（ジャンプ後に1回だけ）

      // 縮地アニメーション用
      this.isDashing    = false;
      this.dashProgress = 0;    // 0〜1
      this.dashFrom     = new THREE.Vector3();
      this.dashTo       = new THREE.Vector3();

      // カメラエンティティ参照（forward方向取得用）
      this.cameraEl = this.el.querySelector('[camera]');

      // 右手コントローラーのAボタンを購読
      const rightHand = document.getElementById('rightHand');
      if (rightHand) {
        rightHand.addEventListener('abuttondown', this._onAButton.bind(this));
      }
      // 左手コントローラーのXボタンも同じ動作（任意）
      const leftHand = document.getElementById('leftHand');
      if (leftHand) {
        leftHand.addEventListener('xbuttondown', this._onAButton.bind(this));
      }
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

      // カメラのforward方向（水平成分のみ）
      const camQuat = this.cameraEl.object3D.getWorldQuaternion(new THREE.Quaternion());
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camQuat);
      forward.y = 0;
      if (forward.length() < 0.001) return;
      forward.normalize();

      this.dashFrom.copy(this.el.object3D.position);
      this.dashTo.copy(this.dashFrom).addScaledVector(forward, this.data.dashDistance);
      this.dashTo.y = this.dashFrom.y;

      this.isDashing    = true;
      this.dashProgress = 0;

      // 集中線エフェクト発動
      this._showSpeedLines();
    },

    // ── 集中線エフェクト ──────────────────────────────────────────────
    // カメラ前方に放射状ラインを描画し、dashDuration後にフェードアウト
    _showSpeedLines: function () {
      const scene = this.el.sceneEl.object3D;
      const cam = this.cameraEl?.object3D;
      if (!cam) return;

      const LINE_COUNT  = 24;   // 線の本数
      const LINE_LEN    = 3.5;  // 線の長さ (m)
      const INNER_R     = 0.3;  // 中心から始まる距離 (m)
      const SPREAD      = 0.55; // 画角の広がり（radians, 視野の端まで）
      const duration    = this.data.dashDuration;

      // グループをカメラのローカル座標で作成
      const group = new THREE.Group();

      const mat = new THREE.LineBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.85,
        depthTest: false, depthWrite: false
      });

      for (let i = 0; i < LINE_COUNT; i++) {
        const angle = (i / LINE_COUNT) * Math.PI * 2;
        // ランダムなばらつきで自然な集中線に
        const r     = SPREAD * (0.5 + Math.random() * 0.5);
        const ox    = Math.cos(angle) * r;
        const oy    = Math.sin(angle) * r;
        // カメラローカル: x=横, y=縦, z=-前方
        const startX = Math.cos(angle) * INNER_R * 0.1;
        const startY = Math.sin(angle) * INNER_R * 0.1;
        const endX   = ox * (INNER_R + LINE_LEN * (0.7 + Math.random() * 0.3));
        const endY   = oy * (INNER_R + LINE_LEN * (0.7 + Math.random() * 0.3));

        const geo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(startX, startY, -INNER_R),
          new THREE.Vector3(endX,   endY,   -(INNER_R + LINE_LEN))
        ]);
        group.add(new THREE.Line(geo, mat.clone()));
      }

      // カメラの子として追加（カメラに追従）
      cam.add(group);

      // フェードアウトして削除
      const startTime = performance.now();
      const fade = () => {
        const elapsed = performance.now() - startTime;
        const t = Math.min(elapsed / duration, 1);
        // easeIn で素早く消える
        const opacity = 0.85 * (1 - t * t);
        group.children.forEach((line: any) => {
          (line.material as any).opacity = opacity;
        });
        if (t < 1) {
          requestAnimationFrame(fade);
        } else {
          cam.remove(group);
        }
      };
      requestAnimationFrame(fade);
    },

    tick: function (_time: number, deltaMs: number) {
      const dt = deltaMs / 1000; // 秒に変換
      const pos = this.el.object3D.position;

      // ── 縮地アニメーション（水平移動） ──
      if (this.isDashing) {
        this.dashProgress += deltaMs / this.data.dashDuration;
        if (this.dashProgress >= 1) {
          this.dashProgress = 1;
          this.isDashing = false;
        }
        // easeOutQuad で滑らかに減速
        const t = 1 - (1 - this.dashProgress) * (1 - this.dashProgress);
        pos.x = this.dashFrom.x + (this.dashTo.x - this.dashFrom.x) * t;
        pos.z = this.dashFrom.z + (this.dashTo.z - this.dashFrom.z) * t;
      }

      // ── 垂直方向の物理（重力・ジャンプ） ──
      if (!this.isGrounded) {
        this.verticalVelocity -= this.data.gravity * dt;
        pos.y += this.verticalVelocity * dt;

        // 地面に着地
        if (pos.y <= this.data.groundY) {
          pos.y = this.data.groundY;
          this.verticalVelocity = 0;
          this.isGrounded = true;
          this.canDash   = false;
          this.isDashing  = false;
        }
      }
    }
  });
}

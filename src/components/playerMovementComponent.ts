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
      jumpForce:         { type: 'number', default: 6.0 },   // ジャンプ初速 (m/s)
      gravity:           { type: 'number', default: 16.0 },  // 重力加速度 (m/s²)
      groundY:           { type: 'number', default: 0.0 },   // 地面Y座標
      dashDistance:      { type: 'number', default: 8.0 },   // 縮地移動距離 (m)
      dashDuration:      { type: 'number', default: 100 },   // 縮地移動時間 (ms) ← 鋭く
      dashStunDuration:  { type: 'number', default: 350 },   // 着地硬直時間 (ms) ← 技感
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

      // Vignetteエフェクト管理（Three.js Mesh、カメラの子として追加するVR正攻法）
      this.vignetteRing     = null;
      this.vignetteMat      = null;
      this.vignetteMats     = [];   // Vignette用マテリアル管理
      this.vignetteTex      = null; // Vignette用テクスチャ
      this.speedLineElapsed = 0;
      this.speedLineDur     = 0;     // dashDuration + dashStunDuration の合計
      this.speedLineActive  = false;

      // 硬直管理
      this.isStunned     = false;
      this.stunElapsed   = 0;

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
      // 硬直中は全入力を無視
      if (this.isStunned) return;

      if (this.isGrounded) {
        // 地上 → ジャンプ
        this.verticalVelocity = this.data.jumpForce;
        this.isGrounded = false;
        this.canDash = true;
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

      // Vignetteエフェクト開始（移動+硬直の合計時間でフェード）
      this._initSpeedLines();
    },

    // ── Vignetteエフェクト：初期化 ──────────────────────────────────────
    // カメラの子としてRingGeometry（ドーナツ型）をアタッチするVR正攻法。
    // 画面周辺を暗くし、移動+硬直の合計時間でじわっとフェードアウト。
    // 「技感」のある縮地を演出するため、移動は鋭く・硬直中にVignetteが消えていく。
    _initSpeedLines: function () {
      const cam = this.cameraEl?.object3D;
      if (!cam) return;

      this._removeSpeedLines();

      // CanvasTextureベースの滑らかなVignette。
      // ShaderMaterialは環境差で表示されないケースがあるため、
      // Quest系でも安定しやすいMeshBasicMaterial方式にする。
      //
      // 重要: プレーンを大きくしすぎると、視野に映るのがUV中心の狭い範囲だけになり、
      // 放射グラデの「透明の内側」だけがサンプリングされて周辺の黒が一切見えない。
      // カメラFOVと距離に合わせたサイズにする（旧4x4はそのため効果がゼロだった）。
      const planeDist = 0.5;
      const pc: any = this.cameraEl.getObject3D('camera');
      let fovRad = THREE.MathUtils.degToRad(80);
      let aspect = typeof window !== 'undefined' ? window.innerWidth / Math.max(1, window.innerHeight) : 1.6;
      if (pc && pc.isPerspectiveCamera) {
        fovRad = THREE.MathUtils.degToRad(pc.fov);
        if (pc.aspect > 0) aspect = pc.aspect;
      }
      const vH = 2 * planeDist * Math.tan(fovRad / 2);
      const vW = vH * aspect;
      // わずかに大きめにして、矩形プレーンの四隅で「外」がチラ見えするのを抑える
      const margin = 1.12;
      const geo = new THREE.PlaneGeometry(vW * margin, vH * margin);
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      // 内側の完全透明ゾーンを小さく → 暗部が視界のより内側まで入る
      // rInner→rOuter の帯を広く＋多段ストップで、透明度の変化をなだらかに
      const radiusInner = canvas.width * 0.055;
      const radiusOuter = canvas.width * 0.51;
      const grad = ctx.createRadialGradient(cx, cy, radiusInner, cx, cy, radiusOuter);
      grad.addColorStop(0.0, 'rgba(0,0,0,0.0)');
      grad.addColorStop(0.18, 'rgba(0,0,0,0.08)');
      grad.addColorStop(0.38, 'rgba(0,0,0,0.22)');
      grad.addColorStop(0.58, 'rgba(0,0,0,0.42)');
      grad.addColorStop(0.76, 'rgba(0,0,0,0.64)');
      grad.addColorStop(0.9, 'rgba(0,0,0,0.86)');
      grad.addColorStop(1.0, 'rgba(0,0,0,1.0)');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const tex = new THREE.CanvasTexture(canvas);
      tex.needsUpdate = true;
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: 1.0,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.renderOrder = 999;
      mesh.position.set(0, 0, -planeDist);

      cam.add(mesh);
      this.vignetteRing  = mesh;
      this.vignetteMats  = [mat];
      this.vignetteMat   = mat; // フェード用参照
      this.vignetteTex   = tex;
      this.speedLineElapsed = 0;
      // 移動時間 + 硬直時間の合計でフェードアウト
      this.speedLineDur     = this.data.dashDuration + this.data.dashStunDuration;
      this.speedLineActive  = true;
    },

    // ── 集中線の強制削除 ──
    _removeSpeedLines: function () {
      if (this.vignetteRing) {
        const cam = this.cameraEl?.object3D;
        cam?.remove(this.vignetteRing);
        this.vignetteRing.geometry.dispose();
        this.vignetteMat?.dispose();
        this.vignetteTex?.dispose();
        this.vignetteRing    = null;
        this.vignetteMat     = null;
        this.vignetteMats    = [];
        this.vignetteTex     = null;
        this.speedLineActive = false;
      }
    },

    remove: function () {
      this._removeSpeedLines();
    },

    tick: function (_time: number, deltaMs: number) {
      const dt = deltaMs / 1000;
      const pos = this.el.object3D.position;

      // ── Vignetteフェードアウト ──
      if (this.speedLineActive && this.vignetteMat) {
        this.speedLineElapsed += deltaMs;
        const t = Math.min(this.speedLineElapsed / this.speedLineDur, 1);
        const ease = 1 - t * t; // easeOutQuad
        this.vignetteMat.opacity = ease;
        if (t >= 1) {
          this._removeSpeedLines();
        }
      }

      // ── 硬直管理（ダッシュ移動完了後に開始） ──
      if (this.isStunned) {
        this.stunElapsed += deltaMs;
        if (this.stunElapsed >= this.data.dashStunDuration) {
          this.isStunned   = false;
          this.stunElapsed = 0;
        }
      }

      // ── 縮地アニメーション（水平移動） ──
      if (this.isDashing) {
        this.dashProgress += deltaMs / this.data.dashDuration;
        if (this.dashProgress >= 1) {
          this.dashProgress = 1;
          this.isDashing    = false;
          // 移動完了 → 硬直開始
          this.isStunned   = true;
          this.stunElapsed = 0;
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
          this.isGrounded  = true;
          this.canDash     = false;
          this.isDashing   = false;
          this.isStunned   = false;
          this.stunElapsed = 0;
          this._removeSpeedLines();
        }
      }
    }
  });
}

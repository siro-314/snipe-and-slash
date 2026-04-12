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

/** 集中線を2本並べたときの明るさ補正（初期 opacity と tick のフェードで共通） */
const SPEED_LINE_PARALLEL_BRIGHT_MUL = 0.82;

export function registerPlayerMovementComponent() {
  AFRAME.registerComponent('player-movement', {
    schema: {
      jumpForce:         { type: 'number', default: 6.0 },   // ジャンプ初速 (m/s)
      gravity:           { type: 'number', default: 16.0 },  // 重力加速度 (m/s²)
      groundY:           { type: 'number', default: 0.0 },   // 地面Y座標
      dashDistance:      { type: 'number', default: 8.0 },   // 縮地移動距離 (m)
      dashDuration:      { type: 'number', default: 100 },   // 縮地移動時間 (ms) ← 鋭く
      dashStunDuration:  { type: 'number', default: 350 },   // 着地硬直時間 (ms) ← 技感
      /** 縮地時の集中線本数（控えめ推奨。ヴィネットと併用前提） */
      speedLineCount:    { type: 'int', default: 18, min: 0 },
      /** 集中線の最大不透明度（ヴィネットより下げると馴染む） */
      speedLineOpacity:  { type: 'number', default: 0.19 },
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

      this._dashDirWorld = new THREE.Vector3();

      // 縮地エフェクト（ヴィネット + 控えめ集中線）— カメラの子に Group でまとめる
      this.dashEffectGroup  = null;
      this.vignetteRing     = null;
      this.vignetteMat      = null;
      this.vignetteMats     = [];   // Vignette用マテリアル管理
      this.vignetteTex      = null; // Vignette用テクスチャ
      this.speedLineSeg     = null;
      this.speedLineLineMat = null;
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

      this._dashDirWorld.copy(dashDir);

      // Vignette + 集中線（移動+硬直の合計時間でフェード）
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
      // 視野端・下向き視線でプレーン外がチラ見えないよう、FOV合わせより外側だけ広げる
      // （Canvas の内側グラデは radiusInner / ストップは触らず、UVの「外周」側の余白だけ増やすイメージ）
      const margin = 1.38;
      const geo = new THREE.PlaneGeometry(vW * margin, vH * margin);
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const effectGroup = new THREE.Group();
      effectGroup.renderOrder = 998;

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

      effectGroup.add(mesh);

      // ── 控えめな集中線（移動方向へ収束、密度低め・低不透明度）────────────
      const lineDist = planeDist - 0.015;
      const lineCount = Math.max(0, this.data.speedLineCount | 0);
      const halfW = (vW * margin) * 0.5;
      const halfH = (vH * margin) * 0.5;
      const outerR = Math.sqrt(halfW * halfW + halfH * halfH) * 0.98;

      const qWorld = new THREE.Quaternion();
      this.cameraEl.object3D.getWorldQuaternion(qWorld);
      const qInv = qWorld.clone().invert();
      const dashL = this._dashDirWorld.clone().applyQuaternion(qInv);
      let fx = 0;
      let fy = 0;
      const vz = dashL.z;
      if (vz < -0.02) {
        fx = (-lineDist * dashL.x) / vz;
        fy = (-lineDist * dashL.y) / vz;
      }
      const maxOffX = halfW * 0.42;
      const maxOffY = halfH * 0.42;
      fx = THREE.MathUtils.clamp(fx, -maxOffX, maxOffX);
      fy = THREE.MathUtils.clamp(fy, -maxOffY, maxOffY);

      if (lineCount > 0) {
        // 太さより「長さ・内側への侵入」を優先: 外周をやや大きく、終点を収束点寄りに。
        // lineWidth が効かない端末向けは細い2本オフセットのみ。
        const stripes = 2;
        const pos = new Float32Array(lineCount * stripes * 2 * 3);
        const halfThick = Math.min(halfW, halfH) * 0.0058;
        for (let i = 0; i < lineCount; i++) {
          const ang =
            (i / lineCount) * Math.PI * 2 + (Math.random() - 0.5) * (Math.PI / lineCount);
          const radJ = 0.94 + (Math.random() - 0.5) * 0.06;
          const ox = Math.cos(ang) * outerR * radJ;
          const oy = Math.sin(ang) * outerR * radJ;
          // inward 大→収束点に近い＝線が長く視界の内側まで入る（0.38〜0.60 より深く）
          const inward = 0.52 + Math.random() * 0.34;
          const ix = ox + (fx - ox) * inward;
          const iy = oy + (fy - oy) * inward;
          let dx = ix - ox;
          let dy = iy - oy;
          let len = Math.sqrt(dx * dx + dy * dy);
          if (len < 1e-5) {
            len = 1;
            dx = 1;
            dy = 0;
          }
          const px = (-dy / len) * halfThick;
          const py = (dx / len) * halfThick;
          for (let s = 0; s < stripes; s++) {
            const sign = s === 0 ? 1 : -1;
            const base = (i * stripes + s) * 6;
            pos[base + 0] = ox + px * sign;
            pos[base + 1] = oy + py * sign;
            pos[base + 2] = -lineDist;
            pos[base + 3] = ix + px * sign;
            pos[base + 4] = iy + py * sign;
            pos[base + 5] = -lineDist;
          }
        }
        const lineGeo = new THREE.BufferGeometry();
        lineGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        const lineMat = new THREE.LineBasicMaterial({
          color: 0xffffff,
          transparent: true,
          // 2本化で明るさが乗るので少し抑える
          opacity: this.data.speedLineOpacity * SPEED_LINE_PARALLEL_BRIGHT_MUL,
          depthTest: false,
          depthWrite: false,
        });
        const lines = new THREE.LineSegments(lineGeo, lineMat);
        lines.renderOrder = 1000;
        effectGroup.add(lines);
        this.speedLineSeg     = lines;
        this.speedLineLineMat = lineMat;
      }

      cam.add(effectGroup);
      this.dashEffectGroup = effectGroup;
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
      if (!this.dashEffectGroup) {
        this.speedLineActive = false;
        return;
      }
      const cam = this.cameraEl?.object3D;
      cam?.remove(this.dashEffectGroup);
      this.dashEffectGroup = null;
      this.vignetteRing?.geometry.dispose();
      this.vignetteMat?.dispose();
      this.vignetteTex?.dispose();
      if (this.speedLineSeg) {
        this.speedLineSeg.geometry.dispose();
        this.speedLineLineMat?.dispose();
      }
      this.vignetteRing     = null;
      this.vignetteMat      = null;
      this.vignetteMats     = [];
      this.vignetteTex      = null;
      this.speedLineSeg     = null;
      this.speedLineLineMat = null;
      this.speedLineActive  = false;
    },

    remove: function () {
      this._removeSpeedLines();
    },

    tick: function (_time: number, deltaMs: number) {
      const dt = deltaMs / 1000;
      const pos = this.el.object3D.position;

      // ── Vignette + 集中線フェードアウト ──
      if (this.speedLineActive && this.vignetteMat) {
        this.speedLineElapsed += deltaMs;
        const t = Math.min(this.speedLineElapsed / this.speedLineDur, 1);
        const ease = 1 - t * t; // easeOutQuad
        this.vignetteMat.opacity = ease;
        if (this.speedLineLineMat) {
          this.speedLineLineMat.opacity =
            ease * this.data.speedLineOpacity * SPEED_LINE_PARALLEL_BRIGHT_MUL;
        }
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

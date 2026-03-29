/**
 * 弓デバッグ＋位置調整パネル
 *
 * [CALIB] ボタン: 手/矢で触れると ON/OFF トグル
 *
 * CALIB ON 中:
 *   [NOCK CALIB] ボタン:
 *     - 調整専用の別弓セット（緑の大球）をシーン内に固定表示
 *     - 手元の弓は一切変更しない
 *     - グリップで緑球を掴んで動かす → 両手の弓にリアルタイム反映
 *     - デバッグパネルに OFFSET x,y,z を数値表示
 *     - もう一度 NOCK CALIB を押すと非表示
 *
 *   [PITCH+] [PITCH-] [YAW+] [YAW-] ボタン:
 *     - 矢の発射補正を 90度ステップで調整
 *     - デバッグパネルに PITCH/YAW 角度を数値表示
 *
 * デバッグテキスト: CALIBボタン上部に固定表示
 */
export function registerBowDebugComponent() {
  AFRAME.registerComponent('bow-debug', {

    init: function () {
      this.textEl      = null;
      this.lastLog     = '';
      this.calibMode   = false;
      this.nockMode    = false;   // NOCK CALIB サブモード
      this._hitCooldown = 0;

      // ボタン参照
      this._btnCalib   = null;
      this._btnNock    = null;
      this._btnPitchUp = null;
      this._btnPitchDn = null;
      this._btnYawL    = null;
      this._btnYawR    = null;
      this._btnRoot    = null;

      // NOCK CALIB 用: 調整専用弓セット
      this._refBowRoot       = null;
      this._refNockSphere    = null;
      this._refGrabbing      = false;
      this._refGrabHand      = null;
      this._refGrabOffset    = new THREE.Vector3();
      this._refGripHandlers  = [];

      this._createUI();
    },

    // =========================================================
    //  UI構築
    // =========================================================
    _createUI: function () {
      const scene = document.querySelector('a-scene');

      const btnRoot = document.createElement('a-entity');
      btnRoot.setAttribute('position', '0 1.4 -2');
      scene?.appendChild(btnRoot);
      this._btnRoot = btnRoot;

      // --- デバッグテキストパネル（CALIBボタン上部に固定） ---
      const panel = document.createElement('a-entity');
      panel.setAttribute('position', '0 0.72 0');
      btnRoot.appendChild(panel);

      const bg = document.createElement('a-plane');
      bg.setAttribute('width',   '0.72');
      bg.setAttribute('height',  '0.56');
      bg.setAttribute('color',   '#111111');
      bg.setAttribute('opacity', '0.9');
      panel.appendChild(bg);

      const text = document.createElement('a-text');
      text.setAttribute('value',      'BOW DEBUG\nLoading...');
      text.setAttribute('color',      '#00ff88');
      text.setAttribute('width',      '0.68');
      text.setAttribute('position',   '-0.34 0.25 0.01');
      text.setAttribute('anchor',     'left');
      text.setAttribute('baseline',   'top');
      text.setAttribute('wrap-count', '38');
      panel.appendChild(text);
      this.textEl = text;

      // --- メイン CALIB ボタン ---
      this._btnCalib = this._makeBtn(btnRoot, '[ CALIB: OFF ]', '#ffffff', '#333333', '0 0.25 0', 0.55, 0.14);

      // --- NOCK CALIB サブボタン ---
      this._btnNock = this._makeBtn(btnRoot, 'NOCK CALIB', '#88ff88', '#1a3a1a', '-0.17 -0.02 0', 0.26, 0.09);

      // --- PITCH / YAW 調整ボタン（90度ステップ） ---
      this._btnPitchUp = this._makeBtn(btnRoot, 'PITCH+', '#ffff88', '#2a2a00', ' 0.17 0.03 0',  0.20, 0.08);
      this._btnPitchDn = this._makeBtn(btnRoot, 'PITCH-', '#ffff88', '#2a2a00', ' 0.17 -0.07 0', 0.20, 0.08);
      this._btnYawL    = this._makeBtn(btnRoot, 'YAW+',   '#88ffff', '#002a2a', ' 0.17 -0.17 0', 0.20, 0.08);
      this._btnYawR    = this._makeBtn(btnRoot, 'YAW-',   '#88ffff', '#002a2a', ' 0.17 -0.27 0', 0.20, 0.08);

      const hint = document.createElement('a-text');
      hint.setAttribute('value',    'Touch CALIB with hand or arrow');
      hint.setAttribute('color',    '#aaaaaa');
      hint.setAttribute('width',    '0.9');
      hint.setAttribute('align',    'center');
      hint.setAttribute('position', '0 0.10 0.01');
      btnRoot.appendChild(hint);
    },

    _makeBtn: function (parent: any, label: string, textColor: string, bgColor: string,
                        pos: string, w: number, h: number) {
      const box = document.createElement('a-box');
      box.setAttribute('width',    String(w));
      box.setAttribute('height',   String(h));
      box.setAttribute('depth',    '0.06');
      box.setAttribute('color',    bgColor);
      box.setAttribute('position', pos);
      parent.appendChild(box);

      const txt = document.createElement('a-text');
      txt.setAttribute('value', label);
      txt.setAttribute('color', textColor);
      txt.setAttribute('width', String(w * 1.1));
      txt.setAttribute('align', 'center');
      const p = pos.trim().split(/\s+/).map(Number);
      txt.setAttribute('position', `${p[0]} ${p[1]} ${(p[2] ?? 0) + 0.04}`);
      parent.appendChild(txt);

      (box as any)._labelEl = txt;
      return box;
    },

    // =========================================================
    //  当たり判定（手または矢がボタンに触れているか）
    // =========================================================
    _checkHit: function (btnEl: any, radius: number): boolean {
      if (!btnEl) return false;
      const btnPos = btnEl.object3D.getWorldPosition(new THREE.Vector3());

      for (const id of ['leftHand', 'rightHand']) {
        const el = document.getElementById(id) as any;
        if (el?.object3D.getWorldPosition(new THREE.Vector3()).distanceTo(btnPos) < radius) return true;
      }
      const arrows = document.querySelectorAll('[player-arrow]');
      for (let i = 0; i < arrows.length; i++) {
        if ((arrows[i] as any).object3D.getWorldPosition(new THREE.Vector3()).distanceTo(btnPos) < radius) return true;
      }
      return false;
    },

    // =========================================================
    //  NOCK CALIB: 調整専用弓セット 表示/非表示
    // =========================================================
    _showRefBow: function () {
      if (this._refBowRoot) return;
      const scene = document.querySelector('a-scene') as any;

      // 調整専用弓のルート（プレイヤー前方左寄り固定）
      const root = document.createElement('a-entity');
      root.setAttribute('position', '-0.8 1.2 -1.5');
      scene.appendChild(root);
      this._refBowRoot = root;

      // ラベル
      const label = document.createElement('a-text');
      label.setAttribute('value',    'NOCK CALIB\nGrab green sphere\nto adjust grip position');
      label.setAttribute('color',    '#ffff00');
      label.setAttribute('width',    '1.0');
      label.setAttribute('align',    'center');
      label.setAttribute('position', '0 0.40 0');
      root.appendChild(label);

      // 調整専用 nockSphere（大きめで掴みやすく）
      const geo = new THREE.SphereGeometry(0.09, 12, 8);
      const mat = new THREE.MeshBasicMaterial({
        color: 0x00ff00, transparent: true, opacity: 0.85, wireframe: true
      });
      this._refNockSphere = new THREE.Mesh(geo, mat);

      // 初期ワールド座標 = refBowRoot のワールド位置 + 現在の nockOffset
      const rootWorldPos = new THREE.Vector3();
      root.object3D.updateWorldMatrix(true, false);
      root.object3D.getWorldPosition(rootWorldPos);
      const sword      = this._getSword();
      const initOffset = sword ? sword.getNockOffset() : new THREE.Vector3();
      // ワールド座標に直接配置
      this._refNockSphere.position.copy(rootWorldPos.clone().add(initOffset));
      scene.object3D.add(this._refNockSphere);

      // グリップイベント登録
      this._refGripHandlers = [];
      ['leftHand', 'rightHand'].forEach((id: string) => {
        const handEl = document.getElementById(id);
        if (!handEl) return;
        const onGripDown = () => {
          if (!this.nockMode) return;
          const handPos   = (handEl as any).object3D.getWorldPosition(new THREE.Vector3());
          const spherePos = this._refNockSphere.position.clone();
          if (handPos.distanceTo(spherePos) < 0.25) {
            this._refGrabbing  = true;
            this._refGrabHand  = handEl;
            this._refGrabOffset.subVectors(spherePos, handPos);
          }
        };
        const onGripUp = () => {
          if (this._refGrabHand === handEl) {
            this._refGrabbing = false;
            this._refGrabHand = null;
          }
        };
        handEl.addEventListener('gripdown', onGripDown);
        handEl.addEventListener('gripup',   onGripUp);
        this._refGripHandlers.push({ handEl, onGripDown, onGripUp });
      });
    },

    _hideRefBow: function () {
      if (this._refBowRoot) {
        this._refBowRoot.parentNode?.removeChild(this._refBowRoot);
        this._refBowRoot = null;
      }
      if (this._refNockSphere) {
        this._refNockSphere.parent?.remove(this._refNockSphere);
        this._refNockSphere = null;
      }
      this._refGripHandlers.forEach(({ handEl, onGripDown, onGripUp }: any) => {
        handEl.removeEventListener('gripdown', onGripDown);
        handEl.removeEventListener('gripup',   onGripUp);
      });
      this._refGripHandlers = [];
      this._refGrabbing = false;
      this._refGrabHand = null;
    },

    // =========================================================
    //  tick
    // =========================================================
    tick: function () {
      if (this._hitCooldown > 0) { this._hitCooldown--; }

      // --- NOCK CALIB: refNockSphere を手で動かし両手の弓にリアルタイム反映 ---
      if (this.nockMode && this._refGrabbing && this._refGrabHand && this._refNockSphere) {
        const handPos = (this._refGrabHand as any).object3D.getWorldPosition(new THREE.Vector3());
        const newWorldPos = handPos.clone().add(this._refGrabOffset);
        this._refNockSphere.position.copy(newWorldPos);

        // refBowRoot のワールド座標を引いてオフセット算出 → 全 sword に反映
        if (this._refBowRoot) {
          const rootWorld = new THREE.Vector3();
          this._refBowRoot.object3D.getWorldPosition(rootWorld);
          const newOffset = newWorldPos.clone().sub(rootWorld);
          document.querySelectorAll('[sword]').forEach((el: any) => {
            if (el.components?.sword) el.components.sword.nockOffset.copy(newOffset);
          });
        }
      }

      // --- ボタン判定 ---
      if (this._hitCooldown <= 0) {
        const sword = this._getSword();

        // メイン CALIB ON/OFF
        if (this._checkHit(this._btnCalib, 0.22)) {
          this._hitCooldown = 60;
          this.calibMode = !this.calibMode;

          if (!this.calibMode) {
            // CALIB OFF: NOCK CALIB も強制終了
            if (this.nockMode) {
              this.nockMode = false;
              this._hideRefBow();
              this._setBtnColor(this._btnNock, '#1a3a1a', '#88ff88');
            }
            if (sword) sword.setCalibrationMode(false);
            this._setBtnLabel(this._btnCalib, '[ CALIB: OFF ]', '#ffffff', '#333333');
          } else {
            if (sword) sword.setCalibrationMode(true);
            this._setBtnLabel(this._btnCalib, '[ CALIB: ON  ]', '#ff4444', '#441111');
          }
        }

        if (this.calibMode && sword) {
          // NOCK CALIB サブボタン トグル
          if (this._checkHit(this._btnNock, 0.18)) {
            this._hitCooldown = 45;
            this.nockMode = !this.nockMode;
            if (this.nockMode) {
              this._showRefBow();
              this._setBtnColor(this._btnNock, '#005500', '#aaffaa');
            } else {
              this._hideRefBow();
              this._setBtnColor(this._btnNock, '#1a3a1a', '#88ff88');
            }
          }

          // PITCH / YAW 90度ステップ
          const STEP = Math.PI / 2;
          if (this._checkHit(this._btnPitchUp, 0.13)) { this._hitCooldown = 35; sword.adjustShootPitch( STEP); }
          if (this._checkHit(this._btnPitchDn, 0.13)) { this._hitCooldown = 35; sword.adjustShootPitch(-STEP); }
          if (this._checkHit(this._btnYawL,    0.13)) { this._hitCooldown = 35; sword.adjustShootYaw(   STEP); }
          if (this._checkHit(this._btnYawR,    0.13)) { this._hitCooldown = 35; sword.adjustShootYaw(  -STEP); }
        }
      }

      // --- デバッグテキスト更新 ---
      const sword = this._getSword();
      const mode  = sword?.mode        ?? '?';
      const grab  = sword?.isGrabbingString ? 'YES' : 'no';
      const draw  = typeof sword?.drawProgress === 'number' ? sword.drawProgress.toFixed(2) : '?';
      const near  = sword?.isNearString?.() ? 'YES' : 'no';
      const other = sword?.otherHand ? `OK(${sword.otherHand.id})` : 'NULL';
      const last  = sword?.lastShootLog ?? '-';

      let calibLine = '';
      if (this.calibMode && sword) {
        const ag = sword.getShootAngles();
        calibLine += `\nPITCH:${(ag.pitch * 57.3).toFixed(1)}d YAW:${(ag.yaw * 57.3).toFixed(1)}d`;
        if (this.nockMode) {
          const o = sword.getNockOffset();
          calibLine += `\nOFS:${o.x.toFixed(3)} ${o.y.toFixed(3)} ${o.z.toFixed(3)}`;
          calibLine += `\nGRAB:${this._refGrabbing ? 'YES' : 'no'}`;
        }
      }

      const modeLabel = this.calibMode
        ? `CALIB ON${this.nockMode ? ' [NOCK]' : ''}${calibLine}`
        : 'CALIB OFF';

      const log = [
        `=== BOW DEBUG ===`,
        `mode:${mode} grab:${grab} draw:${draw}`,
        `near:${near} hand:${other}`,
        `last: ${last}`,
        modeLabel,
      ].join('\n');

      if (log !== this.lastLog) {
        if (this.textEl) this.textEl.setAttribute('value', log);
        this.lastLog = log;
      }
    },

    // ボタンのラベルと背景色を同時更新
    _setBtnLabel: function (btnEl: any, label: string, textColor: string, bgColor: string) {
      if (!btnEl) return;
      btnEl.setAttribute('color', bgColor);
      if ((btnEl as any)._labelEl) {
        (btnEl as any)._labelEl.setAttribute('value', label);
        (btnEl as any)._labelEl.setAttribute('color', textColor);
      }
    },

    // ボタンの背景色とテキスト色だけ更新
    _setBtnColor: function (btnEl: any, bgColor: string, textColor: string) {
      if (!btnEl) return;
      btnEl.setAttribute('color', bgColor);
      if ((btnEl as any)._labelEl) (btnEl as any)._labelEl.setAttribute('color', textColor);
    },

    _getSword: function () {
      const el = document.querySelector('[sword]') as any;
      return el?.components?.sword ?? null;
    }
  });
}

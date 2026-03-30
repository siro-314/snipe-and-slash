/**
 * 弓デバッグ＋位置調整パネル
 *
 * [CALIB] ボタン: 手/矢で触れると ON/OFF トグル
 *
 * CALIB ON 中:
 *   - 左手の弓エンティティをCALIBボタン前の固定座標に移動して固定
 *   - nockSphere を選択した軸方向にのみ動かせる
 *   - [AXIS:X] [AXIS:Y] [AXIS:Z] ボタンで操作軸を切替
 *   - グリップ握りながら上下/前後に動かす → 選択軸方向に nockOffset が変化
 *   - [PITCH+/-] [YAW+/-] ボタン: 矢の発射補正を 90度ステップで調整
 *   - デバッグパネルに OFFSET x,y,z / PITCH / YAW を数値表示
 * CALIB OFF 中:
 *   - 左手の弓を元の手の位置追従に戻す
 */
export function registerBowDebugComponent() {
  AFRAME.registerComponent('bow-debug', {

    init: function () {
      this.textEl       = null;
      this.lastLog      = '';
      this.calibMode    = false;
      this._hitCooldown = 0;

      // 操作軸: 'x' | 'y' | 'z'
      this.activeAxis = 'y';

      // グリップ中の手の追跡
      this._axisGrabbing     = false;
      this._axisGrabHand     = null;
      this._axisGrabLastPos  = new THREE.Vector3();
      this._axisGripHandlers = [];

      // 左手エンティティの元のposition属性値（CALIB OFFで復元）
      this._leftHandOrigPos = null;

      // ボタン参照
      this._btnCalib   = null;
      this._btnAxisX   = null;
      this._btnAxisY   = null;
      this._btnAxisZ   = null;
      this._btnPitchUp = null;
      this._btnPitchDn = null;
      this._btnYawL    = null;
      this._btnYawR    = null;
      this._btnRoot    = null;

      this._createUI();
    },

    // =========================================================
    //  UI構築
    // =========================================================
    _createUI: function () {
      const scene = document.querySelector('a-scene');

      // ボタン群ルート（プレイヤー前方 2m・高さ 1.4m）
      const btnRoot = document.createElement('a-entity');
      btnRoot.setAttribute('position', '0 1.4 -2');
      scene?.appendChild(btnRoot);
      this._btnRoot = btnRoot;

      // --- デバッグテキストパネル ---
      const panel = document.createElement('a-entity');
      panel.setAttribute('position', '0 0.78 0');
      btnRoot.appendChild(panel);

      const bg = document.createElement('a-plane');
      bg.setAttribute('width',   '0.72');
      bg.setAttribute('height',  '0.60');
      bg.setAttribute('color',   '#111111');
      bg.setAttribute('opacity', '0.9');
      panel.appendChild(bg);

      const text = document.createElement('a-text');
      text.setAttribute('value',      'BOW DEBUG\nLoading...');
      text.setAttribute('color',      '#00ff88');
      text.setAttribute('width',      '0.68');
      text.setAttribute('position',   '-0.34 0.27 0.01');
      text.setAttribute('anchor',     'left');
      text.setAttribute('baseline',   'top');
      text.setAttribute('wrap-count', '38');
      panel.appendChild(text);
      this.textEl = text;

      // --- メイン CALIB ボタン ---
      this._btnCalib = this._makeBtn(btnRoot, '[ CALIB: OFF ]', '#ffffff', '#333333', '0 0.25 0', 0.55, 0.14);

      // --- 軸選択ボタン ---
      this._btnAxisX = this._makeBtn(btnRoot, 'AXIS:X', '#ff8888', '#2a0000', '-0.28 -0.03 0', 0.16, 0.09);
      this._btnAxisY = this._makeBtn(btnRoot, 'AXIS:Y', '#88ff88', '#002a00', '    0 -0.03 0', 0.16, 0.09);
      this._btnAxisZ = this._makeBtn(btnRoot, 'AXIS:Z', '#8888ff', '#00002a', ' 0.28 -0.03 0', 0.16, 0.09);

      // --- PITCH / YAW 調整ボタン（90度ステップ） ---
      this._btnPitchUp = this._makeBtn(btnRoot, 'PITCH+', '#ffff88', '#2a2a00', '-0.20 -0.17 0', 0.20, 0.08);
      this._btnPitchDn = this._makeBtn(btnRoot, 'PITCH-', '#ffff88', '#2a2a00', '-0.20 -0.27 0', 0.20, 0.08);
      this._btnYawL    = this._makeBtn(btnRoot, 'YAW+',   '#88ffff', '#002a2a', ' 0.20 -0.17 0', 0.20, 0.08);
      this._btnYawR    = this._makeBtn(btnRoot, 'YAW-',   '#88ffff', '#002a2a', ' 0.20 -0.27 0', 0.20, 0.08);

      const hint = document.createElement('a-text');
      hint.setAttribute('value',    'Touch CALIB with hand or arrow');
      hint.setAttribute('color',    '#aaaaaa');
      hint.setAttribute('width',    '0.9');
      hint.setAttribute('align',    'center');
      hint.setAttribute('position', '0 0.10 0.01');
      btnRoot.appendChild(hint);

      // 初期軸ハイライト
      this._highlightAxis('y');
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

    // 軸ボタンのハイライト切替
    _highlightAxis: function (axis: string) {
      const map: Record<string, any> = {
        x: { btn: this._btnAxisX, activeBg: '#550000', activeText: '#ffaaaa', idleBg: '#2a0000', idleText: '#ff8888' },
        y: { btn: this._btnAxisY, activeBg: '#005500', activeText: '#aaffaa', idleBg: '#002a00', idleText: '#88ff88' },
        z: { btn: this._btnAxisZ, activeBg: '#000055', activeText: '#aaaaff', idleBg: '#00002a', idleText: '#8888ff' },
      };
      for (const [key, v] of Object.entries(map)) {
        const active = key === axis;
        if (v.btn) {
          v.btn.setAttribute('color', active ? v.activeBg : v.idleBg);
          if ((v.btn as any)._labelEl) (v.btn as any)._labelEl.setAttribute('color', active ? v.activeText : v.idleText);
        }
      }
    },

    // =========================================================
    //  当たり判定
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
    //  CALIB ON/OFF: 左手の弓を固定座標に毎フレーム強制移動
    // =========================================================
    _enterCalib: function () {
      // CALIBボタン（0 1.4 -2）の少し手前・やや低い位置
      const fixedPos = new THREE.Vector3(0, 1.2, -1.7);

      // 左手の sword コンポーネントに固定座標を渡す
      // sword の tick() が毎フレーム oculus-touch-controls に勝って上書きする
      document.querySelectorAll('[sword]').forEach((el: any) => {
        if (el.components?.sword) {
          el.components.sword.setCalibrationMode(true, fixedPos);
        }
      });

      // グリップイベント登録（軸方向操作）
      this._axisGripHandlers = [];
      ['leftHand', 'rightHand'].forEach((id: string) => {
        const handEl = document.getElementById(id);
        if (!handEl) return;
        const onGripDown = () => {
          if (!this.calibMode) return;
          this._axisGrabbing    = true;
          this._axisGrabHand    = handEl;
          this._axisGrabLastPos.copy((handEl as any).object3D.getWorldPosition(new THREE.Vector3()));
        };
        const onGripUp = () => {
          if (this._axisGrabHand === handEl) {
            this._axisGrabbing = false;
            this._axisGrabHand = null;
          }
        };
        handEl.addEventListener('gripdown', onGripDown);
        handEl.addEventListener('gripup',   onGripUp);
        this._axisGripHandlers.push({ handEl, onGripDown, onGripUp });
      });
    },

    _exitCalib: function () {
      // グリップイベント解除
      this._axisGripHandlers.forEach(({ handEl, onGripDown, onGripUp }: any) => {
        handEl.removeEventListener('gripdown', onGripDown);
        handEl.removeEventListener('gripup',   onGripUp);
      });
      this._axisGripHandlers = [];
      this._axisGrabbing = false;
      this._axisGrabHand = null;

      // sword の固定解除（null を渡す）
      document.querySelectorAll('[sword]').forEach((el: any) => {
        if (el.components?.sword) {
          el.components.sword.setCalibrationMode(false);
        }
      });
    },

    // =========================================================
    //  tick
    // =========================================================
    tick: function () {
      if (this._hitCooldown > 0) { this._hitCooldown--; }

      // --- 軸方向操作: グリップ中の手の動きを選択軸にのみ反映 ---
      if (this.calibMode && this._axisGrabbing && this._axisGrabHand) {
        const curPos  = (this._axisGrabHand as any).object3D.getWorldPosition(new THREE.Vector3());
        const delta   = curPos.clone().sub(this._axisGrabLastPos);
        this._axisGrabLastPos.copy(curPos);

        // 選択軸方向の移動量のみ抽出（感度 1.5倍）
        const sensitivity = 1.5;
        let axisDelta = 0;
        if      (this.activeAxis === 'x') axisDelta = delta.x * sensitivity;
        else if (this.activeAxis === 'y') axisDelta = delta.y * sensitivity;
        else if (this.activeAxis === 'z') axisDelta = delta.z * sensitivity;

        // 全 sword の nockOffset に反映
        document.querySelectorAll('[sword]').forEach((el: any) => {
          if (!el.components?.sword) return;
          const o = el.components.sword.nockOffset;
          if      (this.activeAxis === 'x') o.x += axisDelta;
          else if (this.activeAxis === 'y') o.y += axisDelta;
          else if (this.activeAxis === 'z') o.z += axisDelta;
        });
      }

      // --- ボタン判定 ---
      if (this._hitCooldown <= 0) {
        const sword = this._getSword();

        // メイン CALIB ON/OFF
        if (this._checkHit(this._btnCalib, 0.22)) {
          this._hitCooldown = 60;
          this.calibMode = !this.calibMode;

          if (this.calibMode) {
            this._enterCalib();
            this._setBtnLabel(this._btnCalib, '[ CALIB: ON  ]', '#ff4444', '#441111');
          } else {
            this._exitCalib();
            this._setBtnLabel(this._btnCalib, '[ CALIB: OFF ]', '#ffffff', '#333333');
          }
        }

        if (this.calibMode) {
          // 軸選択ボタン
          if (this._checkHit(this._btnAxisX, 0.13)) { this._hitCooldown = 30; this.activeAxis = 'x'; this._highlightAxis('x'); }
          if (this._checkHit(this._btnAxisY, 0.13)) { this._hitCooldown = 30; this.activeAxis = 'y'; this._highlightAxis('y'); }
          if (this._checkHit(this._btnAxisZ, 0.13)) { this._hitCooldown = 30; this.activeAxis = 'z'; this._highlightAxis('z'); }

          // PITCH / YAW 90度ステップ
          if (sword) {
            const STEP = Math.PI / 2;
            if (this._checkHit(this._btnPitchUp, 0.13)) { this._hitCooldown = 35; sword.adjustShootPitch( STEP); }
            if (this._checkHit(this._btnPitchDn, 0.13)) { this._hitCooldown = 35; sword.adjustShootPitch(-STEP); }
            if (this._checkHit(this._btnYawL,    0.13)) { this._hitCooldown = 35; sword.adjustShootYaw(   STEP); }
            if (this._checkHit(this._btnYawR,    0.13)) { this._hitCooldown = 35; sword.adjustShootYaw(  -STEP); }
          }
        }
      }

      // --- デバッグテキスト更新 ---
      const sword = this._getSword();
      const mode  = sword?.mode ?? '?';
      const grab  = sword?.isGrabbingString ? 'YES' : 'no';
      const draw  = typeof sword?.drawProgress === 'number' ? sword.drawProgress.toFixed(2) : '?';
      const near  = sword?.isNearString?.() ? 'YES' : 'no';
      const other = sword?.otherHand ? `OK(${sword.otherHand.id})` : 'NULL';
      const last  = sword?.lastShootLog ?? '-';

      let calibLine = '';
      if (this.calibMode && sword) {
        const o  = sword.getNockOffset();
        const ag = sword.getShootAngles();
        calibLine  = `\nAXIS:[${this.activeAxis.toUpperCase()}] grip:${this._axisGrabbing ? 'YES' : 'no'}`;
        calibLine += `\nOFS X:${o.x.toFixed(3)} Y:${o.y.toFixed(3)} Z:${o.z.toFixed(3)}`;
        calibLine += `\nPITCH:${(ag.pitch * 57.3).toFixed(1)}d YAW:${(ag.yaw * 57.3).toFixed(1)}d`;
      }

      const log = [
        `=== BOW DEBUG ===`,
        `mode:${mode} grab:${grab} draw:${draw}`,
        `near:${near} hand:${other}`,
        `last: ${last}`,
        this.calibMode ? `CALIB ON${calibLine}` : `CALIB OFF`,
      ].join('\n');

      if (log !== this.lastLog) {
        if (this.textEl) this.textEl.setAttribute('value', log);
        this.lastLog = log;
      }
    },

    _setBtnLabel: function (btnEl: any, label: string, textColor: string, bgColor: string) {
      if (!btnEl) return;
      btnEl.setAttribute('color', bgColor);
      if ((btnEl as any)._labelEl) {
        (btnEl as any)._labelEl.setAttribute('value', label);
        (btnEl as any)._labelEl.setAttribute('color', textColor);
      }
    },

    _getSword: function () {
      const el = document.querySelector('[sword]') as any;
      return el?.components?.sword ?? null;
    }
  });
}

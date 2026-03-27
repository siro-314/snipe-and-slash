/**
 * 弓デバッグ＋位置調整パネル（シーン固定・目立つ白ボタン）
 *
 * CALIBボタン: 剣で叩くか矢を当てると ON/OFF トグル
 * CALIB ON中:
 *   - シーン内に「参照弓（固定座標）」が出現
 *   - 参照弓のnockSphere（緑の球）をグリップで掴んで動かす
 *   - 動かした結果（オフセット）が手元の弓にも即時反映される
 *   - PITCH↑/↓, YAW←/→ ボタンを手で触れて矢の発射方向を補正
 * デバッグテキスト: CALIBボタン上部に固定表示（カメラ追従なし）
 */
export function registerBowDebugComponent() {
  AFRAME.registerComponent('bow-debug', {

    init: function () {
      this.textEl = null;
      this.lastLog = '';
      this.calibMode = false;
      this._hitCooldown = 0;

      // ボタン参照
      this._btnCalib   = null;
      this._btnPitchUp = null;
      this._btnPitchDn = null;
      this._btnYawL    = null;
      this._btnYawR    = null;
      this._btnRoot    = null;

      // 参照弓（CALIBモードで表示する固定座標のプロキシ弓）
      this._refBowRoot = null;
      this._refNockSphere = null;
      this._refCalibGrabbing = false;
      this._refCalibGrabOffset = new THREE.Vector3();

      this._createUI();
    },

    _createUI: function () {
      const scene = document.querySelector('a-scene');

      // ===== 操作ボタン群（シーン内固定・プレイヤー前方2m・高さ1.4m） =====
      const btnRoot = document.createElement('a-entity');
      btnRoot.setAttribute('position', '0 1.4 -2');
      scene?.appendChild(btnRoot);
      this._btnRoot = btnRoot;

      // --- デバッグテキストパネル（CALIBボタン上部に固定） ---
      const panel = document.createElement('a-entity');
      panel.setAttribute('position', '0 0.72 0');
      btnRoot.appendChild(panel);

      const bg = document.createElement('a-plane');
      bg.setAttribute('width', '0.72');
      bg.setAttribute('height', '0.50');
      bg.setAttribute('color', '#111111');
      bg.setAttribute('opacity', '0.9');
      panel.appendChild(bg);

      const text = document.createElement('a-text');
      text.setAttribute('value', 'BOW DEBUG\nLoading...');
      text.setAttribute('color', '#00ff88');
      text.setAttribute('width', '0.68');
      text.setAttribute('position', '-0.34 0.22 0.01');
      text.setAttribute('anchor', 'left');
      text.setAttribute('baseline', 'top');
      text.setAttribute('wrap-count', '38');
      panel.appendChild(text);
      this.textEl = text;

      // --- CALIB ON/OFF ボタン（大・白） ---
      this._btnCalib = this._makeBtn(btnRoot, '[ CALIB: OFF ]', '#ffffff', '#333333', '0 0.25 0', 0.55, 0.14);

      // --- PITCH / YAW 調整ボタン ---
      this._btnPitchUp = this._makeBtn(btnRoot, 'PITCH +', '#ffff88', '#333333', '-0.32 -0.05 0', 0.22, 0.10);
      this._btnPitchDn = this._makeBtn(btnRoot, 'PITCH -', '#ffff88', '#333333', '-0.32 -0.18 0', 0.22, 0.10);
      this._btnYawL    = this._makeBtn(btnRoot, 'YAW  +', '#88ffff', '#333333', ' 0.32 -0.05 0', 0.22, 0.10);
      this._btnYawR    = this._makeBtn(btnRoot, 'YAW  -', '#88ffff', '#333333', ' 0.32 -0.18 0', 0.22, 0.10);

      // ヒントラベル
      const hint = document.createElement('a-text');
      hint.setAttribute('value', 'Touch CALIB with hand or arrow to toggle');
      hint.setAttribute('color', '#aaaaaa');
      hint.setAttribute('width', '0.9');
      hint.setAttribute('align', 'center');
      hint.setAttribute('position', '0 0.10 0.01');
      btnRoot.appendChild(hint);
    },

    _makeBtn: function (parent: any, label: string, textColor: string, bgColor: string, pos: string, w: number, h: number) {
      const box = document.createElement('a-box');
      box.setAttribute('width',  String(w));
      box.setAttribute('height', String(h));
      box.setAttribute('depth',  '0.06');
      box.setAttribute('color',  bgColor);
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

    // ボタン当たり判定（両手コントローラー位置 or 矢）
    _checkHit: function (btnEl: any, radius: number): boolean {
      if (!btnEl) return false;
      const btnPos = new THREE.Vector3();
      btnEl.object3D.getWorldPosition(btnPos);

      const handIds = ['leftHand', 'rightHand'];
      for (const id of handIds) {
        const el = document.getElementById(id) as any;
        if (el) {
          const hp = el.object3D.getWorldPosition(new THREE.Vector3());
          if (hp.distanceTo(btnPos) < radius) return true;
        }
      }

      const arrows = document.querySelectorAll('[player-arrow]');
      for (let i = 0; i < arrows.length; i++) {
        const ap = (arrows[i] as any).object3D.getWorldPosition(new THREE.Vector3());
        if (ap.distanceTo(btnPos) < radius) return true;
      }
      return false;
    },

    // === 参照弓 (CALIB用プロキシ) ===
    // CALIBモード開始時にシーン内の固定位置に表示する弓のコピー。
    // ここのnockSphereをグリップで動かすと手元の弓に即反映される。
    _showRefBow: function () {
      const scene = document.querySelector('a-scene');
      if (this._refBowRoot) return; // 既にある場合はスキップ

      const root = document.createElement('a-entity');
      // 参照弓はプレイヤー前方1.5m・高さ1.2m・左寄りに固定表示
      root.setAttribute('position', '-0.8 1.2 -1.5');
      scene?.appendChild(root);
      this._refBowRoot = root;

      // 外枠ラベル
      const label = document.createElement('a-text');
      label.setAttribute('value', 'CALIB REF BOW\nGrab green sphere to adjust grip');
      label.setAttribute('color', '#ffff00');
      label.setAttribute('width', '0.9');
      label.setAttribute('align', 'center');
      label.setAttribute('position', '0 0.3 0');
      root.appendChild(label);

      // nockSphere (grip position indicator)
      const sphereGeo = new THREE.SphereGeometry(0.06, 12, 8);
      const sphereMat = new THREE.MeshBasicMaterial({
        color: 0x00ff00, transparent: true, opacity: 0.7, wireframe: true
      });
      this._refNockSphere = new THREE.Mesh(sphereGeo, sphereMat);

      // 手元の弓のnockOffsetを初期位置として設定
      const sword = this._getSword();
      const initOffset = sword ? sword.getNockOffset() : new THREE.Vector3();
      this._refNockSphere.position.copy(initOffset);

      scene?.object3D.add(this._refNockSphere);

      // 参照弓のリスナー（両手のグリップで球を掴む）
      this._refGripHandlers = [];
      ['leftHand', 'rightHand'].forEach((id: string) => {
        const handEl = document.getElementById(id);
        if (!handEl) return;

        const onGripDown = () => {
          if (!this.calibMode) return;
          const handPos = (handEl as any).object3D.getWorldPosition(new THREE.Vector3());
          const spherePos = new THREE.Vector3();
          this._refNockSphere.getWorldPosition(spherePos);
          if (handPos.distanceTo(spherePos) < 0.2) {
            this._refCalibGrabbing = true;
            this._activeGrabHand = handEl;
            this._refCalibGrabOffset.subVectors(spherePos, handPos);
          }
        };
        const onGripUp = () => {
          if (this._activeGrabHand === handEl) {
            this._refCalibGrabbing = false;
            this._activeGrabHand = null;
          }
        };
        handEl.addEventListener('gripdown', onGripDown);
        handEl.addEventListener('gripup', onGripUp);
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
      // イベントリスナー解除
      if (this._refGripHandlers) {
        this._refGripHandlers.forEach(({ handEl, onGripDown, onGripUp }: any) => {
          handEl.removeEventListener('gripdown', onGripDown);
          handEl.removeEventListener('gripup', onGripUp);
        });
        this._refGripHandlers = [];
      }
      this._refCalibGrabbing = false;
      this._activeGrabHand = null;
    },


    tick: function () {
      if (this._hitCooldown > 0) { this._hitCooldown--; }

      // 参照弓のnockSphereを手で動かす処理
      if (this.calibMode && this._refCalibGrabbing && this._activeGrabHand && this._refNockSphere) {
        const handPos = this._activeGrabHand.object3D.getWorldPosition(new THREE.Vector3());
        const newSphereWorld = handPos.clone().add(this._refCalibGrabOffset);

        // 参照弓の球を移動
        // ワールド座標 → refBowRoot のローカル座標に変換
        const refRootInvMatrix = new THREE.Matrix4();
        refRootInvMatrix.copy(this._refBowRoot.object3D.matrixWorld).invert();
        const localPos = newSphereWorld.clone().applyMatrix4(refRootInvMatrix);
        this._refNockSphere.position.copy(newSphereWorld); // ワールドに直接配置してる

        // 手元の弓のnockOffsetに反映（参照弓のオフセットをそのまま渡す）
        const sword = this._getSword();
        if (sword) {
          if (sword.string) {
            const base = new THREE.Vector3();
            sword.string.getWorldPosition(base);
            sword.nockOffset.subVectors(newSphereWorld, base);
          } else {
            sword.nockOffset.copy(localPos);
          }
        }
      }

      // ボタン判定（クールダウン中はスキップ）
      if (this._hitCooldown <= 0) {
        const sword = this._getSword();

        // CALIBボタン
        if (this._checkHit(this._btnCalib, 0.22)) {
          this._hitCooldown = 60;
          this.calibMode = !this.calibMode;
          if (sword) sword.setCalibrationMode(this.calibMode);

          if (this.calibMode) {
            this._showRefBow();
          } else {
            this._hideRefBow();
          }

          const lbl = this.calibMode ? '[ CALIB: ON  ]' : '[ CALIB: OFF ]';
          const col = this.calibMode ? '#ff4444' : '#ffffff';
          if (this._btnCalib) this._btnCalib.setAttribute('color', this.calibMode ? '#441111' : '#333333');
          if ((this._btnCalib as any)?._labelEl) {
            (this._btnCalib as any)._labelEl.setAttribute('value', lbl);
            (this._btnCalib as any)._labelEl.setAttribute('color', col);
          }
        }

        // 方向補正ボタン（CALIB ONのみ）
        const STEP = Math.PI / 2; // 90度
        if (this.calibMode && sword) {
          if (this._checkHit(this._btnPitchUp, 0.15)) { this._hitCooldown = 30; sword.adjustShootPitch( STEP); }
          if (this._checkHit(this._btnPitchDn, 0.15)) { this._hitCooldown = 30; sword.adjustShootPitch(-STEP); }
          if (this._checkHit(this._btnYawL,    0.15)) { this._hitCooldown = 30; sword.adjustShootYaw(   STEP); }
          if (this._checkHit(this._btnYawR,    0.15)) { this._hitCooldown = 30; sword.adjustShootYaw(  -STEP); }
        }
      }

      // テキスト更新
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
        calibLine  = `\nOFFSET:${o.x.toFixed(3)},${o.y.toFixed(3)},${o.z.toFixed(3)}`;
        calibLine += `\nPITCH:${(ag.pitch * 57.3).toFixed(1)}deg YAW:${(ag.yaw * 57.3).toFixed(1)}deg`;
        calibLine += `\nGRAB:${this._refCalibGrabbing ? 'YES' : 'no'}`;
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

    _getSword: function () {
      const el = document.querySelector('[sword]') as any;
      return el?.components?.sword ?? null;
    }
  });
}

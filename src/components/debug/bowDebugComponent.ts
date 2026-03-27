/**
 * 弓デバッグ＋位置調整パネル（シーン固定・目立つ白ボタン）
 *
 * CALIBボタン: 剣で斬るか矢を当てると ON/OFF トグル
 * CALIB ON中:
 *   - 緑の球をグリップで掴んで動かす → 握り判定位置を調整
 *   - PITCH↑/↓, YAW←/→ ボタンを剣で叩く → 矢の発射方向を補正
 * ボタンはシーン内の固定位置（プレイヤー正面2m前, 高さ1.5m）に配置
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

      this._createUI();
    },

    _createUI: function () {
      const scene = document.querySelector('a-scene');

      // ===== デバッグテキストパネル (カメラ追従) =====
      const panel = document.createElement('a-entity');
      panel.setAttribute('position', '0 0.05 -0.7');

      const bg = document.createElement('a-plane');
      bg.setAttribute('width', '0.72');
      bg.setAttribute('height', '0.46');
      bg.setAttribute('color', '#111111');
      bg.setAttribute('opacity', '0.9');
      panel.appendChild(bg);

      const text = document.createElement('a-text');
      text.setAttribute('value', 'BOW DEBUG\nLoading...');
      text.setAttribute('color', '#00ff88');
      text.setAttribute('width', '0.68');
      text.setAttribute('position', '-0.34 0.20 0.01');
      text.setAttribute('anchor', 'left');
      text.setAttribute('baseline', 'top');
      text.setAttribute('wrap-count', '38');
      panel.appendChild(text);
      this.textEl = text;
      // カメラに付ける（index.htmlのcameraエンティティに追加）
      document.querySelector('[camera]')?.appendChild(panel);

      // ===== 操作ボタン群（シーン内固定・プレイヤー前方2mの壁面） =====
      // 剣で叩くかゲーム開始前に位置確認しやすいよう、高さ1.4m付近に配置
      const btnRoot = document.createElement('a-entity');
      btnRoot.setAttribute('position', '0 1.4 -2');
      scene?.appendChild(btnRoot);
      this._btnRoot = btnRoot;

      // --- CALIB ON/OFF ボタン（大・白） ---
      this._btnCalib = this._makeBtn(btnRoot, '[ CALIB: OFF ]', '#ffffff', '#333333', '0 0.25 0', 0.55, 0.14);

      // --- PITCH / YAW 調整ボタン（CALIB ON時のみ有効） ---
      this._btnPitchUp = this._makeBtn(btnRoot, 'PITCH +', '#ffff88', '#333333', '-0.32 -0.05 0', 0.22, 0.10);
      this._btnPitchDn = this._makeBtn(btnRoot, 'PITCH -', '#ffff88', '#333333', '-0.32 -0.18 0', 0.22, 0.10);
      this._btnYawL    = this._makeBtn(btnRoot, 'YAW  +', '#88ffff', '#333333', ' 0.32 -0.05 0', 0.22, 0.10);
      this._btnYawR    = this._makeBtn(btnRoot, 'YAW  -', '#88ffff', '#333333', ' 0.32 -0.18 0', 0.22, 0.10);

      // ヒントラベル
      const hint = document.createElement('a-text');
      hint.setAttribute('value', 'Slash with sword or hit with arrow to toggle CALIB');
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
      // posをパースしてZ+0.04
      const p = pos.trim().split(/\s+/).map(Number);
      txt.setAttribute('position', `${p[0]} ${p[1]} ${(p[2] ?? 0) + 0.04}`);
      parent.appendChild(txt);

      (box as any)._labelEl = txt;
      return box;
    },

    _checkHit: function (btnEl: any, radius: number): boolean {
      if (!btnEl) return false;
      const btnPos = new THREE.Vector3();
      btnEl.object3D.getWorldPosition(btnPos);

      // 剣で斬る
      const swordEl = document.querySelector('[sword]') as any;
      if (swordEl) {
        const sp = swordEl.object3D.getWorldPosition(new THREE.Vector3());
        if (sp.distanceTo(btnPos) < radius) return true;
      }
      // 矢を当てる
      let hit = false;
      document.querySelectorAll('[player-arrow]').forEach((a: any) => {
        const ap = a.object3D.getWorldPosition(new THREE.Vector3());
        if (ap.distanceTo(btnPos) < radius) hit = true;
      });
      return hit;
    },

    tick: function () {
      if (this._hitCooldown > 0) { this._hitCooldown--; return; }

      const sword = this._getSword();

      // CALIBボタン
      if (this._checkHit(this._btnCalib, 0.2)) {
        this._hitCooldown = 60;
        this.calibMode = !this.calibMode;
        if (sword) sword.setCalibrationMode(this.calibMode);
        const lbl = this.calibMode ? '[ CALIB: ON  ]' : '[ CALIB: OFF ]';
        const col = this.calibMode ? '#ff4444' : '#ffffff';
        if (this._btnCalib) this._btnCalib.setAttribute('color', this.calibMode ? '#441111' : '#333333');
        if ((this._btnCalib as any)?._labelEl) {
          (this._btnCalib as any)._labelEl.setAttribute('value', lbl);
          (this._btnCalib as any)._labelEl.setAttribute('color', col);
        }
      }

      // 方向補正ボタン（CALIB ONのみ）
      const STEP = 0.05; // 約3度
      if (this.calibMode && sword) {
        if (this._checkHit(this._btnPitchUp, 0.15)) { this._hitCooldown = 30; sword.adjustShootPitch( STEP); }
        if (this._checkHit(this._btnPitchDn, 0.15)) { this._hitCooldown = 30; sword.adjustShootPitch(-STEP); }
        if (this._checkHit(this._btnYawL,    0.15)) { this._hitCooldown = 30; sword.adjustShootYaw(   STEP); }
        if (this._checkHit(this._btnYawR,    0.15)) { this._hitCooldown = 30; sword.adjustShootYaw(  -STEP); }
      }

      // テキスト更新
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

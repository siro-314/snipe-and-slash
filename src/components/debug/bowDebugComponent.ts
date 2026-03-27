/**
 * 弓デバッグ＋位置調整パネル
 *
 * CALIBRATEボタンは「剣で斬る」か「矢を当てる」で切替
 * レイキャスト不要 - ゲーム中と同じ操作で使える
 */
export function registerBowDebugComponent() {
  AFRAME.registerComponent('bow-debug', {

    init: function () {
      this.textEl = null;
      this.lastLog = '';
      this.calibMode = false;
      this._btnEl = null;
      this._hitCooldown = 0;
      this._createPanel();
    },

    _createPanel: function () {
      const panel = document.createElement('a-entity');
      panel.setAttribute('position', '0 0.05 -0.7');

      const bg = document.createElement('a-plane');
      bg.setAttribute('width', '0.72');
      bg.setAttribute('height', '0.52');
      bg.setAttribute('color', '#111111');
      bg.setAttribute('opacity', '0.88');
      panel.appendChild(bg);

      const text = document.createElement('a-text');
      text.setAttribute('value', 'BOW DEBUG\nLoading...');
      text.setAttribute('color', '#00ff88');
      text.setAttribute('width', '0.66');
      text.setAttribute('position', '-0.34 0.22 0.01');
      text.setAttribute('anchor', 'left');
      text.setAttribute('baseline', 'top');
      text.setAttribute('wrap-count', '36');
      panel.appendChild(text);
      this.textEl = text;

      // ボタン本体（a-box: 剣で斬るか矢を当てると反応する）
      const btn = document.createElement('a-box');
      btn.setAttribute('width', '0.34');
      btn.setAttribute('height', '0.08');
      btn.setAttribute('depth', '0.04');
      btn.setAttribute('color', '#004400');
      btn.setAttribute('position', '0 -0.21 0.01');
      panel.appendChild(btn);
      this._btnEl = btn;

      const btnLabel = document.createElement('a-text');
      btnLabel.setAttribute('value', '[ CALIB: OFF ]');
      btnLabel.setAttribute('color', '#aaffaa');
      btnLabel.setAttribute('width', '0.32');
      btnLabel.setAttribute('align', 'center');
      btnLabel.setAttribute('position', '0 -0.21 0.04');
      panel.appendChild(btnLabel);
      this._btnLabel = btnLabel;

      // ヒント
      const hint = document.createElement('a-text');
      hint.setAttribute('value', 'Slash/shoot btn to toggle');
      hint.setAttribute('color', '#888888');
      hint.setAttribute('width', '0.32');
      hint.setAttribute('align', 'center');
      hint.setAttribute('position', '0 -0.255 0.01');
      panel.appendChild(hint);

      document.querySelector('a-scene')?.appendChild(panel);
      this.panel = panel;
    },

    // 剣or矢がボタンに当たったか判定（tick内から呼ぶ）
    _checkButtonHit: function () {
      if (!this._btnEl || this._hitCooldown > 0) return;

      const btnPos = new THREE.Vector3();
      this._btnEl.object3D.getWorldPosition(btnPos);
      const hitRadius = 0.12;

      // 剣の当たり判定
      const swordEl = document.querySelector('[sword]') as any;
      if (swordEl) {
        const swordPos = swordEl.object3D.getWorldPosition(new THREE.Vector3());
        if (swordPos.distanceTo(btnPos) < hitRadius) {
          this._triggerToggle();
          return;
        }
      }

      // 矢（player-arrow）の当たり判定
      document.querySelectorAll('[player-arrow]').forEach((arrowEl: any) => {
        if (this._hitCooldown > 0) return;
        const arrowPos = arrowEl.object3D.getWorldPosition(new THREE.Vector3());
        if (arrowPos.distanceTo(btnPos) < hitRadius) {
          this._triggerToggle();
        }
      });
    },

    _triggerToggle: function () {
      this._hitCooldown = 60; // 約1秒間は再トリガーしない
      this.calibMode = !this.calibMode;

      const sword = this._getSword();
      if (sword) sword.setCalibrationMode(this.calibMode);

      const onColor  = '#440000';
      const offColor = '#004400';
      if (this._btnEl) this._btnEl.setAttribute('color', this.calibMode ? onColor : offColor);
      if (this._btnLabel) this._btnLabel.setAttribute(
        'value', this.calibMode ? '[ CALIB: ON  ]' : '[ CALIB: OFF ]'
      );
      if (this._btnLabel) this._btnLabel.setAttribute(
        'color', this.calibMode ? '#ffaaaa' : '#aaffaa'
      );
    },

    _getSword: function () {
      const swordEl = document.querySelector('[sword]') as any;
      return swordEl?.components?.sword ?? null;
    },

    tick: function () {
      if (this._hitCooldown > 0) this._hitCooldown--;
      this._checkButtonHit();

      const sword = this._getSword();
      const mode  = sword?.mode ?? '?';
      const grab  = sword?.isGrabbingString ? 'YES' : 'no';
      const draw  = typeof sword?.drawProgress === 'number' ? sword.drawProgress.toFixed(2) : '?';
      const near  = sword?.isNearString?.() ? 'YES' : 'no';
      const other = sword?.otherHand ? `OK(${sword.otherHand.id})` : 'NULL';
      const calib = this.calibMode ? 'ON ' : 'OFF';

      let offsetLine = '(slash/shoot button to calibrate)';
      if (this.calibMode && sword) {
        const o = sword.getNockOffset();
        offsetLine = `OFFSET:${o.x.toFixed(3)},${o.y.toFixed(3)},${o.z.toFixed(3)}`;
        const np = sword._getNockWorldPos?.();
        if (np) offsetLine += `\nWORLD:${np.x.toFixed(2)},${np.y.toFixed(2)},${np.z.toFixed(2)}`;
      }

      const log = [
        `=== BOW DEBUG ===`,
        `mode:${mode} grab:${grab} draw:${draw}`,
        `near:${near} otherHand:${other}`,
        `calib:${calib}`,
        offsetLine,
      ].join('\n');

      if (log !== this.lastLog) {
        if (this.textEl) this.textEl.setAttribute('value', log);
        this.lastLog = log;
      }
    }
  });
}

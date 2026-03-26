/**
 * 弓デバッグ＋位置調整パネル
 *
 * 通常表示: 弓の状態をリアルタイム表示
 * 位置調整モード: 握り判定球をグリップで動かして正しい位置を決める
 *   → 座標をパネルに表示 → ユーザーが読んで伝えればコードに固定可能
 */
export function registerBowDebugComponent() {
  AFRAME.registerComponent('bow-debug', {

    init: function () {
      this.textEl = null;
      this.lastLog = '';
      this.calibMode = false;
      this._btnEl = null;
      this._createPanel();
    },

    _createPanel: function () {
      // パネル本体（カメラ子要素として視野内に固定）
      const panel = document.createElement('a-entity');
      panel.setAttribute('position', '0 0.05 -0.7');

      const bg = document.createElement('a-plane');
      bg.setAttribute('width', '0.72');
      bg.setAttribute('height', '0.48');
      bg.setAttribute('color', '#111111');
      bg.setAttribute('opacity', '0.88');
      panel.appendChild(bg);

      const text = document.createElement('a-text');
      text.setAttribute('value', 'BOW DEBUG\nLoading...');
      text.setAttribute('color', '#00ff88');
      text.setAttribute('width', '0.66');
      text.setAttribute('position', '-0.34 0.20 0.01');
      text.setAttribute('anchor', 'left');
      text.setAttribute('baseline', 'top');
      text.setAttribute('wrap-count', '36');
      panel.appendChild(text);
      this.textEl = text;

      // 位置調整モード ON/OFF ボタン（a-box + ラベル）
      const btn = document.createElement('a-box');
      btn.setAttribute('width', '0.28');
      btn.setAttribute('height', '0.07');
      btn.setAttribute('depth', '0.01');
      btn.setAttribute('color', '#005500');
      btn.setAttribute('position', '0 -0.19 0.01');
      btn.setAttribute('data-raycastable', '');
      btn.addEventListener('click', () => this._toggleCalib());
      panel.appendChild(btn);
      this._btnEl = btn;

      const btnLabel = document.createElement('a-text');
      btnLabel.setAttribute('value', '[CALIBRATE OFF]');
      btnLabel.setAttribute('color', '#ffffff');
      btnLabel.setAttribute('width', '0.26');
      btnLabel.setAttribute('align', 'center');
      btnLabel.setAttribute('position', '0 -0.19 0.02');
      panel.appendChild(btnLabel);
      this._btnLabel = btnLabel;

      document.querySelector('a-scene')?.appendChild(panel);
      this.panel = panel;
    },

    _toggleCalib: function () {
      this.calibMode = !this.calibMode;
      const sword = this._getSword();
      if (sword) sword.setCalibrationMode(this.calibMode);

      if (this._btnEl) this._btnEl.setAttribute('color', this.calibMode ? '#550000' : '#005500');
      if (this._btnLabel) this._btnLabel.setAttribute('value', this.calibMode ? '[CALIBRATE ON]' : '[CALIBRATE OFF]');
    },

    _getSword: function () {
      const swordEl = document.querySelector('[sword]') as any;
      return swordEl?.components?.sword ?? null;
    },

    tick: function () {
      const sword = this._getSword();

      const mode     = sword?.mode ?? '?';
      const grab     = sword?.isGrabbingString ? 'YES' : 'no';
      const draw     = typeof sword?.drawProgress === 'number' ? sword.drawProgress.toFixed(2) : '?';
      const near     = sword?.isNearString?.() ? 'YES' : 'no';
      const other    = sword?.otherHand ? `OK(${sword.otherHand.id})` : 'NULL';
      const strMesh  = sword?.string ? 'OK' : 'NULL';
      const calib    = this.calibMode ? 'ON' : 'OFF';

      // 位置調整モード中は nockOffset をわかりやすく表示
      let offsetLine = '';
      if (this.calibMode && sword) {
        const o = sword.getNockOffset();
        offsetLine = `\nOFFSET: ${o.x.toFixed(3)}, ${o.y.toFixed(3)}, ${o.z.toFixed(3)}`;
        const nockPos = sword._getNockWorldPos?.();
        if (nockPos) {
          offsetLine += `\nNOCK_WORLD: ${nockPos.x.toFixed(2)}, ${nockPos.y.toFixed(2)}, ${nockPos.z.toFixed(2)}`;
        }
      }

      const log = [
        `=== BOW DEBUG ===`,
        `mode:${mode} grab:${grab} draw:${draw}`,
        `near:${near} otherHand:${other}`,
        `string:${strMesh} calib:${calib}`,
        offsetLine ? offsetLine.trim() : '(grip sphere to calibrate)',
      ].join('\n');

      if (log !== this.lastLog) {
        if (this.textEl) this.textEl.setAttribute('value', log);
        this.lastLog = log;
      }
    }
  });
}

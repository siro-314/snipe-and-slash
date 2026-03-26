/**
 * 弓デバッグコンポーネント
 * VR空間内にリアルタイムで弓の状態を表示する
 *
 * 表示情報:
 *   - mode: sword / bow
 *   - isGrabbingString: 弦を掴んでいるか
 *   - drawProgress: 引き量 (0.0 ~ 1.0)
 *   - grip押下/離しカウント
 *   - shoot発射カウント
 */
export function registerBowDebugComponent() {
  AFRAME.registerComponent('bow-debug', {

    init: function () {
      this.textEl = null;
      this.lastLog = '';
      this.shootCount = 0;
      this.gripDownCount = 0;
      this.gripUpCount = 0;
      this._shootPatched = false;

      this._createPanel();
      this._listenGrip();
    },

    // カメラ前方にデバッグパネルを生成
    _createPanel: function () {
      const panel = document.createElement('a-entity');
      panel.setAttribute('position', '0 1.6 -0.7');

      const bg = document.createElement('a-plane');
      bg.setAttribute('width', '0.55');
      bg.setAttribute('height', '0.32');
      bg.setAttribute('color', '#111111');
      bg.setAttribute('opacity', '0.85');
      panel.appendChild(bg);

      const text = document.createElement('a-text');
      text.setAttribute('value', 'BOW DEBUG\nLoading...');
      text.setAttribute('color', '#00ff88');
      text.setAttribute('width', '0.5');
      text.setAttribute('position', '-0.25 0.12 0.01');
      text.setAttribute('anchor', 'left');
      text.setAttribute('baseline', 'top');
      text.setAttribute('wrap-count', '28');
      panel.appendChild(text);

      this.textEl = text;
      document.querySelector('a-scene')?.appendChild(panel);
      this.panel = panel;
    },


    // leftHandのgripイベントを直接カウント
    _listenGrip: function () {
      const left = document.getElementById('leftHand');
      if (left) {
        left.addEventListener('gripdown', () => { this.gripDownCount++; });
        left.addEventListener('gripup',   () => { this.gripUpCount++;   });
      }
    },

    // swordのshoot()をパッチしてカウント
    _patchShoot: function (sword: any) {
      if (this._shootPatched) return;
      const orig = sword.shoot.bind(sword);
      sword.shoot = () => {
        this.shootCount++;
        orig();
      };
      this._shootPatched = true;
    },

    tick: function () {
      const swordEl = document.querySelector('[sword]') as any;
      if (!swordEl) {
        this._setText('BOW DEBUG\nNo [sword] entity');
        return;
      }
      const sword = swordEl.components?.sword;
      if (!sword) {
        this._setText('BOW DEBUG\nNo sword component');
        return;
      }

      this._patchShoot(sword);

      const mode      = sword.mode          ?? '?';
      const grabbing  = sword.isGrabbingString ? 'YES' : 'no';
      const draw      = typeof sword.drawProgress === 'number'
                          ? sword.drawProgress.toFixed(2) : '?';
      const drawn     = sword.isDrawn    ? 'YES' : 'no';
      const ready     = sword.isReady    ? 'YES' : 'no';
      const model     = sword.modelLoaded ? 'YES' : 'no';

      const log = [
        '=== BOW DEBUG ===',
        `mode:     ${mode}`,
        `model:    ${model}   ready: ${ready}`,
        `grip-dn:  ${this.gripDownCount}  up: ${this.gripUpCount}`,
        `grabStr:  ${grabbing}  drawn: ${drawn}`,
        `draw%:    ${draw}`,
        `shoots:   ${this.shootCount}`,
      ].join('\n');

      if (log !== this.lastLog) {
        this._setText(log);
        this.lastLog = log;
      }
    },

    _setText: function (val: string) {
      if (this.textEl) this.textEl.setAttribute('value', val);
    }
  });
}

/**
 * 弓デバッグパネル - ABCD全バグ原因チェック
 *
 * A: otherHand が null かどうか
 * B: string メッシュが取れているか（弦の位置）
 * C: weapon-controller の hand 設定（左右逆転チェック）
 * D: gripdown イベントが届いているか
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
      this._gripListened = false;

      this._createPanel();
    },

    _createPanel: function () {
      const panel = document.createElement('a-entity');
      panel.setAttribute('position', '0 0.1 -0.7');

      const bg = document.createElement('a-plane');
      bg.setAttribute('width', '0.65');
      bg.setAttribute('height', '0.52');
      bg.setAttribute('color', '#111111');
      bg.setAttribute('opacity', '0.88');
      panel.appendChild(bg);

      const text = document.createElement('a-text');
      text.setAttribute('value', 'BOW DEBUG\nLoading...');
      text.setAttribute('color', '#00ff88');
      text.setAttribute('width', '0.6');
      text.setAttribute('position', '-0.30 0.22 0.01');
      text.setAttribute('anchor', 'left');
      text.setAttribute('baseline', 'top');
      text.setAttribute('wrap-count', '32');
      panel.appendChild(text);

      this.textEl = text;
      document.querySelector('a-scene')?.appendChild(panel);
      this.panel = panel;
    },


    // gripイベントを左右両手ともリッスン
    _listenGrip: function () {
      ['leftHand', 'rightHand'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
          el.addEventListener('gripdown', () => {
            this.gripDownCount++;
            this._gripLog = `last:${id} dn#${this.gripDownCount}`;
          });
          el.addEventListener('gripup', () => {
            this.gripUpCount++;
            this._gripLog = `last:${id} up#${this.gripUpCount}`;
          });
        }
      });
      this._gripListened = true;
    },

    tick: function () {
      // gripリスナーは遅延登録（DOM確定後）
      if (!this._gripListened) this._listenGrip();

      const swordEl = document.querySelector('[sword]') as any;
      const sword = swordEl?.components?.sword;

      // --- A: otherHand チェック ---
      const otherHandRef  = sword?.otherHand;
      const aStatus = otherHandRef
        ? `OK(${otherHandRef.id ?? '?'})`
        : 'NULL ← バグA';

      // --- B: string メッシュチェック ---
      const stringMesh = sword?.string;
      let bStatus = 'NULL ← バグB';
      let bPos = '';
      if (stringMesh) {
        const p = new THREE.Vector3();
        stringMesh.getWorldPosition(p);
        bPos = `${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}`;
        bStatus = `OK pos=${bPos}`;
      }

      // --- C: hand 設定チェック（weapon-controllerのhand属性） ---
      const wcEl = document.querySelector('[weapon-controller]') as any;
      const wcHand = wcEl?.getAttribute('weapon-controller')?.hand ?? '?';
      // swordのhandと比較
      const swordHand = swordEl?.getAttribute('sword')?.hand ?? '?';
      const cStatus = `wc=${wcHand} sword=${swordHand}`;

      // --- D: gripdownイベント到達チェック ---
      const dStatus = this._gripLog ?? 'no grip yet';

      // --- shoot パッチ ---
      if (!this._shootPatched && sword?.shoot) {
        const orig = sword.shoot.bind(sword);
        sword.shoot = () => { this.shootCount++; orig(); };
        this._shootPatched = true;
      }

      const mode    = sword?.mode ?? '?';
      const grab    = sword?.isGrabbingString ? 'YES' : 'no';
      const draw    = typeof sword?.drawProgress === 'number'
                        ? sword.drawProgress.toFixed(2) : '?';
      const isNear  = sword?.isNearString?.() ? 'YES' : 'no';

      const log = [
        '=== BOW DEBUG ===',
        `mode:${mode} grab:${grab} draw:${draw}`,
        `near:${isNear} shoots:${this.shootCount}`,
        `[A]otherHand: ${aStatus}`,
        `[B]string: ${bStatus}`,
        `[C]hands: ${cStatus}`,
        `[D]grip: ${dStatus}`,
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

/**
 * GLBモデル管理
 * - A-Frameが提供するグローバルThree.jsを使用（重要！）
 * - import * as THREE from 'three' は使わない
 *   → A-Frameと別のThree.jsインスタンスが生まれ、
 *     instanceof THREE.Object3D チェックが失敗するため
 * - モデルのロード・キャッシュ・クローン生成
 * - エラーハンドリング・フォールバック
 */

// ❌ import * as THREE from 'three'; ← これが全エラーの根本原因だった
// ❌ import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
// ✅ A-FrameのグローバルTHREEを使用（global.d.ts で型定義）

export interface ModelManagerType {
  loader: any | null;
  models: Record<string, any>;
  init(): void;
  load(name: string, url: string): Promise<any>;
  getClone(name: string): any | null;
}

/**
 * モデル管理クラス
 * - シングルトンパターン
 * - Promise-based非同期ロード
 * - A-FrameのグローバルTHREEを使用
 */
export class ModelManagerClass implements ModelManagerType {
  loader: any | null = null;
  models: Record<string, any> = {};

  /**
   * GLTFLoaderを初期化
   * A-FrameのThree.jsからGLTFLoaderを取得
   */
  init(): void {
    // A-FrameのThree.jsからGLTFLoaderを取得
    // 候補: THREE.GLTFLoader, (window as any).THREE.GLTFLoader, AFRAME内部
    const globalTHREE = (window as any).THREE;

    if (globalTHREE && globalTHREE.GLTFLoader) {
      this.loader = new globalTHREE.GLTFLoader();
      console.log('[ModelManager] GLTFLoader initialized (from global THREE)');
    } else {
      // A-FrameがGLTFLoaderを直接公開していない場合、自前でスクリプトロード
      console.warn('[ModelManager] GLTFLoader not found on global THREE, loading via script tag...');
      this.loadGLTFLoaderScript();
    }
  }

  /**
   * フォールバック: GLTFLoaderをスクリプトタグで読み込む
   */
  private loadGLTFLoaderScript(): void {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/loaders/GLTFLoader.js';
    script.onload = () => {
      const globalTHREE = (window as any).THREE;
      if (globalTHREE && globalTHREE.GLTFLoader) {
        this.loader = new globalTHREE.GLTFLoader();
        console.log('[ModelManager] GLTFLoader initialized (script tag fallback)');
      } else {
        console.error('[ModelManager] Failed to load GLTFLoader even via script tag');
      }
    };
    document.head.appendChild(script);
  }

  /**
   * GLBモデルをロード
   * @param name モデル名（キャッシュキー）
   * @param url GLBファイルのパス
   * @returns ロードされたモデル
   */
  async load(name: string, url: string): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.loader) {
        const err = new Error(`[ModelManager] Loader not initialized for ${name}`);
        console.error(err.message);
        reject(err);
        return;
      }

      console.log(`[ModelManager] Loading ${name} from ${url}...`);

      this.loader.load(
        url,
        (gltf: any) => {
          console.log(`[ModelManager] ✅ ${name} loaded successfully`);
          this.models[name] = gltf.scene;
          resolve(gltf.scene);
        },
        (progress: ProgressEvent) => {
          if (progress.lengthComputable) {
            const percentComplete = (progress.loaded / progress.total) * 100;
            console.log(`[ModelManager] ${name}: ${percentComplete.toFixed(1)}%`);
          }
        },
        (error: any) => {
          console.error(`[ModelManager] ❌ Failed to load ${name}:`, error);
          reject(error);
        }
      );
    });
  }

  /**
   * キャッシュされたモデルのクローンを取得
   * @param name モデル名
   * @returns クローンされたモデル（存在しない場合はnull）
   */
  getClone(name: string): any | null {
    const model = this.models[name];
    if (!model) {
      console.warn(`[ModelManager] Model '${name}' not found in cache`);
      return null;
    }

    const clone = model.clone();

    // マテリアルもディープクローン
    clone.traverse((child: any) => {
      if (child.isMesh) {
        if (child.material) {
          child.material = Array.isArray(child.material)
            ? child.material.map((mat: any) => mat.clone())
            : child.material.clone();
        }
      }
    });

    console.log(`[ModelManager] Cloned ${name}`);
    return clone;
  }

  /**
   * デバッグ用：ロード済みモデルリストを表示
   */
  debug(): void {
    console.log('[ModelManager] Loaded models:', Object.keys(this.models));
  }

  /**
   * 全モデルをアンロード（メモリ解放）
   */
  clear(): void {
    Object.keys(this.models).forEach(name => {
      this.models[name].traverse((child: any) => {
        if (child.isMesh) {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach((mat: any) => mat.dispose());
            } else {
              child.material.dispose();
            }
          }
        }
      });
    });
    this.models = {};
    console.log('[ModelManager] All models cleared');
  }
}

// シングルトンインスタンスをエクスポート
export const modelManager = new ModelManagerClass();

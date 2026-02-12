/**
 * グローバル型定義
 * A-FrameがバンドルするThree.jsをグローバルとして使用するための定義
 */

// A-Frameが提供するグローバルTHREE
declare const THREE: typeof import('three');

// GLTFLoaderもグローバルから参照可能にする
declare namespace THREE {
    class GLTFLoader {
        constructor();
        load(
            url: string,
            onLoad: (gltf: { scene: THREE.Group; animations: any[] }) => void,
            onProgress?: (event: ProgressEvent) => void,
            onError?: (error: any) => void
        ): void;
    }
}

import { Mesh, MeshStandardMaterial, Scene, type Material } from "three";

/**
 * 將場景整體切換為白膜材質，返回恢復函式；恢復時銷燬共享的 clay 材質。
 *
 * 兩類 mesh 必須跳過，否則切換本身會破壞渲染：
 * - directorActor mesh 的材質由展示層按展示狀態自行管理；
 * - 帶 uniforms 的 ShaderMaterial（drei Grid/Line 等）由元件自身 useFrame 逐幀讀寫 uniforms，
 *   換成 clay 後渲染迴圈會逐幀拋錯、畫布凍結，白膜錄製只剩啟動前手動渲染的首幀。
 */
export function applyClaySceneMaterials(scene: Scene) {
    const clayMaterial = new MeshStandardMaterial({ color: "#d6d9dd", roughness: 0.88, metalness: 0 });
    const originals: Array<{ mesh: Mesh; material: Material | Material[] }> = [];
    scene.traverse((child) => {
        const mesh = child as Mesh;
        if (!mesh.isMesh || mesh.userData.directorActor || mesh.userData.directorStageGround) return;
        const material = mesh.material;
        const shaderBacked = Array.isArray(material) ? material.some((item) => "uniforms" in item) : "uniforms" in material;
        if (shaderBacked) return;
        originals.push({ mesh, material });
        mesh.material = clayMaterial;
    });
    return () => {
        originals.forEach(({ mesh, material }) => {
            mesh.material = material;
        });
        clayMaterial.dispose();
    };
}

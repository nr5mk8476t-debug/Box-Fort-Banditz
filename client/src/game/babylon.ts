// Single place for Babylon.js imports. Deep imports keep the download smaller
// than importing the whole engine. Side-effect imports register optional features.
export { Engine } from "@babylonjs/core/Engines/engine.js";
export { Scene } from "@babylonjs/core/scene.js";
export { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera.js";
export { Camera } from "@babylonjs/core/Cameras/camera.js";
export { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
export { DirectionalLight } from "@babylonjs/core/Lights/directionalLight.js";
export { PointLight } from "@babylonjs/core/Lights/pointLight.js";
export { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
export { Vector3, Color3, Color4, Matrix, Quaternion } from "@babylonjs/core/Maths/math.js";
export { Scalar } from "@babylonjs/core/Maths/math.scalar.js";
export { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
export { Mesh } from "@babylonjs/core/Meshes/mesh.js";
export { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
export { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
export { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
export type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
export { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
export { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture.js";
export { Texture } from "@babylonjs/core/Materials/Textures/texture.js";
export { CellMaterial } from "@babylonjs/materials/cell/cellMaterial.js";
import "@babylonjs/core/Rendering/outlineRenderer.js";
import "@babylonjs/core/Meshes/instancedMesh.js"; // (R11: the club crowd is instanced)
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent.js";
import "@babylonjs/core/Culling/ray.js";

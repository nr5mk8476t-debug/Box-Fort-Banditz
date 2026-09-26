// Preview-page only: the same exports as babylon.ts, but taken from the Babylon.js
// UMD build loaded from the jsDelivr CDN (window.BABYLON). Used because the claude.ai
// page viewer only reliably runs inline code plus scripts from approved CDNs.
const B = (globalThis as any).BABYLON;
if (!B) throw new Error("Babylon.js failed to load from the CDN");
export const Engine = B.Engine;
export const Scene = B.Scene;
export const UniversalCamera = B.UniversalCamera;
export const Camera = B.Camera;
export const HemisphericLight = B.HemisphericLight;
export const DirectionalLight = B.DirectionalLight;
export const PointLight = B.PointLight;
export const ShadowGenerator = B.ShadowGenerator;
export const Vector3 = B.Vector3;
export const Color3 = B.Color3;
export const Color4 = B.Color4;
export const Matrix = B.Matrix;
export const Scalar = B.Scalar;
export const MeshBuilder = B.MeshBuilder;
export const Mesh = B.Mesh;
export const TransformNode = B.TransformNode;
export const StandardMaterial = B.StandardMaterial;
export const DynamicTexture = B.DynamicTexture;
export const Texture = B.Texture;
export const CellMaterial = B.CellMaterial;
export const VertexBuffer = B.VertexBuffer;

// R12.8: the ink outline in ONE draw instead of two.
//
// Babylon's outline renderer draws every outlined mesh three times: the outline shell in colour with depth writes off
// (before the mesh, so the mesh can cover the part of the shell that's in front of it), the mesh, then the shell AGAIN
// with colour off, only to write its depth. On Blake's PC the frame is the cost of sending draws, and outlined meshes
// are most of them, so that third draw was ~20% of every view.
//
// Here (opaque, back-face-culled materials, which is nearly all of them) the shell is drawn once, before the mesh, with
// its FRONT faces culled and depth writes on: what's left of the shell is the part behind the mesh, so the mesh draws over
// it where it covers it, and the ring round the silhouette is all that shows, with its depth written like before (now the
// shell's back, not its proud front, so the shell no longer wins depth ties with things mounted on it). No polygon offset
// on that pass: the back of the shell is behind the mesh already.
// Anything else (transparent, two-sided, overlays) keeps Babylon's own passes. `?ink=old` switches the old way back on
// for comparisons.
import type { Scene } from "@babylonjs/core/scene";
import { Material } from "@babylonjs/core/Materials/material";

type Step = { component: unknown; action: (...a: any[]) => void };

export function installOneDrawOutlines(scene: Scene): boolean {
  if (typeof location !== "undefined" && /[?&]ink=old\b/.test(location.search)) return false;
  const ol = (scene as any).getOutlineRenderer?.();
  if (!ol || ol.__oneDraw) return false;
  ol.__oneDraw = true;
  const engine = scene.getEngine() as any;
  // (a new scene component hooks its steps in at the first render: do that now, so there's a step to replace)
  (scene as any)._registerTransientComponents?.();
  const before = (scene as any)._beforeRenderingMeshStage as Step[], after = (scene as any)._afterRenderingMeshStage as Step[];
  const b = before.find((s) => s.component === ol), a = after.find((s) => s.component === ol);
  if (!b || !a) return false;
  const oldBefore = b.action, oldAfter = a.action;
  let mine: unknown = null; // (the mesh whose outline this frame's "before" step drew: its "after" step is skipped)
  b.action = (mesh: any, subMesh: any, batch: any, effect: any) => {
    mine = null;
    if (!ol.enabled || !mesh.renderOutline || mesh.renderOverlay) return oldBefore(mesh, subMesh, batch, effect);
    const mat = subMesh.getMaterial?.();
    if (!mat || !mat.backFaceCulling || mat.needAlphaBlendingForMesh(mesh) || !engine.getDepthWrite()) return oldBefore(mesh, subMesh, batch, effect);
    // the mesh's own idea of which side is the front (mirrored transforms flip it), as Mesh.render works it out
    let o = mat._getEffectiveOrientation ? mat._getEffectiveOrientation(mesh) : mat.sideOrientation;
    if (mesh._getWorldMatrixDeterminant?.() < 0) o = o === Material.ClockWiseSideOrientation ? Material.CounterClockWiseSideOrientation : Material.ClockWiseSideOrientation;
    engine.setState(true, 0, false, o === Material.ClockWiseSideOrientation, false); // cull the front faces
    const z = ol.zOffset, zu = ol.zOffsetUnits;
    ol.zOffset = 0; ol.zOffsetUnits = 0;
    ol.render(subMesh, batch, false, ol._passIdForDrawWrapper[0]);
    ol.zOffset = z; ol.zOffsetUnits = zu;
    mine = subMesh;
  };
  a.action = (mesh: any, subMesh: any, batch: any, effect: any) => {
    if (mine === subMesh) { mine = null; return; }
    mine = null;
    return oldAfter(mesh, subMesh, batch, effect);
  };
  return true;
}

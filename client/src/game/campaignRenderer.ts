// R14 stage 5: the Mayor campaign's posters, where the candidate has put them up: a small "VOTE <NAME>" board on a
// stake at each done spot (8 at most, only during a campaign; one shared material per campaign). Cheap: up to 8 meshes.
import { MeshBuilder, Mesh, StandardMaterial, DynamicTexture, Color3, type Scene } from "./babylon.ts";

export class CampaignRenderer {
  private posters = new Map<string, Mesh>();
  private mat: StandardMaterial | null = null;
  private key = "";
  constructor(private scene: Scene) {}

  /** spots [x, z, done]; who: the candidate's name and colour ("" = no campaign) */
  update(spots: [number, number, number][] | null, who: string, color: string) {
    const key = spots ? who + color : "";
    if (key !== this.key) { this.clear(); this.key = key; }
    if (!spots) return;
    if (!this.mat) this.mat = this.makeMat(who, color);
    for (const [x, z, done] of spots) {
      const id = x.toFixed(1) + "," + z.toFixed(1);
      if (!done || this.posters.has(id)) continue;
      const m = MeshBuilder.CreatePlane("campPoster", { width: 0.9, height: 1.2, sideOrientation: Mesh.DOUBLESIDE }, this.scene);
      m.position.set(x, 2.1, z); m.billboardMode = Mesh.BILLBOARDMODE_Y; m.material = this.mat; m.isPickable = false;
      this.posters.set(id, m);
    }
  }
  private makeMat(who: string, color: string) {
    const t = new DynamicTexture("campTex", { width: 256, height: 340 }, this.scene, true);
    const g = t.getContext() as CanvasRenderingContext2D;
    g.fillStyle = "#f4f1ea"; g.fillRect(0, 0, 256, 340);
    g.fillStyle = color; g.fillRect(10, 10, 236, 320);
    g.fillStyle = "#f4f1ea"; g.fillRect(22, 22, 212, 296);
    g.fillStyle = "#1b1420"; g.textAlign = "center";
    g.font = "bold 46px Arial Black, sans-serif"; g.fillText("VOTE", 128, 86);
    g.fillStyle = color; g.font = `bold ${who.length > 9 ? 30 : 38}px Arial Black, sans-serif`; g.fillText(who.toUpperCase().slice(0, 14), 128, 160);
    g.fillStyle = "#1b1420"; g.font = "bold 26px Arial Black, sans-serif"; g.fillText("FOR MAYOR", 128, 222);
    g.font = "italic 18px Arial, sans-serif"; g.fillText("(probably fine)", 128, 286);
    t.update();
    const m = new StandardMaterial("campMat", this.scene);
    m.diffuseTexture = t; m.emissiveColor = new Color3(0.55, 0.55, 0.55); m.specularColor = Color3.Black(); m.backFaceCulling = false;
    return m;
  }
  clear() {
    for (const m of this.posters.values()) m.dispose();
    this.posters.clear();
    if (this.mat) { this.mat.diffuseTexture?.dispose(); this.mat.dispose(); this.mat = null; }
  }
}

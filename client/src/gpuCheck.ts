// R12.5 (Blake's PC dropped from 180-200 FPS to 15: Brave had switched its hardware acceleration off, so the game was
// being drawn by the CPU in software): is the browser drawing without the graphics card?
// Two checks: a WebGL context that refuses to start on a "major performance caveat" (the browser's own word for
// software rendering), and the renderer's name where the browser shares it (SwiftShader, llvmpipe, Microsoft Basic
// Render Driver...). Brave hides the name, so the first check is the one that catches it there.
export function softwareRendering(): boolean {
  try {
    const c = document.createElement("canvas");
    const strict = c.getContext("webgl2", { failIfMajorPerformanceCaveat: true }) ?? c.getContext("webgl", { failIfMajorPerformanceCaveat: true });
    const c2 = document.createElement("canvas");
    const any = (c2.getContext("webgl2") ?? c2.getContext("webgl")) as WebGLRenderingContext | null;
    let named = false;
    if (any) {
      const ext = any.getExtension("WEBGL_debug_renderer_info");
      const name = ext ? String(any.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "";
      named = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);
      any.getExtension("WEBGL_lose_context")?.loseContext();
    }
    (strict as WebGLRenderingContext | null)?.getExtension("WEBGL_lose_context")?.loseContext();
    return (!strict && !!any) || named;
  } catch { return false; }
}

/** the steps, per browser (shown on the title screen when the check fails) */
export function gpuHelpHtml(): string {
  const ua = navigator.userAgent, brave = !!(navigator as Navigator & { brave?: unknown }).brave, edge = /Edg\//.test(ua), firefox = /Firefox\//.test(ua);
  const name = brave ? "Brave" : edge ? "Edge" : firefox ? "Firefox" : "Chrome", scheme = brave ? "brave" : edge ? "edge" : "chrome";
  const steps = firefox
    ? `<li>Open <b>Settings</b>, search for <b>performance</b>.</li><li>Untick <b>Use recommended performance settings</b>, then tick <b>Use hardware acceleration when available</b>.</li><li>Restart Firefox.</li>`
    : `<li>Open <b>Settings → System</b>.</li><li>Turn on <b>Use graphics acceleration when available</b> (Edge: <b>Use hardware acceleration when available</b>).</li><li>Click <b>Relaunch</b>.</li><li>Check: open <b>${scheme}://gpu</b> in a new tab: <b>WebGL</b> should say <b>Hardware accelerated</b>.</li><li>Still off? Update your graphics card's driver (NVIDIA, AMD or Intel), or on ${scheme}://flags enable <b>Override software rendering list</b>.</li>`;
  return `<b>${name} isn't using your graphics card</b>, so the game is being drawn by the processor and will run slowly (a fraction of the frame rate it should).<ol>${steps}</ol>`;
}

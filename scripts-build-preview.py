#!/usr/bin/env python3
"""Builds preview/box-fort-banditz.html: the solo-only page published to claude.ai.
Babylon.js loads from the jsDelivr CDN; the game code (~35 KB) is inlined."""
import re, glob, subprocess, os
os.chdir(os.path.dirname(os.path.abspath(__file__)))
subprocess.run(["npx", "vite", "build", "-c", "vite.preview.config.ts"], cwd="client", check=True, capture_output=True)
html = open("client/dist-preview/index.html").read()
css = open(glob.glob("client/dist-preview/assets/*.css")[0]).read()
js = open(glob.glob("client/dist-preview/assets/*.js")[0]).read().replace("</script", "<\\/script")
body = re.search(r"<body>(.*)</body>", html, re.S).group(1)
body = re.sub(r"<script[^>]*></script>", "", body)
body = body.replace("PHASE 0 PROTOTYPE</span> Placeholder art &amp; sound. Nothing is final.",
                    "PHASE 0 SOLO PREVIEW</span> Placeholder art &amp; sound. Multiplayer needs the real server.")
out = f'''<title>Box Fort Banditz</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bungee&family=Nunito:wght@600;800;900&display=swap" rel="stylesheet">
<style>
:root {{ color-scheme: dark; }}
{css}
</style>
{body}
<div id="boot-note" style="position:fixed;left:16px;right:16px;top:16px;z-index:99;color:#fff;font:800 15px Nunito,sans-serif;text-shadow:1px 1px 0 #1b1420">Loading the 3D engine (about 2 MB, first visit only)...</div>
<script src="https://cdn.jsdelivr.net/npm/babylonjs@9.28.0/babylon.js"></script>
<script src="https://cdn.jsdelivr.net/npm/babylonjs-materials@9.28.0/babylonjs.materials.min.js"></script>
<script>
setTimeout(function () {{
  if (window.__bfb) return;
  var f = document.getElementById("fatal");
  f.textContent = window.BABYLON ? "The game failed to start. Please tell the developer." : "The 3D engine couldn't download (network or browser blocked cdn.jsdelivr.net). Try reloading.";
  f.classList.remove("hidden");
}}, 20000);
</script>
<script type="module">
document.getElementById("boot-note").remove();
{js}
</script>
'''
os.makedirs("preview", exist_ok=True)
open("preview/box-fort-banditz.html", "w").write(out)
print("preview/box-fort-banditz.html", len(out), "bytes")

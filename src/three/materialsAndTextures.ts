import * as THREE from "three";

export interface ProceduralTextureSet {
  brushedRoughness: THREE.CanvasTexture;
  stageGridAlbedo: THREE.CanvasTexture;
  contactShadow: THREE.CanvasTexture;
  cellBump: THREE.CanvasTexture;
  dispose: () => void;
}

export function createProceduralTextures(maxAnisotropy: number): ProceduralTextureSet {
  // 1. Brushed metallic anisotropic roughness map (linear NoColorSpace)
  const brushedCanvas = document.createElement("canvas");
  brushedCanvas.width = 256;
  brushedCanvas.height = 256;
  const bCtx = brushedCanvas.getContext("2d")!;
  bCtx.fillStyle = "#888888";
  bCtx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y++) {
    const v = 105 + Math.floor(Math.sin(y * 1.9) * 28 + ((y * 37) % 35));
    bCtx.fillStyle = `rgb(${v},${v},${v})`;
    bCtx.fillRect(0, y, 256, 1);
  }
  const brushedRoughness = new THREE.CanvasTexture(brushedCanvas);
  brushedRoughness.wrapS = THREE.RepeatWrapping;
  brushedRoughness.wrapT = THREE.RepeatWrapping;
  brushedRoughness.repeat.set(3, 3);
  brushedRoughness.anisotropy = maxAnisotropy;

  // 2. Subtle scientific stage dial & radial grid albedo (SRGBColorSpace)
  const gridCanvas = document.createElement("canvas");
  gridCanvas.width = 512;
  gridCanvas.height = 512;
  const gCtx = gridCanvas.getContext("2d")!;
  gCtx.fillStyle = "#e8eaf6";
  gCtx.fillRect(0, 0, 512, 512);
  gCtx.strokeStyle = "rgba(108, 99, 255, 0.14)";
  gCtx.lineWidth = 1.25;
  const step = 32;
  for (let i = 0; i <= 512; i += step) {
    gCtx.beginPath();
    gCtx.moveTo(i, 0);
    gCtx.lineTo(i, 512);
    gCtx.stroke();
    gCtx.beginPath();
    gCtx.moveTo(0, i);
    gCtx.lineTo(512, i);
    gCtx.stroke();
  }
  gCtx.strokeStyle = "rgba(108, 99, 255, 0.28)";
  gCtx.lineWidth = 2;
  for (const r of [90, 165, 240]) {
    gCtx.beginPath();
    gCtx.arc(256, 256, r, 0, Math.PI * 2);
    gCtx.stroke();
  }
  const stageGridAlbedo = new THREE.CanvasTexture(gridCanvas);
  stageGridAlbedo.colorSpace = THREE.SRGBColorSpace;
  stageGridAlbedo.anisotropy = maxAnisotropy;

  // 3. Soft radial contact shadow (SRGBColorSpace with alpha)
  const shadowCanvas = document.createElement("canvas");
  shadowCanvas.width = 256;
  shadowCanvas.height = 256;
  const sCtx = shadowCanvas.getContext("2d")!;
  const grad = sCtx.createRadialGradient(128, 128, 12, 128, 128, 124);
  grad.addColorStop(0, "rgba(18, 21, 48, 0.58)");
  grad.addColorStop(0.55, "rgba(18, 21, 48, 0.22)");
  grad.addColorStop(1, "rgba(18, 21, 48, 0.0)");
  sCtx.fillStyle = grad;
  sCtx.fillRect(0, 0, 256, 256);
  const contactShadow = new THREE.CanvasTexture(shadowCanvas);
  contactShadow.colorSpace = THREE.SRGBColorSpace;

  // 4. Organic cellular membrane bump map (linear NoColorSpace)
  const cellCanvas = document.createElement("canvas");
  cellCanvas.width = 256;
  cellCanvas.height = 256;
  const cCtx = cellCanvas.getContext("2d")!;
  cCtx.fillStyle = "#808080";
  cCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 95; i++) {
    const cx = (i * 73) % 256;
    const cy = (i * 139) % 256;
    const rad = 10 + (i % 14);
    const cg = cCtx.createRadialGradient(cx, cy, 1, cx, cy, rad);
    cg.addColorStop(0, "rgba(225,225,225,0.65)");
    cg.addColorStop(1, "rgba(128,128,128,0)");
    cCtx.fillStyle = cg;
    cCtx.beginPath();
    cCtx.arc(cx, cy, rad, 0, Math.PI * 2);
    cCtx.fill();
  }
  const cellBump = new THREE.CanvasTexture(cellCanvas);
  cellBump.wrapS = THREE.RepeatWrapping;
  cellBump.wrapT = THREE.RepeatWrapping;
  cellBump.repeat.set(2, 2);
  cellBump.anisotropy = maxAnisotropy;

  return {
    brushedRoughness,
    stageGridAlbedo,
    contactShadow,
    cellBump,
    dispose: () => {
      brushedRoughness.dispose();
      stageGridAlbedo.dispose();
      contactShadow.dispose();
      cellBump.dispose();
    },
  };
}

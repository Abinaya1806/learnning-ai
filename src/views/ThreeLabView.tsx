import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronDown, ChevronUp, RotateCcw } from "lucide-react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { createProceduralTextures } from "../three/materialsAndTextures";
import {
  buildProceduralModel,
  MODEL_METADATA,
  type BuiltProceduralScene,
  type FinishPreset,
  type ModelPartInfo,
  type ModelTopicId,
} from "../three/proceduralModels";

// Pre-allocated scratch helpers outside animation loop (zero GC)
const _camGoal = new THREE.Vector3();
const _targetGoal = new THREE.Vector3();
const _ndcMouse = new THREE.Vector2();

function detectSoftwareWebGL(): boolean {
  const probeCanvas = document.createElement("canvas");
  const gl = probeCanvas.getContext("webgl2");
  if (!gl) return true;
  const ext = gl.getExtension("WEBGL_debug_renderer_info");
  const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
  const gpu = String(gl.getParameter(param));
  gl.getExtension("WEBGL_lose_context")?.loseContext();
  return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
}

export function ThreeLabView({ onExit }: { onExit: () => void }) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  const [topic, setTopic] = useState<ModelTopicId>("orrery");
  const [explodeTarget, setExplodeTarget] = useState(0);
  const [speedMultiplier, setSpeedMultiplier] = useState(1);
  const [finishPreset, setFinishPreset] = useState<FinishPreset>("brass");
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [selectedPart, setSelectedPart] = useState<ModelPartInfo | null>(null);

  // Refs synced to imperative Three.js loop without re-creating canvas
  const explodeTargetRef = useRef(0);
  const explodeCurrentRef = useRef(0);
  const speedRef = useRef(1);
  const finishRef = useRef<FinishPreset>("brass");
  const activeBuiltRef = useRef<BuiltProceduralScene | null>(null);
  const cameraFlightRef = useRef<{ active: boolean; pos: [number, number, number]; target: [number, number, number] }>({
    active: false,
    pos: MODEL_METADATA.orrery.cameraPos,
    target: MODEL_METADATA.orrery.target,
  });
  const switchModelRef = useRef<((nextTopic: ModelTopicId) => void) | null>(null);

  useEffect(() => {
    explodeTargetRef.current = explodeTarget;
  }, [explodeTarget]);

  useEffect(() => {
    speedRef.current = speedMultiplier;
  }, [speedMultiplier]);

  useEffect(() => {
    finishRef.current = finishPreset;
    activeBuiltRef.current?.applyFinish(finishPreset);
  }, [finishPreset]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "h" && (e.target as HTMLElement)?.tagName !== "INPUT") {
        setDockCollapsed((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: "high-performance",
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const horizonHex = 0xeff2fc;
    scene.background = new THREE.Color(horizonHex);
    scene.fog = new THREE.FogExp2(horizonHex, 0.042);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTarget = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 120);
    camera.position.set(...MODEL_METADATA.orrery.cameraPos);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(...MODEL_METADATA.orrery.target);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.minDistance = 2.4;
    controls.maxDistance = 14;
    controls.maxPolarAngle = Math.PI / 2 - 0.04;
    controls.update();

    controls.addEventListener("start", () => {
      cameraFlightRef.current.active = false;
    });

    // Studio warm key light + cool HemisphereLight fill + rim light
    const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x334155, 0.72);
    hemiLight.position.set(0, 12, 0);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff1dc, 2.2);
    keyLight.position.set(5.5, 9.0, 5.0);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 26;
    const frustum = 4.5;
    keyLight.shadow.camera.left = -frustum;
    keyLight.shadow.camera.right = frustum;
    keyLight.shadow.camera.top = frustum;
    keyLight.shadow.camera.bottom = -frustum;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x93c5fd, 0.9);
    rimLight.position.set(-6, 4.5, -5);
    scene.add(rimLight);

    const textures = createProceduralTextures(renderer.capabilities.getMaxAnisotropy());

    // Horizon-blended calibrated studio stage ground
    const floorGeo = new THREE.CircleGeometry(36, 64);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0xe6eaf8,
      roughness: 0.88,
      metalness: 0.04,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    const dialGeo = new THREE.CircleGeometry(3.3, 64);
    const dialMat = new THREE.MeshStandardMaterial({
      map: textures.stageGridAlbedo,
      roughness: 0.72,
      metalness: 0.08,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const dialMesh = new THREE.Mesh(dialGeo, dialMat);
    dialMesh.rotation.x = -Math.PI / 2;
    dialMesh.position.y = 0.004;
    dialMesh.receiveShadow = true;
    scene.add(dialMesh);

    function disposeBuilt(built: BuiltProceduralScene | null) {
      if (!built) return;
      scene.remove(built.root);
      built.disposables.geometries.forEach((g) => g.dispose());
      built.disposables.materials.forEach((m) => m.dispose());
    }

    function loadTopicModel(nextTopic: ModelTopicId) {
      disposeBuilt(activeBuiltRef.current);
      const nextBuilt = buildProceduralModel(nextTopic, textures, isSoftwareGl);
      nextBuilt.applyFinish(finishRef.current);
      scene.add(nextBuilt.root);
      activeBuiltRef.current = nextBuilt;
      explodeCurrentRef.current = 0;

      const meta = MODEL_METADATA[nextTopic];
      cameraFlightRef.current = {
        active: true,
        pos: meta.cameraPos,
        target: meta.target,
      };
      setSelectedPart(null);
    }

    switchModelRef.current = loadTopicModel;
    loadTopicModel("orrery");

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Raycast click inspection on Layer 1
    const raycaster = new THREE.Raycaster();
    raycaster.layers.set(1);
    let pointerDownPos = { x: 0, y: 0 };

    const onPointerDown = (e: PointerEvent) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
    };
    const onPointerUp = (e: PointerEvent) => {
      const moved = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
      if (moved > 6) return;
      const built = activeBuiltRef.current;
      if (!built) return;
      const rect = renderer.domElement.getBoundingClientRect();
      _ndcMouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      _ndcMouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(_ndcMouse, camera);
      const hits = raycaster.intersectObjects(built.clickables, true);
      if (hits.length > 0) {
        const info = hits[0].object.userData.partInfo as ModelPartInfo | undefined;
        if (info) setSelectedPart(info);
      } else {
        setSelectedPart(null);
      }
    };
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointerup", onPointerUp);

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", onResize);

    // Animation loop with software WebGL afterDraw fence pacing
    let frameId = 0;
    let disposed = false;
    const clock = new THREE.Clock();

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      if (disposed) return;
      const dt = Math.min(clock.getDelta(), 0.08);
      const elapsed = clock.elapsedTime;

      explodeCurrentRef.current = THREE.MathUtils.damp(
        explodeCurrentRef.current,
        explodeTargetRef.current,
        6.5,
        dt
      );

      if (cameraFlightRef.current.active) {
        _camGoal.set(...cameraFlightRef.current.pos);
        _targetGoal.set(...cameraFlightRef.current.target);
        const alpha = 1 - Math.exp(-5.5 * dt);
        camera.position.lerp(_camGoal, alpha);
        controls.target.lerp(_targetGoal, alpha);
        if (
          camera.position.distanceTo(_camGoal) < 0.03 &&
          controls.target.distanceTo(_targetGoal) < 0.03
        ) {
          cameraFlightRef.current.active = false;
        }
      }

      controls.update();
      activeBuiltRef.current?.update(elapsed, dt, speedRef.current, explodeCurrentRef.current);
      renderer.render(scene, camera);

      if (isSoftwareGl) afterDraw(tick);
      else frameId = requestAnimationFrame(tick);
    }

    if (isSoftwareGl) afterDraw(tick);
    else frameId = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      disposeBuilt(activeBuiltRef.current);
      floorGeo.dispose();
      floorMat.dispose();
      dialGeo.dispose();
      dialMat.dispose();
      textures.dispose();
      envTarget.dispose();
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  function selectModel(next: ModelTopicId) {
    setTopic(next);
    setExplodeTarget(0);
    switchModelRef.current?.(next);
  }

  function resetCamera() {
    const meta = MODEL_METADATA[topic];
    cameraFlightRef.current = {
      active: true,
      pos: meta.cameraPos,
      target: meta.target,
    };
  }

  const activeMeta = MODEL_METADATA[topic];

  return (
    <div className="fixed inset-0 z-40 w-screen h-screen overflow-hidden bg-[#eff2fc] select-none">
      {/* Stable isolated WebGL canvas container */}
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Minimal Top-Left Header Chip (solid rgba surface, no backdrop-filter) */}
      <div
        className="fixed top-4 left-4 z-50 max-w-sm rounded-2xl px-4 py-3 border border-indigo-200/80 shadow-md"
        style={{ backgroundColor: "rgba(255, 255, 255, 0.94)" }}
      >
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onExit}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#6C63FF] hover:underline cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Dashboard</span>
          </button>
          <span className="text-[11px] font-medium text-slate-500">{activeMeta.subject}</span>
        </div>
        <h1 className="text-sm font-bold text-slate-900 mt-1">{activeMeta.title}</h1>
        <p className="text-xs text-slate-600 mt-0.5 leading-snug">
          {selectedPart ? (
            <>
              <span className="font-semibold text-[#6C63FF]">{selectedPart.name}:</span>{" "}
              {selectedPart.summary}
            </>
          ) : (
            "Drag to orbit · Scroll to zoom · Click any component to inspect"
          )}
        </p>
      </div>

      {/* Collapsible Floating Bottom Control Dock */}
      <div
        className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[min(900px,94vw)] flex flex-col items-center transition-transform duration-300"
        style={{
          transform: dockCollapsed
            ? "translate(-50%, calc(100% - 34px))"
            : "translate(-50%, 0)",
        }}
      >
        <button
          type="button"
          onClick={() => setDockCollapsed((v) => !v)}
          className="px-4 py-1.5 rounded-t-xl border border-b-0 border-indigo-200/90 text-[11px] font-semibold text-slate-700 flex items-center gap-1.5 shadow-xs cursor-pointer"
          style={{ backgroundColor: "rgba(255, 255, 255, 0.95)" }}
        >
          {dockCollapsed ? (
            <>
              <ChevronUp className="w-3.5 h-3.5 text-[#6C63FF]" />
              <span>Show 3D Controls (H)</span>
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5 text-[#6C63FF]" />
              <span>Hide Controls (H)</span>
            </>
          )}
        </button>

        <div
          className="w-full rounded-2xl border border-indigo-200/90 shadow-lg px-4 py-3 flex flex-wrap items-center justify-between gap-4"
          style={{ backgroundColor: "rgba(255, 255, 255, 0.96)" }}
        >
          {/* Model Selector */}
          <div className="flex items-center gap-1.5">
            {(["orrery", "cell", "stirling"] as ModelTopicId[]).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => selectModel(id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                  topic === id
                    ? "gradient-brand text-white"
                    : "bg-[#F7F6FF] text-slate-700 hover:text-[#6C63FF]"
                }`}
              >
                {id === "orrery" ? "Solar Orrery" : id === "cell" ? "Animal Cell" : "Stirling Engine"}
              </button>
            ))}
          </div>

          {/* Exploded View Slider */}
          <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
            <span>Explode</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={explodeTarget}
              onChange={(e) => setExplodeTarget(Number(e.target.value))}
              className="w-24 accent-[#6C63FF] cursor-pointer"
            />
          </label>

          {/* Motion Speed */}
          <div className="flex items-center gap-1">
            {[0, 1, 2].map((spd) => (
              <button
                key={spd}
                type="button"
                onClick={() => setSpeedMultiplier(spd)}
                className={`px-2.5 py-1 rounded-lg text-xs font-mono-nums font-semibold cursor-pointer ${
                  speedMultiplier === spd
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {spd === 0 ? "Pause" : `${spd}x`}
              </button>
            ))}
          </div>

          {/* Finish & Reset Camera */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setFinishPreset((prev) => (prev === "brass" ? "titanium" : "brass"))
              }
              className="px-2.5 py-1 rounded-lg bg-[#F7F6FF] text-[#6C63FF] text-xs font-semibold cursor-pointer"
            >
              Finish: {finishPreset === "brass" ? "Brass" : "Titanium"}
            </button>
            <button
              type="button"
              onClick={resetCamera}
              className="p-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer"
              title="Reset camera angle"
              aria-label="Reset camera angle"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

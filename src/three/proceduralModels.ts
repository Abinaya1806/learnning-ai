import * as THREE from "three";
import type { ProceduralTextureSet } from "./materialsAndTextures";

export type ModelTopicId = "orrery" | "cell" | "stirling";
export type FinishPreset = "brass" | "titanium";

export interface ModelPartInfo {
  name: string;
  summary: string;
}

export interface BuiltProceduralScene {
  root: THREE.Group;
  clickables: THREE.Object3D[];
  disposables: { geometries: THREE.BufferGeometry[]; materials: THREE.Material[] };
  update: (elapsed: number, dt: number, speedMultiplier: number, explodeProgress: number) => void;
  applyFinish: (preset: FinishPreset) => void;
}

export const MODEL_METADATA: Record<
  ModelTopicId,
  { title: string; subject: string; description: string; cameraPos: [number, number, number]; target: [number, number, number] }
> = {
  orrery: {
    title: "Solar Mechanical Orrery",
    subject: "Astronomy & Keplerian Mechanics",
    description: "Composite brass-and-steel planetary gear drive modeling orbital periods, axial tilt, and asteroid distribution.",
    cameraPos: [5.4, 3.8, 6.2],
    target: [0, 1.5, 0],
  },
  cell: {
    title: "Eukaryotic Animal Cell",
    subject: "Cellular Biology",
    description: "Cutaway cellular model featuring plasma membrane, porous nuclear envelope, mitochondria cristae, and ER folds.",
    cameraPos: [4.8, 3.5, 5.4],
    target: [0, 1.45, 0],
  },
  stirling: {
    title: "Gamma Stirling Heat Engine",
    subject: "Thermodynamics & Kinematics",
    description: "Live slider-crank heat engine with finned cooling jacket, displacer cylinder, spoked flywheel, and brass burner.",
    cameraPos: [5.0, 3.1, 5.6],
    target: [0, 1.4, 0],
  },
};

function registerExplodable(
  obj: THREE.Object3D,
  explodeOffset: [number, number, number],
  partInfo: ModelPartInfo,
  clickables: THREE.Object3D[]
) {
  obj.userData.basePos = obj.position.clone();
  obj.userData.explodeOffset = new THREE.Vector3(...explodeOffset);
  obj.userData.partInfo = partInfo;
  obj.traverse((child) => {
    child.userData.partInfo = partInfo;
    if ((child as THREE.Mesh).isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      child.layers.enable(1);
    }
  });
  clickables.push(obj);
}

function addContactShadow(
  parent: THREE.Group,
  textures: ProceduralTextureSet,
  radius: number,
  disposables: BuiltProceduralScene["disposables"]
) {
  const geo = new THREE.PlaneGeometry(radius * 2.2, radius * 2.2);
  const mat = new THREE.MeshBasicMaterial({
    map: textures.contactShadow,
    transparent: true,
    depthWrite: false,
    opacity: 0.65,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.015;
  mesh.renderOrder = 1;
  parent.add(mesh);
  disposables.geometries.push(geo);
  disposables.materials.push(mat);
}

function createStarfieldInstances(
  disposables: BuiltProceduralScene["disposables"]
): THREE.InstancedMesh {
  const count = 90;
  const geo = new THREE.OctahedronGeometry(0.038, 0);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xc7d2fe,
    roughness: 0.35,
    metalness: 0.4,
    emissive: 0x4f46e5,
    emissiveIntensity: 0.35,
  });
  const inst = new THREE.InstancedMesh(geo, mat, count);
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + (i % 7) * 0.4;
    const rad = 2.6 + (i % 9) * 0.24;
    const y = 0.9 + Math.sin(i * 1.7) * 1.2 + (i % 5) * 0.25;
    dummy.position.set(Math.cos(angle) * rad, y, Math.sin(angle) * rad);
    const scale = 0.65 + ((i * 17) % 10) * 0.07;
    dummy.scale.setScalar(scale);
    dummy.rotation.set(i * 0.3, i * 0.7, 0);
    dummy.updateMatrix();
    inst.setMatrixAt(i, dummy.matrix);

    col.setHSL(0.62 + (i % 5) * 0.03, 0.55, 0.68 + (i % 4) * 0.06);
    inst.setColorAt(i, col);
  }
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  inst.computeBoundingSphere();

  disposables.geometries.push(geo);
  disposables.materials.push(mat);
  return inst;
}

export function buildProceduralModel(
  topic: ModelTopicId,
  textures: ProceduralTextureSet,
  isSoftwareGl: boolean
): BuiltProceduralScene {
  const root = new THREE.Group();
  const clickables: THREE.Object3D[] = [];
  const disposables: BuiltProceduralScene["disposables"] = { geometries: [], materials: [] };

  const primaryMetalMat = new THREE.MeshPhysicalMaterial({
    color: 0xd4a44a,
    metalness: 0.92,
    roughness: 0.22,
    roughnessMap: textures.brushedRoughness,
    clearcoat: 0.35,
  });
  const secondarySteelMat = new THREE.MeshStandardMaterial({
    color: 0x475569,
    metalness: 0.85,
    roughness: 0.34,
    roughnessMap: textures.brushedRoughness,
  });
  const mattePlinthMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    metalness: 0.12,
    roughness: 0.78,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: 0x6c63ff,
    metalness: 0.3,
    roughness: 0.28,
  });
  disposables.materials.push(primaryMetalMat, secondarySteelMat, mattePlinthMat, accentMat);

  const applyFinish = (preset: FinishPreset) => {
    if (preset === "brass") {
      primaryMetalMat.color.setHex(0xd4a44a);
      secondarySteelMat.color.setHex(0x475569);
      accentMat.color.setHex(0x6c63ff);
    } else {
      primaryMetalMat.color.setHex(0xcbd5e1);
      secondarySteelMat.color.setHex(0x1e293b);
      accentMat.color.setHex(0x55c2ff);
    }
  };

  if (topic === "orrery") {
    addContactShadow(root, textures, 2.3, disposables);

    // Part 1: Lathe-turned mahogany/slate pedestal base (bottom-center grounded at y=0)
    const lathePts = [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(1.45, 0),
      new THREE.Vector2(1.4, 0.14),
      new THREE.Vector2(1.18, 0.22),
      new THREE.Vector2(1.12, 0.36),
      new THREE.Vector2(0.45, 0.52),
      new THREE.Vector2(0.32, 0.95),
      new THREE.Vector2(0.55, 1.08),
      new THREE.Vector2(0, 1.08),
    ];
    const baseGeo = new THREE.LatheGeometry(lathePts, 48);
    const baseMesh = new THREE.Mesh(baseGeo, mattePlinthMat);
    const baseGroup = new THREE.Group();
    baseGroup.add(baseMesh);
    registerExplodable(
      baseGroup,
      [0, -0.35, 0],
      {
        name: "Turned Calibrated Pedestal",
        summary: "Weighted slate-finish base anchoring the central heliocentric drive spindle.",
      },
      clickables
    );
    root.add(baseGroup);
    disposables.geometries.push(baseGeo);

    // Part 2: Beveled extruded planetary drive gear ring
    const gearShape = new THREE.Shape();
    const teeth = 24;
    for (let i = 0; i < teeth * 2; i++) {
      const ang = (i / (teeth * 2)) * Math.PI * 2;
      const r = i % 2 === 0 ? 1.18 : 1.04;
      const x = Math.cos(ang) * r;
      const y = Math.sin(ang) * r;
      if (i === 0) gearShape.moveTo(x, y);
      else gearShape.lineTo(x, y);
    }
    gearShape.closePath();
    const hole = new THREE.Path();
    hole.absarc(0, 0, 0.62, 0, Math.PI * 2, true);
    gearShape.holes.push(hole);

    const gearGeo = new THREE.ExtrudeGeometry(gearShape, {
      depth: 0.1,
      bevelEnabled: true,
      bevelThickness: 0.025,
      bevelSize: 0.02,
      bevelSegments: 2,
    });
    gearGeo.rotateX(Math.PI / 2);
    const gearGroup = new THREE.Group();
    gearGroup.position.set(0, 1.16, 0);
    gearGroup.add(new THREE.Mesh(gearGeo, primaryMetalMat));
    registerExplodable(
      gearGroup,
      [0, 0.22, 0],
      {
        name: "Epicyclic Brass Gear Ring",
        summary: "24-tooth bevel-machined gear ring synchronizing planetary angular velocity.",
      },
      clickables
    );
    root.add(gearGroup);
    disposables.geometries.push(gearGeo);

    // Part 3: Solar Core & Armillary Cage
    const sunGroup = new THREE.Group();
    sunGroup.position.set(0, 1.85, 0);
    const sunGeo = new THREE.SphereGeometry(0.42, 32, 32);
    const sunMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xf97316,
      emissiveIntensity: 0.75,
      roughness: 0.35,
      metalness: 0.1,
    });
    const coronaGeo = new THREE.TorusGeometry(0.56, 0.022, 16, 64);
    const sunSphere = new THREE.Mesh(sunGeo, sunMat);
    const corona1 = new THREE.Mesh(coronaGeo, primaryMetalMat);
    corona1.rotation.x = Math.PI / 3;
    const corona2 = new THREE.Mesh(coronaGeo, secondarySteelMat);
    corona2.rotation.y = Math.PI / 4;
    sunGroup.add(sunSphere, corona1, corona2);
    registerExplodable(
      sunGroup,
      [0, 0.85, 0],
      {
        name: "Heliocentric Solar Core",
        summary: "G-type stellar anchor surrounded by intersecting brass armillary meridian rings.",
      },
      clickables
    );
    root.add(sunGroup);
    disposables.geometries.push(sunGeo, coronaGeo);
    disposables.materials.push(sunMat);

    // Part 4: Earth + Moon Orbital Arm Assembly
    const earthPivot = new THREE.Group();
    earthPivot.position.set(0, 1.85, 0);
    const armCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -0.58, 0),
      new THREE.Vector3(0.75, -0.5, 0),
      new THREE.Vector3(1.38, -0.18, 0),
      new THREE.Vector3(1.48, 0, 0),
    ]);
    const armGeo = new THREE.TubeGeometry(armCurve, 32, 0.032, 12, false);
    const earthGeo = new THREE.SphereGeometry(0.21, 28, 28);
    const earthMat = new THREE.MeshStandardMaterial({
      color: 0x3b82f6,
      roughness: 0.48,
      metalness: 0.15,
    });
    const moonGeo = new THREE.SphereGeometry(0.068, 20, 20);
    const moonMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.82,
      metalness: 0.05,
    });
    const earthArmMesh = new THREE.Mesh(armGeo, secondarySteelMat);
    const earthMesh = new THREE.Mesh(earthGeo, earthMat);
    earthMesh.position.set(1.48, 0.06, 0);
    const moonPivot = new THREE.Group();
    moonPivot.position.copy(earthMesh.position);
    const moonMesh = new THREE.Mesh(moonGeo, moonMat);
    moonMesh.position.set(0.36, 0.05, 0);
    moonPivot.add(moonMesh);

    const earthAssembly = new THREE.Group();
    earthAssembly.add(earthArmMesh, earthMesh, moonPivot);
    earthPivot.add(earthAssembly);
    registerExplodable(
      earthAssembly,
      [0.85, 0.45, 0],
      {
        name: "Earth-Moon Orbital Assembly",
        summary: "Models Earth's 1 AU orbit around the Sun alongside the lunar sidereal cycle.",
      },
      clickables
    );
    root.add(earthPivot);
    disposables.geometries.push(armGeo, earthGeo, moonGeo);
    disposables.materials.push(earthMat, moonMat);

    // Part 5: Ringed Outer Planet (Saturn) Assembly
    const saturnPivot = new THREE.Group();
    saturnPivot.position.set(0, 1.85, 0);
    saturnPivot.rotation.y = Math.PI * 0.85;
    const saturnArmCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -0.66, 0),
      new THREE.Vector3(1.15, -0.58, 0),
      new THREE.Vector3(2.15, -0.2, 0),
      new THREE.Vector3(2.32, 0, 0),
    ]);
    const satArmGeo = new THREE.TubeGeometry(saturnArmCurve, 32, 0.028, 12, false);
    const satGeo = new THREE.SphereGeometry(0.26, 28, 28);
    const satMat = new THREE.MeshStandardMaterial({
      color: 0xeab308,
      roughness: 0.52,
      metalness: 0.12,
    });
    const ringGeo = new THREE.RingGeometry(0.34, 0.56, 48);
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0xfde68a,
      roughness: 0.65,
      metalness: 0.1,
      side: THREE.DoubleSide,
    });
    const satBody = new THREE.Mesh(satGeo, satMat);
    satBody.position.set(2.32, 0.08, 0);
    const satRings = new THREE.Mesh(ringGeo, ringMat);
    satRings.position.copy(satBody.position);
    satRings.rotation.set(Math.PI / 2.4, 0.35, 0);

    const saturnAssembly = new THREE.Group();
    saturnAssembly.add(new THREE.Mesh(satArmGeo, primaryMetalMat), satBody, satRings);
    saturnPivot.add(saturnAssembly);
    registerExplodable(
      saturnAssembly,
      [-0.85, 0.55, 0.4],
      {
        name: "Outer Ringed Gas Giant",
        summary: "Demonstrates wider-radius Keplerian orbital period and 26.7 deg ring inclination.",
      },
      clickables
    );
    root.add(saturnPivot);
    disposables.geometries.push(satArmGeo, satGeo, ringGeo);
    disposables.materials.push(satMat, ringMat);

    // Part 6: Orbital Track Rings + Instanced Asteroid Belt (>20 instances)
    const orbitTrackGeo = new THREE.TorusGeometry(1.48, 0.012, 12, 96);
    const outerTrackGeo = new THREE.TorusGeometry(2.32, 0.012, 12, 112);
    const track1 = new THREE.Mesh(orbitTrackGeo, accentMat);
    track1.rotation.x = Math.PI / 2;
    track1.position.y = 1.85;
    const track2 = new THREE.Mesh(outerTrackGeo, accentMat);
    track2.rotation.x = Math.PI / 2;
    track2.position.y = 1.85;
    root.add(track1, track2);
    disposables.geometries.push(orbitTrackGeo, outerTrackGeo);

    const stars = createStarfieldInstances(disposables);
    root.add(stars);

    const update = (elapsed: number, dt: number, speedMultiplier: number, explodeProgress: number) => {
      gearGroup.rotation.y += dt * 0.45 * speedMultiplier;
      corona1.rotation.z += dt * 0.6 * speedMultiplier;
      corona2.rotation.x += dt * 0.4 * speedMultiplier;
      earthPivot.rotation.y += dt * 0.72 * speedMultiplier;
      moonPivot.rotation.y += dt * 2.1 * speedMultiplier;
      saturnPivot.rotation.y += dt * 0.32 * speedMultiplier;
      stars.rotation.y = elapsed * 0.04 * speedMultiplier;

      for (const obj of clickables) {
        const base = obj.userData.basePos as THREE.Vector3;
        const off = obj.userData.explodeOffset as THREE.Vector3;
        obj.position.set(
          base.x + off.x * explodeProgress,
          base.y + off.y * explodeProgress,
          base.z + off.z * explodeProgress
        );
      }
    };

    return { root, clickables, disposables, update, applyFinish };
  }

  if (topic === "cell") {
    addContactShadow(root, textures, 2.2, disposables);

    // Part 1: Specimen Dish Base (LatheGeometry grounded at y=0)
    const dishPts = [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(1.65, 0),
      new THREE.Vector2(1.72, 0.14),
      new THREE.Vector2(1.52, 0.24),
      new THREE.Vector2(0.58, 0.28),
      new THREE.Vector2(0.48, 0.58),
      new THREE.Vector2(0, 0.58),
    ];
    const dishGeo = new THREE.LatheGeometry(dishPts, 48);
    const dishGroup = new THREE.Group();
    dishGroup.add(new THREE.Mesh(dishGeo, mattePlinthMat));
    registerExplodable(
      dishGroup,
      [0, -0.35, 0],
      {
        name: "Microscopy Stage Mount",
        summary: "Anodized specimen mount grounding the cutaway eukaryotic cell at bottom-center.",
      },
      clickables
    );
    root.add(dishGroup);
    disposables.geometries.push(dishGeo);

    // Part 2: Cutaway Plasma Membrane (Hemisphere + Inner Cytosol Bowl)
    const membraneGroup = new THREE.Group();
    membraneGroup.position.set(0, 1.48, 0);
    const outerMemGeo = new THREE.SphereGeometry(1.38, 42, 32, 0, Math.PI * 1.45, 0, Math.PI);
    const membraneMat = new THREE.MeshPhysicalMaterial({
      color: 0x55c2ff,
      roughness: 0.18,
      metalness: 0.05,
      bumpMap: textures.cellBump,
      bumpScale: 0.025,
      transmission: isSoftwareGl ? 0 : 0.72,
      transparent: true,
      opacity: isSoftwareGl ? 0.42 : 0.92,
      ior: 1.42,
      thickness: 0.6,
      clearcoat: 1.0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const cytosolGeo = new THREE.CylinderGeometry(1.3, 1.15, 0.18, 42);
    const cytosolMat = new THREE.MeshStandardMaterial({
      color: 0xe0e7ff,
      roughness: 0.65,
      metalness: 0.04,
      transparent: true,
      opacity: 0.78,
    });
    const membraneMesh = new THREE.Mesh(outerMemGeo, membraneMat);
    membraneMesh.renderOrder = 3;
    const cytosolDisc = new THREE.Mesh(cytosolGeo, cytosolMat);
    cytosolDisc.position.y = -0.32;
    membraneGroup.add(membraneMesh, cytosolDisc);
    registerExplodable(
      membraneGroup,
      [0, 0.95, 0],
      {
        name: "Phospholipid Plasma Membrane",
        summary: "Semi-permeable bilayer regulating ion transport, nutrient uptake, and cell signaling.",
      },
      clickables
    );
    root.add(membraneGroup);
    disposables.geometries.push(outerMemGeo, cytosolGeo);
    disposables.materials.push(membraneMat, cytosolMat);

    // Part 3: Nucleus + Nucleolus Cutaway
    const nucleusGroup = new THREE.Group();
    nucleusGroup.position.set(-0.08, 1.48, -0.05);
    const nucShellGeo = new THREE.SphereGeometry(0.48, 32, 24, 0, Math.PI * 1.55);
    const nucMat = new THREE.MeshStandardMaterial({
      color: 0x6c63ff,
      roughness: 0.42,
      metalness: 0.12,
      bumpMap: textures.cellBump,
      bumpScale: 0.02,
      side: THREE.DoubleSide,
    });
    const nucleolusGeo = new THREE.SphereGeometry(0.2, 24, 24);
    const nucleolusMat = new THREE.MeshStandardMaterial({
      color: 0x312e81,
      roughness: 0.68,
      metalness: 0.05,
    });
    nucleusGroup.add(new THREE.Mesh(nucShellGeo, nucMat), new THREE.Mesh(nucleolusGeo, nucleolusMat));
    registerExplodable(
      nucleusGroup,
      [0, 0.35, 0],
      {
        name: "Cell Nucleus & Nucleolus",
        summary: "Houses chromosomal DNA inside a double nuclear envelope; nucleolus synthesizes rRNA.",
      },
      clickables
    );
    root.add(nucleusGroup);
    disposables.geometries.push(nucShellGeo, nucleolusGeo);
    disposables.materials.push(nucMat, nucleolusMat);

    // Part 4: Rough Endoplasmic Reticulum (TubeGeometry ribbon folds)
    const erGroup = new THREE.Group();
    erGroup.position.set(0.32, 1.38, 0.25);
    const erCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.18, 0.12, -0.25),
      new THREE.Vector3(0.28, 0.06, -0.1),
      new THREE.Vector3(0.32, -0.04, 0.25),
      new THREE.Vector3(-0.05, -0.1, 0.38),
      new THREE.Vector3(0.18, 0.18, 0.32),
    ]);
    const erGeo = new THREE.TubeGeometry(erCurve, 44, 0.075, 12, false);
    const erMat = new THREE.MeshStandardMaterial({
      color: 0x0ea5e9,
      roughness: 0.55,
      metalness: 0.08,
    });
    erGroup.add(new THREE.Mesh(erGeo, erMat));
    registerExplodable(
      erGroup,
      [0.82, 0.25, 0.55],
      {
        name: "Rough Endoplasmic Reticulum",
        summary: "Ribosome-studded folded cisternae translating and folding secreted proteins.",
      },
      clickables
    );
    root.add(erGroup);
    disposables.geometries.push(erGeo);
    disposables.materials.push(erMat);

    // Part 5: Mitochondria Pair (Outer capsule + inner cristae folds)
    const mitoGroup = new THREE.Group();
    mitoGroup.position.set(-0.72, 1.36, 0.42);
    const mitoOuterGeo = new THREE.CapsuleGeometry(0.16, 0.32, 12, 24);
    const mitoCristaeGeo = new THREE.TorusKnotGeometry(0.08, 0.022, 40, 8, 2, 3);
    const mitoMat = new THREE.MeshStandardMaterial({
      color: 0xf97316,
      roughness: 0.38,
      metalness: 0.15,
    });
    const cristaeMat = new THREE.MeshStandardMaterial({
      color: 0xfef3c7,
      roughness: 0.72,
      metalness: 0.05,
    });
    const mito1 = new THREE.Mesh(mitoOuterGeo, mitoMat);
    mito1.rotation.z = Math.PI / 2.6;
    const cris1 = new THREE.Mesh(mitoCristaeGeo, cristaeMat);
    cris1.position.y = 0.06;
    mitoGroup.add(mito1, cris1);
    registerExplodable(
      mitoGroup,
      [-0.9, 0.28, 0.5],
      {
        name: "Mitochondrion (ATP Powerhouse)",
        summary: "Folded inner cristae maximize surface area for oxidative phosphorylation and ATP synthesis.",
      },
      clickables
    );
    root.add(mitoGroup);
    disposables.geometries.push(mitoOuterGeo, mitoCristaeGeo);
    disposables.materials.push(mitoMat, cristaeMat);

    // Part 6: Golgi Apparatus Stacked Sacs
    const golgiGroup = new THREE.Group();
    golgiGroup.position.set(0.68, 1.36, -0.52);
    const golgiMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      roughness: 0.45,
      metalness: 0.12,
    });
    const sacGeo = new THREE.TorusGeometry(0.22, 0.042, 12, 32, Math.PI * 1.15);
    for (let s = 0; s < 3; s++) {
      const sac = new THREE.Mesh(sacGeo, golgiMat);
      sac.position.y = (s - 1) * 0.1;
      sac.rotation.x = Math.PI / 2;
      sac.scale.setScalar(1 - s * 0.14);
      golgiGroup.add(sac);
    }
    registerExplodable(
      golgiGroup,
      [0.85, 0.3, -0.65],
      {
        name: "Golgi Apparatus",
        summary: "Modifies, sorts, and packages proteins and lipids into secretory vesicles.",
      },
      clickables
    );
    root.add(golgiGroup);
    disposables.geometries.push(sacGeo);
    disposables.materials.push(golgiMat);

    // Part 7: Instanced Ribosome & Vesicle Granules (>20 items)
    const riboCount = 48;
    const riboGeo = new THREE.SphereGeometry(0.032, 10, 10);
    const riboMat = new THREE.MeshStandardMaterial({ color: 0x818cf8, roughness: 0.5, metalness: 0.1 });
    const riboInst = new THREE.InstancedMesh(riboGeo, riboMat, riboCount);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < riboCount; i++) {
      const a = i * 2.39996;
      const r = 0.55 + (i % 7) * 0.085;
      dummy.position.set(Math.cos(a) * r, 1.2 + Math.sin(i * 1.3) * 0.32, Math.sin(a) * r);
      dummy.scale.setScalar(0.8 + (i % 4) * 0.15);
      dummy.updateMatrix();
      riboInst.setMatrixAt(i, dummy.matrix);
    }
    riboInst.instanceMatrix.needsUpdate = true;
    riboInst.computeBoundingSphere();
    root.add(riboInst);
    disposables.geometries.push(riboGeo);
    disposables.materials.push(riboMat);

    const update = (elapsed: number, dt: number, speedMultiplier: number, explodeProgress: number) => {
      mitoGroup.rotation.y += dt * 0.35 * speedMultiplier;
      golgiGroup.rotation.y -= dt * 0.25 * speedMultiplier;
      nucleusGroup.rotation.y += dt * 0.18 * speedMultiplier;
      riboInst.rotation.y = elapsed * 0.08 * speedMultiplier;

      for (const obj of clickables) {
        const base = obj.userData.basePos as THREE.Vector3;
        const off = obj.userData.explodeOffset as THREE.Vector3;
        obj.position.set(
          base.x + off.x * explodeProgress,
          base.y + off.y * explodeProgress,
          base.z + off.z * explodeProgress
        );
      }
    };

    return { root, clickables, disposables, update, applyFinish };
  }

  // Topic 3: Stirling Heat Engine (Physics & Thermodynamics)
  addContactShadow(root, textures, 2.35, disposables);

  // Part 1: Beveled Cast-Iron Engine Bedplate (grounded at y=0)
  const bedShape = new THREE.Shape();
  bedShape.moveTo(-1.75, -0.85);
  bedShape.lineTo(1.75, -0.85);
  bedShape.lineTo(1.75, 0.85);
  bedShape.lineTo(-1.75, 0.85);
  bedShape.closePath();
  const bedGeo = new THREE.ExtrudeGeometry(bedShape, {
    depth: 0.22,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.04,
    bevelSegments: 3,
  });
  bedGeo.rotateX(Math.PI / 2);
  const bedGroup = new THREE.Group();
  bedGroup.position.set(0, 0.26, 0);
  bedGroup.add(new THREE.Mesh(bedGeo, mattePlinthMat));
  registerExplodable(
    bedGroup,
    [0, -0.35, 0],
    {
      name: "Machined Cast-Iron Bedplate",
      summary: "Vibration-damping engine plinth aligning the hot chamber, power cylinder, and bearing standards.",
    },
    clickables
  );
  root.add(bedGroup);
  disposables.geometries.push(bedGeo);

  // Part 2: Brass Heat Source & Finned Displacer Cylinder (LatheGeometry)
  const dispPts = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(0.52, 0),
    new THREE.Vector2(0.52, 0.45),
    new THREE.Vector2(0.64, 0.48),
    new THREE.Vector2(0.52, 0.53),
    new THREE.Vector2(0.64, 0.62),
    new THREE.Vector2(0.52, 0.67),
    new THREE.Vector2(0.64, 0.76),
    new THREE.Vector2(0.52, 0.82),
    new THREE.Vector2(0.48, 1.38),
    new THREE.Vector2(0, 1.38),
  ];
  const dispGeo = new THREE.LatheGeometry(dispPts, 40);
  const dispGroup = new THREE.Group();
  dispGroup.position.set(-0.88, 0.28, 0);
  const dispBody = new THREE.Mesh(dispGeo, primaryMetalMat);
  const burnerGlowGeo = new THREE.CylinderGeometry(0.32, 0.36, 0.16, 24);
  const burnerGlowMat = new THREE.MeshStandardMaterial({
    color: 0xf97316,
    emissive: 0xea580c,
    emissiveIntensity: 0.9,
    roughness: 0.4,
  });
  const burnerGlow = new THREE.Mesh(burnerGlowGeo, burnerGlowMat);
  burnerGlow.position.y = 0.08;
  dispGroup.add(dispBody, burnerGlow);
  registerExplodable(
    dispGroup,
    [-0.95, 0.3, 0],
    {
      name: "Finned Displacer & Heat Chamber",
      summary: "Shuttles working gas between the heated lower cap and upper cooling radiator fins.",
    },
    clickables
  );
  root.add(dispGroup);
  disposables.geometries.push(dispGeo, burnerGlowGeo);
  disposables.materials.push(burnerGlowMat);

  // Part 3: Vertical Power Cylinder + Transfer Tube
  const powerGroup = new THREE.Group();
  powerGroup.position.set(0.08, 0.28, 0);
  const cylMat = new THREE.MeshPhysicalMaterial({
    color: 0xdbeafe,
    roughness: 0.12,
    metalness: 0.05,
    transmission: isSoftwareGl ? 0 : 0.8,
    transparent: true,
    opacity: isSoftwareGl ? 0.38 : 0.95,
    ior: 1.52,
    thickness: 0.4,
    depthWrite: false,
  });
  const powerCylGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.92, 32);
  const powerCyl = new THREE.Mesh(powerCylGeo, cylMat);
  powerCyl.position.y = 0.65;
  powerCyl.renderOrder = 2;

  const transferCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.62, 0.72, 0),
    new THREE.Vector3(-0.32, 0.78, 0),
    new THREE.Vector3(0, 0.35, 0),
  ]);
  const transferGeo = new THREE.TubeGeometry(transferCurve, 24, 0.055, 12, false);
  const transferPipe = new THREE.Mesh(transferGeo, primaryMetalMat);

  const pistonGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.22, 24);
  const pistonMesh = new THREE.Mesh(pistonGeo, secondarySteelMat);
  pistonMesh.position.y = 0.68;

  powerGroup.add(powerCyl, transferPipe, pistonMesh);
  registerExplodable(
    powerGroup,
    [0, 0.75, 0],
    {
      name: "Borosilicate Power Cylinder & Piston",
      summary: "Thermal pressure pulses drive the sealed power piston upward on the expansion stroke.",
    },
    clickables
  );
  root.add(powerGroup);
  disposables.geometries.push(powerCylGeo, transferGeo, pistonGeo);
  disposables.materials.push(cylMat);

  // Part 4: Twin A-Frame Bearing Standards + Crankshaft
  const standGroup = new THREE.Group();
  standGroup.position.set(0.85, 0.28, 0);
  const pillarGeo = new THREE.CylinderGeometry(0.07, 0.11, 1.52, 18);
  const pLeft = new THREE.Mesh(pillarGeo, secondarySteelMat);
  pLeft.position.set(0, 0.76, 0.36);
  const pRight = new THREE.Mesh(pillarGeo, secondarySteelMat);
  pRight.position.set(0, 0.76, -0.36);
  const shaftGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.92, 18);
  shaftGeo.rotateX(Math.PI / 2);
  const crankShaft = new THREE.Mesh(shaftGeo, primaryMetalMat);
  crankShaft.position.set(0, 1.48, 0);
  standGroup.add(pLeft, pRight, crankShaft);
  registerExplodable(
    standGroup,
    [0.55, 0.1, 0.45],
    {
      name: "Twin Bearing Standards & Crankshaft",
      summary: "Supports the main rotational axis with 90-degree phase offset between displacer and piston.",
    },
    clickables
  );
  root.add(standGroup);
  disposables.geometries.push(pillarGeo, shaftGeo);

  // Part 5: Spoked Brass Flywheel (Rim + Hub + 6 Spokes)
  const flywheelGroup = new THREE.Group();
  flywheelGroup.position.set(0.85, 1.76, 0.38);
  const rimGeo = new THREE.TorusGeometry(0.72, 0.085, 18, 56);
  const hubGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.14, 24);
  hubGeo.rotateX(Math.PI / 2);
  const spokeGeo = new THREE.CylinderGeometry(0.032, 0.042, 1.36, 12);
  flywheelGroup.add(new THREE.Mesh(rimGeo, primaryMetalMat), new THREE.Mesh(hubGeo, secondarySteelMat));
  for (let s = 0; s < 3; s++) {
    const spoke = new THREE.Mesh(spokeGeo, primaryMetalMat);
    spoke.rotation.z = (s * Math.PI) / 3;
    flywheelGroup.add(spoke);
  }
  registerExplodable(
    flywheelGroup,
    [0.95, 0.5, 0.65],
    {
      name: "Spoked Inertia Flywheel",
      summary: "Stores rotational kinetic energy to carry the piston smoothly across top and bottom dead center.",
    },
    clickables
  );
  root.add(flywheelGroup);
  disposables.geometries.push(rimGeo, hubGeo, spokeGeo);

  // Part 6: Connecting Rod + Instanced Radiator Micro-Pins (>20 items)
  const rodGeo = new THREE.CylinderGeometry(0.028, 0.028, 0.95, 12);
  const rodMesh = new THREE.Mesh(rodGeo, accentMat);
  rodMesh.position.set(0.46, 1.34, 0.15);
  rodMesh.rotation.z = 0.62;
  root.add(rodMesh);
  disposables.geometries.push(rodGeo);

  const pinCount = 36;
  const pinGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.12, 8);
  const pinInst = new THREE.InstancedMesh(pinGeo, primaryMetalMat, pinCount);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < pinCount; i++) {
    const row = Math.floor(i / 12);
    const a = ((i % 12) / 12) * Math.PI * 2;
    dummy.position.set(-0.88 + Math.cos(a) * 0.62, 0.78 + row * 0.15, Math.sin(a) * 0.62);
    dummy.rotation.set(0, 0, Math.PI / 2);
    dummy.updateMatrix();
    pinInst.setMatrixAt(i, dummy.matrix);
  }
  pinInst.instanceMatrix.needsUpdate = true;
  pinInst.computeBoundingSphere();
  root.add(pinInst);
  disposables.geometries.push(pinGeo);

  let phase = 0;
  const update = (_elapsed: number, dt: number, speedMultiplier: number, explodeProgress: number) => {
    phase += dt * 3.4 * speedMultiplier;
    flywheelGroup.rotation.z -= dt * 3.4 * speedMultiplier;
    crankShaft.rotation.z -= dt * 3.4 * speedMultiplier;

    const pistonStroke = Math.sin(phase) * 0.16;
    pistonMesh.position.y = 0.68 + pistonStroke;
    rodMesh.position.y = 1.34 + pistonStroke * 0.5;
    rodMesh.rotation.z = 0.62 + Math.cos(phase) * 0.14;
    burnerGlowMat.emissiveIntensity = 0.7 + Math.sin(phase * 2) * 0.25;

    for (const obj of clickables) {
      const base = obj.userData.basePos as THREE.Vector3;
      const off = obj.userData.explodeOffset as THREE.Vector3;
      obj.position.set(
        base.x + off.x * explodeProgress,
        base.y + off.y * explodeProgress,
        base.z + off.z * explodeProgress
      );
    }
  };

  return { root, clickables, disposables, update, applyFinish };
}

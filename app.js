import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { parseSTL, bounds, classifySupports, splitByMask, countRegions, frameWarning } from "./core.js";

const $ = (id) => document.getElementById(id);
const state = { target: null, withSupports: null, names: ["", ""] };

// ---------- upload boxes ----------
function showError(msg) { const e = $("error"); e.textContent = msg; e.style.display = msg ? "block" : "none"; }
function showWarning(msg) { const w = $("warning"); w.textContent = msg || ""; w.style.display = msg ? "block" : "none"; }

function setupDrop(n, onFile) {
  const zone = $("drop" + n), input = $("file" + n);
  ["dragenter", "dragover"].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove("over"); }));
  zone.addEventListener("drop", (e) => { const f = e.dataTransfer.files[0]; if (f) onFile(f); });
  input.addEventListener("change", () => { if (input.files[0]) onFile(input.files[0]); });
}
// stop the browser opening a file that is dropped outside the boxes
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => e.preventDefault());

async function handleFile(n, file) {
  showError("");
  try {
    if (!/\.stl$/i.test(file.name)) throw new Error("Please choose a .stl file.");
    const parsed = parseSTL(await file.arrayBuffer());
    if (n === 1) state.target = parsed; else state.withSupports = parsed;
    $("label" + n).textContent = file.name;
    $("sub" + n).textContent = parsed.count.toLocaleString() + " triangles loaded. Drop another file to replace it.";
    $("drop" + n).classList.add("loaded");
    maybeRun();
  } catch (err) {
    showError(file.name + ": " + err.message);
  }
}
setupDrop(1, (f) => handleFile(1, f));
setupDrop(2, (f) => handleFile(2, f));

// ---------- processing ----------
let diag = 1;
function tolFromSlider() {
  // slider 0..100 -> 0.02% .. 2% of the model diagonal (log scale), default 50 ~ 0.2%
  const frac = 0.0002 * Math.pow(100, $("tol").value / 100);
  return { tol: frac * diag, frac };
}
let debounce = null;
function maybeRun() {
  if (!state.target || !state.withSupports) return;
  diag = bounds(state.withSupports.pos).diag;
  showWarning(frameWarning(state.target.pos, state.withSupports.pos));
  $("result").style.display = "block";
  ensureScene();
  firstRender = true;                                         // reframe the camera for newly loaded files
  run();
}
function run() {
  const { tol, frac } = tolFromSlider();
  $("tolOut").textContent = (frac * 100).toFixed(2) + "% of size (" + tol.toPrecision(2) + " units)";
  const t0 = performance.now();
  const mask = classifySupports(state.target.pos, state.withSupports.pos, tol);
  const { part, support } = splitByMask(state.withSupports.pos, mask);
  const regions = support.length ? countRegions(support) : 0;
  const ms = performance.now() - t0;
  render(part, support);
  $("stats").textContent =
    "Part: " + (part.length / 9).toLocaleString() + " triangles.  Supports: " + (support.length / 9).toLocaleString() +
    " triangles in " + regions + " separate region" + (regions === 1 ? "" : "s") + ".  Processed in " + ms.toFixed(0) + " ms.";
  if (support.length === 0)
    showError("No supports found. The two files may be identical, or the tolerance is too large.");
  else showError("");
}
$("tol").addEventListener("input", () => {
  if (!state.target || !state.withSupports) return;
  const { tol, frac } = tolFromSlider();
  $("tolOut").textContent = (frac * 100).toFixed(2) + "% of size (" + tol.toPrecision(2) + " units)";
  clearTimeout(debounce);
  debounce = setTimeout(run, 150);
});

// ---------- 3D scene ----------
let renderer, scene, camera, controls, partMesh, supportMesh, centre = new THREE.Vector3(), dist = 1;
function ensureScene() {
  if (renderer) return;
  const box = $("viewer");
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  box.appendChild(renderer.domElement);
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xdfe5ec);
  camera = new THREE.PerspectiveCamera(40, 1, 0.01, 1e6);
  camera.up.set(0, 0, 1);                                    // STL files are normally Z-up
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 0.9));
  const d1 = new THREE.DirectionalLight(0xffffff, 1.0); d1.position.set(1, -1, 2); scene.add(d1);
  const d2 = new THREE.DirectionalLight(0xffffff, 0.5); d2.position.set(-1, 1, -0.5); scene.add(d2);
  const resize = () => {
    const w = box.clientWidth, h = box.clientHeight;
    renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
  };
  window.addEventListener("resize", resize); resize();
  (function loop() { requestAnimationFrame(loop); controls.update(); renderer.render(scene, camera); })();
  document.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));
  $("showPart").addEventListener("change", (e) => { if (partMesh) partMesh.visible = e.target.checked; });
  $("showSupport").addEventListener("change", (e) => { if (supportMesh) supportMesh.visible = e.target.checked; });
}

function makeMesh(pos, colour) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.computeVertexNormals();                                   // non-indexed => flat shading per triangle
  return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: colour, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.05 }));
}
function disposeMesh(m) { if (m) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); } }

let firstRender = true;
function render(part, support) {
  disposeMesh(partMesh); disposeMesh(supportMesh);
  partMesh = part.length ? makeMesh(part, 0x4a90d9) : null;
  supportMesh = support.length ? makeMesh(support, 0xe8590c) : null;
  if (partMesh) { partMesh.visible = $("showPart").checked; scene.add(partMesh); }
  if (supportMesh) { supportMesh.visible = $("showSupport").checked; scene.add(supportMesh); }
  if (firstRender) {                                          // keep the user's camera on later re-runs
    const b = bounds(state.withSupports.pos);
    centre.set((b.lo[0] + b.hi[0]) / 2, (b.lo[1] + b.hi[1]) / 2, (b.lo[2] + b.hi[2]) / 2);
    dist = 1.8 * b.diag;
    setView("iso");
    firstRender = false;
  }
}

const VIEWS = {
  iso: [1, -1, 0.8], front: [0, -1, 0], back: [0, 1, 0], right: [1, 0, 0], left: [-1, 0, 0],
  top: [0, -0.001, 1], bottom: [0, -0.001, -1],
};
function setView(name) {
  const v = new THREE.Vector3(...VIEWS[name]).normalize();
  camera.position.copy(centre).addScaledVector(v, dist);
  controls.target.copy(centre);
  camera.near = dist / 1000; camera.far = dist * 100; camera.updateProjectionMatrix();
  controls.update();
}

import * as T from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
const scene = new T.Scene();
scene.background = new T.Color("white");
const renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(1024, 1024, false);
renderer.setPixelRatio(1);
renderer.outputColorSpace = T.SRGBColorSpace;
renderer.debug.onShaderError = () => { throw new Error("Guide shader failed"); };
document.querySelector("#view").append(renderer.domElement);
const camera = new T.OrthographicCamera(-1, 1, 1, -1, .1, 30);
camera.position.set(0, .76 + 8 * Math.tan(8 * Math.PI / 180), 8);
camera.lookAt(0, .76, 0);
camera.updateMatrixWorld(true);
scene.add(new T.HemisphereLight(0xffffff, 0xffffff, 2));
const key = new T.DirectionalLight(0xffffff, .7);
key.position.set(-3, 7, 4);
scene.add(key);
const pivot = new T.Group();
scene.add(pivot);
const ids = ["front", "front-three-quarter", "right-profile", "back-right-three-quarter", "back", "back-left-three-quarter", "left-profile", "front-left-three-quarter"];
const status = document.querySelector("#status");
let model, product, scale, angle = 0;
async function guarded(action) { for (const b of document.querySelectorAll("button"))
    b.disabled = true; try {
    await action();
}
catch (e) {
    status.textContent = "ERROR: " + e.message;
    console.error(e);
}
finally {
    for (const b of document.querySelectorAll("button"))
        b.disabled = false;
} }
async function load(name) { product = name; angle = 0; if (model)
    pivot.remove(model); if(name === "mug") {
        const params = await (await fetch("/mug-proxy-parameters.json")).json();
        model = new T.Group();
        model.add(new T.Mesh(new T.LatheGeometry(params.bodyProfile.map(p=>new T.Vector2(...p)),96)));
        const curve = new T.CatmullRomCurve3(params.handlePath.map(p=>new T.Vector3(...p)));
        model.add(new T.Mesh(new T.TubeGeometry(curve,96,params.handleRadius,16,false)));
    } else if(name === "bag") {
        const p = await (await fetch("/bag-proxy-parameters.json")).json();
        model = new T.Group();
        const shape = new T.Shape();
        shape.moveTo(-.51,.04);shape.lineTo(.51,.04);shape.quadraticCurveTo(.55,.04,.55,.10);shape.lineTo(.46,.72);shape.quadraticCurveTo(.45,.78,.40,.78);shape.lineTo(-.40,.78);shape.quadraticCurveTo(-.45,.78,-.46,.72);shape.lineTo(-.55,.10);shape.quadraticCurveTo(-.55,.04,-.51,.04);
        const body = new T.ExtrudeGeometry(shape,{depth:p.body.depth,bevelEnabled:true,bevelSize:.04,bevelThickness:.04,bevelSegments:4,steps:1});body.translate(0,0,-p.body.depth/2);body.scale(1,p.body.verticalScale,1);model.add(new T.Mesh(body));
        for(const z of p.handleDepths){const curve = new T.CatmullRomCurve3(p.handlePath.map(v=>new T.Vector3(v[0],v[1],z)));model.add(new T.Mesh(new T.TubeGeometry(curve,80,p.handleRadius,12,false)));}
        const flap = new T.Shape();flap.moveTo(-.18,.81);flap.lineTo(.18,.81);flap.lineTo(.17,.51);flap.quadraticCurveTo(.17,.45,.10,.44);flap.lineTo(-.10,.44);flap.quadraticCurveTo(-.17,.45,-.17,.51);flap.closePath();const flapGeo = new T.ExtrudeGeometry(flap,{depth:.02,bevelEnabled:false});flapGeo.translate(0,0,.217);flapGeo.scale(1,p.body.verticalScale,1);model.add(new T.Mesh(flapGeo));
        const clasp = new T.Mesh(new T.BoxGeometry(.12,.07,.025));clasp.position.set(0,.55*p.body.verticalScale,.25);model.add(clasp);
    } else model = (await new GLTFLoader().loadAsync("/doll-proxy.glb")).scene; const box = new T.Box3().setFromObject(model); const h = box.max.y - box.min.y; let radius = 0; model.traverse(o => { if (!o.isMesh)
    return; o.geometry.computeVertexNormals(); o.material = new T.MeshStandardMaterial({ color: 0x999999, roughness: 1 }); const a = o.geometry.attributes.position; for (let i = 0; i < a.count; i++)
    radius = Math.max(radius, Math.hypot(a.getX(i), a.getZ(i))); }); scale = Math.min(1.58 / (2 * radius), 1.50 / (h * Math.cos(8 * Math.PI / 180) + 2 * radius * Math.sin(8 * Math.PI / 180))); model.scale.setScalar(scale); pivot.add(model); draw(); }
function draw() { pivot.rotation.y = -angle * Math.PI / 180; renderer.render(scene, camera); status.textContent = product + " guide " + angle + " degrees"; }
async function save(name, body) { const response = await fetch("/save/" + name, { method: "POST", body }); if (!response.ok)
    throw new Error("Guide save failed: " + response.status); }
async function capture() { const record = { product, purpose: "orientation-only", scale, camera: { projection: "orthographic", elevationDegrees: 8, target: [0, .76, 0], position: camera.position.toArray() }, frames: [] }; for (let i = 0; i < 8; i++) {
    angle = i * 45;
    draw();
    await new Promise(resolve => requestAnimationFrame(resolve));
    record.frames.push({ id: ids[i], degrees: angle, rotationY: pivot.rotation.y, cameraMatrix: camera.matrixWorld.toArray(), projectionMatrix: camera.projectionMatrix.toArray() });
    await save(product + "-guide-" + ids[i] + ".png", await new Promise(resolve => renderer.domElement.toBlob(resolve, "image/png")));
} await save(product + "-guide-rig.json", JSON.stringify(record, null, 2)); status.textContent = "Captured " + product + " eight textureless guides"; }
document.querySelector("#mug").onclick = () => guarded(() => load("mug"));
document.querySelector("#doll").onclick = () => guarded(() => load("doll"));
document.querySelector("#bag").onclick = () => guarded(() => load("bag"));
document.querySelector("#capture").onclick = () => guarded(capture);
await guarded(() => load("mug"));

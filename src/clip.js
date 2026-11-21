// The exported viewer consumes recorded poses. Its only dependencies are the
// same renderer and sampler the studio uses, embedded by makeClip below.
function playClip() {
  const { frames, settings } = JSON.parse(
    document.getElementById("data").textContent,
  );
  const tape = new ReplayTape();
  tape.frames = frames;
  const canvas = document.querySelector("canvas");
  const renderer = new PhysicsRenderer(canvas);
  const { yaw, pitch, zoom } = settings.view;
  const base = renderer.getView();
  renderer.orbit((base.yaw - yaw) / 0.0075, (pitch - base.pitch) / 0.006);
  renderer.setZoom(zoom);
  const slider = document.querySelector("input"),
    play = document.querySelector("#play"),
    rate = document.querySelector("select");
  slider.max = frames.length - 1;
  rate.value = settings.rate;
  let time = 0,
    last = 0,
    raf = 0,
    drag = null;
  let playing = !matchMedia("(prefers-reduced-motion:reduce)").matches;
  function draw(now) {
    raf = 0;
    if (playing && last)
      time = Math.min(
        tape.duration,
        time + ((now - last) / 1000) * Number(rate.value),
      );
    if (time >= tape.duration) playing = false;
    last = playing ? now : 0;
    const frame = tape.sample(time);
    renderer.render(frame.items, settings);
    slider.value = Math.round(time * ReplayTape.fps);
    document.querySelector("output").textContent =
      time.toFixed(2) + " / " + tape.duration.toFixed(2) + " sn";
    play.textContent = playing
      ? "Durdur"
      : time >= tape.duration
        ? "Baştan izle"
        : "Oynat";
    if (playing) schedule();
  }
  function schedule() {
    if (!raf && !document.hidden) raf = requestAnimationFrame(draw);
  }
  document.querySelector("h1").textContent = settings.name;
  play.onclick = () => {
    if (time >= tape.duration) time = 0;
    playing = !playing;
    last = 0;
    schedule();
  };
  slider.oninput = () => {
    time = Number(slider.value) / ReplayTape.fps;
    playing = false;
    schedule();
  };
  canvas.onpointerdown = (e) => {
    if (!e.isPrimary) return;
    drag = [e.clientX, e.clientY];
    canvas.setPointerCapture(e.pointerId);
  };
  canvas.onpointermove = (e) => {
    if (!drag || !e.isPrimary) return;
    renderer.orbit(e.clientX - drag[0], e.clientY - drag[1]);
    drag = [e.clientX, e.clientY];
    schedule();
  };
  canvas.onpointerup =
    canvas.onpointercancel =
    canvas.onlostpointercapture =
      () => {
        drag = null;
      };
  canvas.onwheel = (e) => {
    e.preventDefault();
    renderer.setZoom(renderer.getView().zoom * Math.exp(-e.deltaY * 0.0015));
    schedule();
  };
  canvas.onkeydown = (e) => {
    const orbit = {
      ArrowLeft: [-12, 0],
      ArrowRight: [12, 0],
      ArrowUp: [0, -12],
      ArrowDown: [0, 12],
    }[e.key];
    if (orbit) {
      e.preventDefault();
      renderer.orbit(...orbit);
      schedule();
    }
  };
  document.onvisibilitychange = () => {
    last = 0;
    if (document.hidden) {
      cancelAnimationFrame(raf);
      raf = 0;
    } else schedule();
  };
  new ResizeObserver(schedule).observe(canvas);
  schedule();
}

function makeClip(tape, settings) {
  const data = JSON.stringify({
    settings,
    frames: tape.serialize(),
  }).replaceAll("<", "\\u003c");
  const script =
    "(" +
    PhysicsRenderer.install.toString() +
    ")();\n" +
    ReplayTape.toString() +
    "\n(" +
    playClip.toString() +
    ")();";
  return `<!doctype html>
<!--
${document.getElementById("glif-license").textContent.trim()}
-->
<html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Glif Studio · Çarpışma kaydı</title><style>
  *{box-sizing:border-box}body{margin:0;background:#101016;color:#eae4f3;font:15px system-ui;display:grid;grid-template-rows:auto minmax(180px,1fr) auto;min-height:100vh;height:100dvh}header,footer{padding:14px clamp(15px,4vw,60px);display:flex;align-items:center;gap:15px;background:#19171f}header{border-bottom:1px solid #403945}h1{font-size:20px;margin:0}small,output{color:#c0b0d1}canvas{width:100%;height:100%;min-height:0;touch-action:none;cursor:grab}input{flex:1;min-width:45px;accent-color:#c5a0ed}button,select{background:#352a40;color:#f0dfff;border:1px solid #66546f;border-radius:5px;padding:6px}output{font:12px monospace}@media(max-width:520px){footer{gap:6px;padding:10px}header{flex-wrap:wrap}output{font-size:10px}}</style>
  <header><small>Glif Studio</small><h1></h1></header><canvas tabindex="0" aria-label="Kamerayı sürükleyerek veya ok tuşlarıyla döndür"></canvas><footer><button id="play">Oynat</button><input type="range" min="0" step="1" value="0" aria-label="Kayıt zamanı"><output></output><select aria-label="İzleme hızı"><option value="0.25">0,25×</option><option value="0.5">0,5×</option><option value="1">1×</option></select></footer><script type="application/json" id="data">${data}</${"script"}><script>${script}</${"script"}></html>`;
}

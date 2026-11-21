(() => {
  "use strict";

  const el = (id) => document.getElementById(id);
  const canvas = el("scene");
  const viewport = el("viewport");
  const presets = {
    kule: "Küp kuleleri",
    duvar: "Blok duvar",
    domino: "Domino sırası",
    yigin: "Küp yağmuru",
  };
  const palettes = {
    aurora: "Aurora",
    buz: "Buz",
    fosfor: "Fosfor",
    mono: "Monokrom",
  };
  const defaults = {
    palette: "aurora",
    density: 62,
    gravity: 50,
    restitution: 30,
    breakable: true,
  };
  const sliders = ["gravity", "restitution", "density"];
  const gravityText = (value) =>
    (value / 50).toLocaleString("tr-TR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + " g";
  const state = {
    ...defaults,
    mesh: "kule",
    running: !matchMedia("(prefers-reduced-motion: reduce)").matches,
    grid: true,
  };
  let material = "clay";
  const materialHelp = {
    clay: "Orta yoğunlukta, sert darbede kırılır.",
    glass: "Daha ağırdır, daha hafif darbede kırılır.",
    rubber: "Hafiftir, yükseğe seker ve bütün kalır.",
  };
  const tape = new ReplayTape();
  let reviewing = false,
    playingClip = false,
    cursor = 0;
  let lastMarkerLayout = "";
  const world = new window.SandboxWorld();
  const scene = new window.PhysicsRenderer(canvas);
  const meshButtons = [...document.querySelectorAll("button[data-mesh]")];
  const paletteButtons = [...document.querySelectorAll("button[data-palette]")];
  const pointers = new Map();
  let action = null;
  let hovered = null;
  let frame = 0;
  let lastTime = 0;
  let countedFrames = 0;
  let fpsStart = 0;
  let toastTimer;

  function labelButton(button, label) {
    button.title = label;
    button.setAttribute("aria-label", label);
  }
  function showText(id, value) {
    const element = el(id),
      text = String(value);
    if (element && element.textContent !== text) element.textContent = text;
  }
  function say(message) {
    const toast = el("toast");
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add("shown");
    toastTimer = setTimeout(() => toast.classList.remove("shown"), 2300);
  }

  world.onSample = (items, breaks) => tape.capture(items, breaks);
  function updateDeck() {
    const duration = tape.duration;
    const time = reviewing ? cursor : duration;
    const seek = el("seek");
    seek.max = Math.max(0, tape.frames.length - 1);
    seek.value = Math.round(time * ReplayTape.fps);
    seek.style.setProperty(
      "--fill",
      (duration ? (100 * time) / duration : 0) + "%",
    );
    seek.setAttribute("aria-valuetext", time.toFixed(2) + " saniye");
    seek.disabled =
      el("watch").disabled =
      el("saveReplay").disabled =
        duration === 0;
    showText(
      "recordLength",
      (reviewing ? time.toFixed(1) + " / " : "") + duration.toFixed(1) + " sn",
    );
    showText(
      "watch",
      reviewing ? (playingClip ? "Durdur" : "Oynat") : "Tekrarı izle",
    );
    el("backLive").hidden = !reviewing;
    const marks = [];
    for (let i = 1; i < tape.frames.length; i++) {
      if (tape.frames[i].breaks > tape.frames[i - 1].breaks)
        marks.push((100 * i) / (tape.frames.length - 1));
    }
    const layout = marks.join(",");
    if (layout !== lastMarkerLayout) {
      lastMarkerLayout = layout;
      el("impacts").replaceChildren(
        ...marks.map((left) => {
          const mark = document.createElement("i");
          mark.style.left = left + "%";
          return mark;
        }),
      );
    }
  }

  function review(time, play) {
    if (!tape.duration) return;
    cancelPointers();
    reviewing = true;
    playingClip = play;
    cursor = time;
    resetClock();
    showState();
    showInteraction();
  }
  function returnLive() {
    reviewing = playingClip = false;
    resetClock();
    showState();
    showInteraction();
  }
  el("watch").addEventListener("click", () =>
    review(reviewing && cursor < tape.duration ? cursor : 0, !playingClip),
  );
  el("seek").addEventListener("input", (event) =>
    review(Number(event.target.value) / ReplayTape.fps, false),
  );
  el("backLive").addEventListener("click", returnLive);
  el("rate").addEventListener("change", redraw);

  function draw() {
    const recorded = reviewing ? tape.sample(cursor) : null;
    const bodies = recorded ? recorded.items : world.items();
    const dims = scene.render(bodies, {
      selected: action?.kind === "grab" ? action.id : null,
      hovered,
      density: state.density,
      palette: state.palette,
      grid: state.grid,
    });
    showText("bodyCount", bodies.length);
    showText("breakCount", recorded ? recorded.breaks : world.breaks);
    updateDeck();
    if (dims) showText("gridSize", dims.cols + " × " + dims.rows);
  }

  function tick(now) {
    frame = 0;
    if (document.hidden) return;
    const dt = lastTime ? Math.min((now - lastTime) / 1000, 0.075) : 0;
    if (reviewing && playingClip) {
      cursor = Math.min(tape.duration, cursor + dt * Number(el("rate").value));
      if (cursor >= tape.duration) {
        playingClip = false;
        showState();
      }
    } else if (!reviewing && state.running) world.step(dt);
    lastTime = now;
    draw();
    const active = reviewing ? playingClip : state.running && world.isMoving();
    if (active) {
      if (!fpsStart) fpsStart = now;
      countedFrames++;
      const windowMs = now - fpsStart;
      if (windowMs >= 500) {
        showText("fps", Math.round((1000 * countedFrames) / windowMs));
        fpsStart = now;
        countedFrames = 0;
      }
      redraw();
    } else {
      resetClock();
      showText("fps", "0");
    }
  }

  function redraw() {
    if (!frame && !document.hidden) frame = requestAnimationFrame(tick);
  }
  function resetClock() {
    lastTime = 0;
    countedFrames = 0;
    fpsStart = 0;
  }

  function showCamera() {
    const { zoom, yaw, pitch } = scene.getView();
    showText("zoomValue", Math.round(100 * zoom) + "%");
    el("zoomIn").disabled = zoom >= 1.799;
    el("zoomOut").disabled = zoom <= 0.551;
    const cy = Math.cos(yaw),
      sy = Math.sin(yaw),
      cp = Math.cos(pitch),
      sp = Math.sin(pitch);
    const axes = { x: [cy, sy * sp], y: [0, -cp], z: [-sy, cy * sp] };
    for (const [axis, [x, y]] of Object.entries(axes)) {
      const line = document.querySelector('[data-axis-line="' + axis + '"]');
      const label = document.querySelector('[data-axis-label="' + axis + '"]');
      if (!line || !label) continue;
      line.setAttribute("x2", (x * 16).toFixed(2));
      line.setAttribute("y2", (y * 16).toFixed(2));
      label.setAttribute("x", (x * 23).toFixed(2));
      label.setAttribute("y", (y * 23).toFixed(2));
    }
  }

  function showState() {
    for (const button of [...meshButtons, ...paletteButtons]) {
      const selected =
        button.dataset.mesh === state.mesh ||
        button.dataset.palette === state.palette;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    }
    showText("meshTitle", presets[state.mesh]);
    showText("paletteName", palettes[state.palette]);
    for (const key of sliders) {
      const input = el(key);
      input.value = state[key];
      input.style.setProperty("--fill", state[key] + "%");
      const value =
        key === "gravity" ? gravityText(state.gravity) : "%" + state[key];
      showText(key + "Value", value);
      input.setAttribute("aria-valuetext", value);
    }
    el("breakable").checked = state.breakable;
    const moving = reviewing ? playingClip : state.running;
    const play = el("togglePlay");
    play.classList.toggle("paused", !moving);
    play.setAttribute("aria-pressed", String(moving));
    labelButton(
      play,
      moving ? "Simülasyonu duraklat (Boşluk)" : "Simülasyonu oynat (Boşluk)",
    );
    showText(
      "liveState",
      reviewing ? "Tekrar" : state.running ? "Canlı" : "Duraklatıldı",
    );
    el("liveBadge").classList.toggle("paused", !state.running);
    if (!state.running) showText("fps", "0");
    viewport.classList.toggle("grid-off", !state.grid);
    el("gridToggle").setAttribute("aria-pressed", String(state.grid));
    labelButton(
      el("gridToggle"),
      state.grid ? "Izgarayı gizle (G)" : "Izgarayı göster (G)",
    );
    showCamera();
    redraw();
  }

  function options() {
    world.setOptions({
      gravity: state.gravity,
      restitution: state.restitution,
      breakable: state.breakable,
    });
  }
  function resetSettings() {
    setMaterial("clay");
    Object.assign(state, defaults);
    options();
    showState();
    say("Fizik ve görünüm ayarları sıfırlandı.");
  }
  function selectPreset(mesh) {
    cancelPointers();
    reviewing = playingClip = false;
    state.mesh = mesh;
    world.loadPreset(mesh);
    options();
    tape.frames.length = 0;
    tape.capture(world.items(), 0);
    scene.resetView();
    resetClock();
    showState();
    draw();
  }
  function resetScene() {
    selectPreset(state.mesh);
    say("Sahne başlangıç düzeninde.");
  }
  function togglePlay() {
    if (reviewing) {
      review(cursor < tape.duration ? cursor : 0, !playingClip);
      return;
    }
    cancelPointers();
    state.running = !state.running;
    resetClock();
    showState();
  }
  function wakePlay() {
    if (!state.running) {
      state.running = true;
      resetClock();
      showState();
    }
  }
  function addCube(launch) {
    if (reviewing) returnLive();
    const id = launch ? world.launchCube(material) : world.addCube(material);
    if (id !== null && id !== undefined) {
      showText("bodyCount", world.items().length);
      wakePlay();
      say(launch ? "Küp fırlatıldı." : "Sahneye küp eklendi.");
    } else say("Sahnedeki cisim sınırına ulaşıldı.");
    redraw();
  }
  function toggleGrid() {
    state.grid = !state.grid;
    showState();
  }
  function changeZoom(value) {
    scene.setZoom(Math.max(0.55, Math.min(1.8, value)));
    showCamera();
    redraw();
  }
  function zoomBy(delta) {
    changeZoom(scene.getView().zoom + delta);
  }
  function orbit(dx, dy) {
    scene.orbit(dx, dy);
    showCamera();
    redraw();
  }

  function showInteraction() {
    const dragging = action?.kind === "grab";
    canvas.classList.toggle("is-dragging", !!action);
    canvas.classList.toggle("object-hover", hovered !== null);
    canvas.style.cursor = action
      ? "grabbing"
      : hovered !== null
        ? "grab"
        : "move";
    const grabHint =
      action?.pointerType === "touch"
        ? "Bırakarak fırlat"
        : "Bırakıp fırlat · Tekerlekle derinlik";
    showText(
      "interactionHint",
      reviewing
        ? "Sürükleyip kamerayı döndür"
        : dragging
          ? grabHint
          : "Küpü tut ve fırlat",
    );
  }

  // Keep the grabbed surface point on a plane parallel to the image plane at pick time.
  function pointOnPlane(clientX, clientY, interaction) {
    const ray = scene.getRay(clientX, clientY);
    const n = interaction.normal,
      p = interaction.anchor,
      o = ray.origin,
      d = ray.direction;
    const denom = d.x * n.x + d.y * n.y + d.z * n.z;
    if (Math.abs(denom) < 1e-5) return null;
    const distance =
      ((p.x - o.x) * n.x + (p.y - o.y) * n.y + (p.z - o.z) * n.z) / denom;
    if (!Number.isFinite(distance) || distance <= 0) return null;
    return {
      x: o.x + d.x * distance,
      y: o.y + d.y * distance,
      z: o.z + d.z * distance,
    };
  }
  function dragSample(event) {
    const p = pointOnPlane(event.clientX, event.clientY, action);
    if (!p) return;
    const t = event.timeStamp;
    const history = action.history;
    while (history.length && t - history[0].t > 120) history.shift();
    if (history.length && history.at(-1).t === t) history.pop();
    history.push({ p, t });
    world.moveGrab(p);
  }
  function throwVelocity(history) {
    // A short regression discounts single-event jitter and naturally releases at rest after a hold.
    if (history.length < 2 || history.at(-1).t - history[0].t < 8)
      return { x: 0, y: 0, z: 0 };
    let averageT = 0;
    const v = { x: 0, y: 0, z: 0 };
    for (const sample of history) averageT += sample.t / history.length;
    let divisor = 0;
    for (const { p, t } of history) {
      const dt = (t - averageT) / 1000;
      divisor += dt * dt;
      v.x += dt * p.x;
      v.y += dt * p.y;
      v.z += dt * p.z;
    }
    v.x /= divisor;
    v.y /= divisor;
    v.z /= divisor;
    const scale = Math.min(1, 23 / (Math.hypot(v.x, v.y, v.z) || 1));
    return { x: v.x * scale, y: v.y * scale, z: v.z * scale };
  }
  function cancelPointers() {
    if (action?.kind === "grab") world.cancelGrab();
    action = null;
    hovered = null;
    const captured = [...pointers.keys()];
    pointers.clear();
    for (const id of captured)
      if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    showInteraction();
    redraw();
  }
  function pinchDistance() {
    const [a, b] = pointers.values();
    return Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
  }

  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  canvas.addEventListener("pointerdown", (event) => {
    if (
      event.pointerType === "mouse" &&
      event.button !== 0 &&
      event.button !== 2
    )
      return;
    if (pointers.size >= 2 || pointers.has(event.pointerId)) return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    canvas.setPointerCapture(event.pointerId);
    if (pointers.size === 2) {
      if (action?.kind === "grab") world.cancelGrab();
      action = {
        kind: "pinch",
        distance: pinchDistance(),
        zoom: scene.getView().zoom,
      };
      hovered = null;
    } else {
      const hit =
        reviewing || event.button === 2
          ? null
          : world.pick(scene.getRay(event.clientX, event.clientY));
      if (hit) {
        action = {
          kind: "grab",
          id: hit.id,
          pointerType: event.pointerType,
          anchor: { ...hit.point },
          normal: { ...scene.getView().direction },
          history: [{ t: event.timeStamp, p: { ...hit.point } }],
        };
        world.grab(hit.id, hit.point);
        hovered = hit.id;
        if (!state.running) {
          wakePlay();
          say("Simülasyon devam ediyor.");
        }
      } else {
        action = { kind: "orbit" };
        hovered = null;
      }
    }
    showInteraction();
    redraw();
  });
  canvas.addEventListener("pointermove", (event) => {
    const prev = pointers.get(event.pointerId);
    if (!prev) {
      if (reviewing || pointers.size || event.pointerType === "touch") return;
      const hit = world.pick(scene.getRay(event.clientX, event.clientY));
      const id = hit?.id ?? null;
      if (id !== hovered) {
        hovered = id;
        showInteraction();
        redraw();
      }
      return;
    }
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (action?.kind === "pinch")
      changeZoom((action.zoom * pinchDistance()) / action.distance);
    if (action?.kind === "orbit")
      orbit(event.clientX - prev.x, event.clientY - prev.y);
    if (action?.kind === "grab") {
      for (const sample of event.getCoalescedEvents?.() || [])
        dragSample(sample);
      dragSample(event);
      redraw();
    }
  });
  canvas.addEventListener("pointerup", (event) => {
    if (!pointers.has(event.pointerId)) return;
    if (action?.kind === "grab") {
      dragSample(event);
      world.release(throwVelocity(action.history));
    }
    pointers.delete(event.pointerId);
    if (canvas.hasPointerCapture(event.pointerId))
      canvas.releasePointerCapture(event.pointerId);
    action = pointers.size ? { kind: "orbit" } : null;
    hovered = null;
    showInteraction();
    redraw();
  });
  canvas.addEventListener("pointercancel", (event) => {
    if (pointers.has(event.pointerId)) cancelPointers();
  });
  canvas.addEventListener("lostpointercapture", (event) => {
    if (pointers.has(event.pointerId)) cancelPointers();
  });
  canvas.addEventListener("pointerleave", () => {
    if (!pointers.size) {
      hovered = null;
      showInteraction();
      redraw();
    }
  });
  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const pixels =
        event.deltaY *
        (event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? canvas.clientHeight
            : 1);
      if (action?.kind === "grab") {
        const { normal: n, anchor: p } = action;
        const camera = scene.getView().position;
        const depth =
          (p.x - camera.x) * n.x +
          (p.y - camera.y) * n.y +
          (p.z - camera.z) * n.z;
        const next = Math.max(1.8, Math.min(26, depth + pixels * 0.009));
        const step = next - depth;
        p.x += n.x * step;
        p.y += n.y * step;
        p.z += n.z * step;
        const [pointer] = pointers.values();
        if (pointer)
          dragSample({
            clientX: pointer.x,
            clientY: pointer.y,
            timeStamp: event.timeStamp,
          });
        redraw();
      } else changeZoom(scene.getView().zoom * Math.exp(-pixels * 0.0015));
    },
    { passive: false },
  );
  window.addEventListener("blur", cancelPointers);
  document.addEventListener("visibilitychange", () => {
    resetClock();
    if (document.hidden) {
      cancelAnimationFrame(frame);
      frame = 0;
      cancelPointers();
    } else redraw();
  });

  el("togglePlay").addEventListener("click", togglePlay);
  labelButton(el("viewReset"), "Kamerayı sıfırla");
  el("viewReset").addEventListener("click", () => {
    cancelPointers();
    scene.resetView();
    showCamera();
    redraw();
  });
  el("resetScene").addEventListener("click", resetScene);
  el("resetSettings").addEventListener("click", resetSettings);
  labelButton(el("launchCube"), "Sahneye küp fırlat");
  el("launchCube").addEventListener("click", () => addCube(true));
  el("addCube").addEventListener("click", () => addCube(false));
  el("zoomIn").addEventListener("click", () => zoomBy(0.1));
  el("zoomOut").addEventListener("click", () => zoomBy(-0.1));
  el("gridToggle").addEventListener("click", toggleGrid);
  for (const button of meshButtons)
    button.addEventListener("click", () => selectPreset(button.dataset.mesh));
  for (const button of paletteButtons)
    button.addEventListener("click", () => {
      state.palette = button.dataset.palette;
      showState();
    });
  for (const key of sliders)
    el(key).addEventListener("input", (event) => {
      state[key] = Number(event.target.value);
      options();
      showState();
    });
  el("breakable").addEventListener("change", (event) => {
    state.breakable = event.target.checked;
    options();
    redraw();
  });

  function setMaterial(key) {
    material = key;
    for (const btn of document.querySelectorAll("[data-material]"))
      btn.setAttribute("aria-pressed", String(btn.dataset.material === key));
    showText("materialHelp", materialHelp[key]);
  }
  for (const btn of document.querySelectorAll("[data-material]")) {
    btn.addEventListener("click", () => setMaterial(btn.dataset.material));
  }
  el("saveReplay").addEventListener("click", () => {
    if (!tape.duration) return;
    const clip = makeClip(tape, {
      name: presets[state.mesh],
      palette: state.palette,
      density: state.density,
      grid: state.grid,
      view: scene.getView(),
      rate: Number(el("rate").value),
    });
    saveBlob(new Blob([clip], { type: "text/html;charset=utf-8" }), "html");
  });

  function writePrompt() {
    const palette = {
      aurora: "şeftali, pembe ve mor",
      buz: "buz mavisi ve camgöbeği",
      fosfor: "fosfor yeşili",
      mono: "gümüş ve gri",
    }[state.palette];
    const sentences = [
      "“" +
        presets[state.mesh] +
        "” düzeninde, çarpışan ve fırlatılabilen üç boyutlu cisimlerden bir fizik sahnesi kur. Cisimleri " +
        palette +
        " tonlarında ASCII karakterleriyle çiz.",
    ];
    if (state.gravity !== defaults.gravity)
      sentences.push(
        "Yerçekimini " + gravityText(state.gravity) + " olarak ayarla.",
      );
    if (state.restitution !== defaults.restitution)
      sentences.push("Sekme katsayısını %" + state.restitution + " yap.");
    if (state.density !== defaults.density)
      sentences.push("Karakter yoğunluğunu %" + state.density + " yap.");
    sentences.push(
      state.breakable
        ? "Sert darbelerde küpler parçalansın."
        : "Cisimler her çarpışmada bütün kalsın.",
    );
    const prompt = el("promptText");
    if (prompt.matches("textarea,input")) prompt.value = sentences.join(" ");
    else prompt.textContent = sentences.join(" ");
  }

  function fallbackFullscreen(on) {
    viewport.classList.toggle("local-fullscreen", on);
    document.body.classList.toggle("scene-expanded", on);
    syncFullscreen();
  }

  function syncFullscreen() {
    const active =
      (document.fullscreenElement || document.webkitFullscreenElement) ===
        viewport || viewport.classList.contains("local-fullscreen");
    const button = el("fullscreen");
    button.setAttribute("aria-pressed", String(active));
    labelButton(button, active ? "Tam ekrandan çık (F)" : "Tam ekran (F)");
  }

  async function toggleFullscreen() {
    if (viewport.classList.contains("local-fullscreen"))
      return fallbackFullscreen(false);
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) await exit.call(document);
    } else {
      const request =
        viewport.requestFullscreen || viewport.webkitRequestFullscreen;
      if (!request) return fallbackFullscreen(true);
      try {
        await request.call(viewport);
      } catch {
        fallbackFullscreen(true);
      }
    }
    syncFullscreen();
  }
  document.addEventListener("fullscreenchange", syncFullscreen);
  document.addEventListener("webkitfullscreenchange", syncFullscreen);
  el("fullscreen").addEventListener("click", toggleFullscreen);

  const shortcuts = el("shortcutsDialog");
  const exportDialog = el("exportDialog");
  el("shortcutsBtn").addEventListener("click", () => shortcuts.showModal());
  el("exportBtn").addEventListener("click", () => {
    writePrompt();
    exportDialog.showModal();
  });
  for (const button of document.querySelectorAll("button[data-close]")) {
    button.addEventListener("click", () => button.closest("dialog").close());
  }
  for (const dialog of [shortcuts, exportDialog]) {
    dialog.addEventListener("click", (event) => {
      if (event.target !== dialog) return;
      const box = dialog.getBoundingClientRect();
      if (
        event.clientX < box.left ||
        event.clientX > box.right ||
        event.clientY < box.top ||
        event.clientY > box.bottom
      )
        dialog.close();
    });
  }

  function saveBlob(blob, extension) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "glif-" + state.mesh + "." + extension;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  el("saveTxt")?.addEventListener("click", () => {
    draw();
    const blob = new Blob([scene.getText() + "\n"], {
      type: "text/plain;charset=utf-8",
    });
    saveBlob(blob, "txt");
    say("ASCII metni indirildi.");
  });

  el("savePng").addEventListener("click", () => {
    draw();
    const image = document.createElement("canvas");
    image.width = canvas.width;
    image.height = canvas.height;
    const ctx = image.getContext("2d");
    ctx.fillStyle = "#101016";
    ctx.fillRect(0, 0, image.width, image.height);
    ctx.drawImage(canvas, 0, 0);
    image.toBlob((blob) => {
      if (!blob) {
        say("Görüntü kaydedilemedi. Tekrar dene.");
        return;
      }
      saveBlob(blob, "png");
      say("PNG görüntüsü indirildi.");
    }, "image/png");
  });

  el("copyPrompt").addEventListener("click", async () => {
    const prompt = el("promptText");
    const text = prompt.matches("textarea,input")
      ? prompt.value
      : prompt.textContent;
    let copied = false;
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        copied = true;
      } catch {
        /* File mode can block clipboard access. */
      }
    }
    if (!copied) {
      const field = document.createElement("textarea");
      field.value = text;
      field.style.cssText =
        "position:fixed;opacity:0;inset:0 auto auto 0;width:1px;height:1px";
      exportDialog.append(field);
      field.select();
      try {
        copied = document.execCommand("copy");
      } catch {
        /* Leave the scene text selectable. */
      }
      field.remove();
      el("copyPrompt").focus();
    }
    const button = el("copyPrompt");
    button.classList.toggle("copied", copied);
    const label = button.querySelector("[data-copy-label]");
    if (label && copied) {
      label.textContent = "Kopyalandı";
      setTimeout(() => {
        label.textContent = "Tarifi kopyala";
        button.classList.remove("copied");
      }, 1700);
    }
    say(
      copied
        ? "Sahne tarifi kopyalandı."
        : "Sahne tarifini seçip kopyalayabilirsin.",
    );
  });

  document.addEventListener("keydown", (event) => {
    if (
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.defaultPrevented ||
      event.isComposing
    )
      return;
    if (
      event.key === "Escape" &&
      viewport.classList.contains("local-fullscreen")
    )
      return fallbackFullscreen(false);
    if (
      document.querySelector("dialog[open]") ||
      event.target.closest('input,textarea,select,[contenteditable="true"]')
    )
      return;
    if (event.target === canvas) {
      const n = event.shiftKey ? 38 : 16;
      const delta = {
        ArrowLeft: [-n, 0],
        ArrowRight: [n, 0],
        ArrowUp: [0, -n],
        ArrowDown: [0, n],
      }[event.key];
      if (delta) {
        event.preventDefault();
        orbit(...delta);
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        if (!event.repeat) addCube(true);
        return;
      }
    }
    const key = event.key.toLowerCase();
    const actions = {
      " ": togglePlay,
      a: () => addCube(false),
      r: resetScene,
      f: toggleFullscreen,
      g: toggleGrid,
      "+": () => zoomBy(0.1),
      "=": () => zoomBy(0.1),
      "-": () => zoomBy(-0.1),
      "?": () => shortcuts.showModal(),
    };
    const mesh = ["kule", "duvar", "domino", "yigin"][Number(key) - 1];
    if (key === " " && event.target.closest("button,a")) return;
    if (!mesh && !Object.hasOwn(actions, key)) return;
    event.preventDefault();
    if (!event.repeat || ["-", "=", "+"].includes(key)) {
      if (mesh) selectPreset(mesh);
      else actions[key]();
    }
  });

  const thumbs = [...document.querySelectorAll("canvas[data-thumb]")];
  const resizeObserver = new ResizeObserver((entries) => {
    for (const { target } of entries) {
      if (target === canvas) redraw();
      else window.drawPhysicsThumb(target, target.dataset.thumb);
    }
  });
  resizeObserver.observe(canvas);
  for (const thumb of thumbs) resizeObserver.observe(thumb);
  tape.capture(world.items(), 0);
  options();
  syncFullscreen();
  showState();
  showInteraction();
  draw();
})();

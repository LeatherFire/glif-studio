(() => {
  "use strict";
  const cube = (x, y, z, width, height, depth, color) => ({
    x,
    y,
    z,
    width,
    height,
    depth,
    color,
  });
  const scenes = {
    kule: [
      cube(-0.92, 0.5, 0, 1, 1, 1, 1),
      cube(-0.92, 1.5, 0, 1, 1, 1, 2),
      cube(-0.92, 2.5, 0, 1, 1, 1, 0),
      cube(0.25, 0.52, 0.5, 1.04, 1.04, 1.04, 1),
      cube(0.25, 1.56, 0.5, 1.04, 1.04, 1.04, 0),
      cube(1.35, 0.42, -0.2, 0.84, 0.84, 0.84, 2),
    ],
    duvar: Array.from({ length: 12 }, (_, i) =>
      cube(
        ((i % 4) - 1.5) * 0.96 + (Math.floor(i / 4) % 2) * 0.24,
        0.3 + Math.floor(i / 4) * 0.61,
        0,
        0.93,
        0.59,
        0.69,
        (i + Math.floor(i / 4)) % 3,
      ),
    ),
    domino: Array.from({ length: 6 }, (_, i) =>
      cube((i - 2.5) * 0.55, 0.85, 0, 0.2, 1.7, 0.83, i % 3),
    ),
    yigin: [
      cube(-1.1, 1.6, 0, 0.7, 0.7, 0.7, 2),
      cube(0.4, 2.25, -0.3, 0.7, 0.7, 0.7, 0),
      cube(-0.2, 0.6, 0, 0.7, 0.7, 0.7, 1),
      cube(1.15, 1.08, 0.24, 0.7, 0.7, 0.7, 2),
      cube(-0.62, 2.87, -0.2, 0.64, 0.64, 0.64, 0),
    ],
  };
  const palettes = {
    kule: [
      [245, 188, 160],
      [168, 133, 220],
      [203, 151, 212],
    ],
    duvar: [
      [208, 153, 129],
      [227, 179, 150],
      [188, 136, 129],
    ],
    domino: [
      [125, 186, 224],
      [143, 215, 225],
      [150, 171, 225],
    ],
    yigin: [
      [144, 203, 164],
      [178, 217, 156],
      [117, 183, 153],
    ],
  };
  function project(x, y, z) {
    return {
      x: x * 0.85 - z * 0.53,
      y: -y * 0.91 + x * 0.22 + z * 0.38,
      z: x * 0.47 + y * 0.41 + z * 0.77,
    };
  }
  function sampleBox(b) {
    const samples = [];
    const scale = 25;
    for (const [face, light] of [
      [0, 0.93],
      [1, 1.15],
      [2, 0.77],
    ]) {
      const horizontal = face === 0 ? b.depth : b.width,
        vertical = face === 1 ? b.depth : b.height;
      const nu = Math.max(5, Math.ceil(horizontal * scale)),
        nv = Math.max(5, Math.ceil(vertical * scale));
      for (let j = 0; j <= nv; j++)
        for (let i = 0; i <= nu; i++) {
          const u = i / nu - 0.5,
            v = j / nv - 0.5;
          const x = b.x + (face === 0 ? 0.5 : u) * b.width;
          const y = b.y + (face === 1 ? 0.5 : v) * b.height;
          const z = b.z + (face === 0 ? u : face === 1 ? v : 0.5) * b.depth;
          const edge = i === 0 || i === nu || j === 0 || j === nv;
          samples.push({
            ...project(x, y, z),
            light: light + (edge ? 0.13 : 0),
            color: b.color,
            glyph: edge ? "#" : face === 0 ? "+" : face === 1 ? "%" : ":",
          });
        }
    }
    return samples;
  }
  const caches = {};
  window.drawPhysicsThumb = (canvas, id) => {
    const width = canvas.clientWidth,
      height = canvas.clientHeight;
    if (!scenes[id] || !width || !height) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const widthPx = Math.round(width * ratio),
      heightPx = Math.round(height * ratio);
    if (canvas.width !== widthPx) canvas.width = widthPx;
    if (canvas.height !== heightPx) canvas.height = heightPx;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const samples = (caches[id] ||= scenes[id].flatMap(sampleBox));
    let xmin = Infinity,
      xmax = -Infinity,
      ymin = Infinity,
      ymax = -Infinity;
    for (const p of samples) {
      xmin = Math.min(xmin, p.x);
      xmax = Math.max(xmax, p.x);
      ymin = Math.min(ymin, p.y);
      ymax = Math.max(ymax, p.y);
    }
    const k = Math.min(
      (width * 0.89) / (xmax - xmin),
      (height * 0.83) / (ymax - ymin),
    );
    const font = Math.max(2.9, Math.min(3.8, height / 17));
    const cw = font * 0.68,
      ch = font * 0.86,
      cols = Math.ceil(width / cw),
      rows = Math.ceil(height / ch);
    const buf = new Array(cols * rows),
      cx = (xmax + xmin) / 2,
      cy = (ymax + ymin) / 2;
    for (const p of samples) {
      const u = Math.floor(((p.x - cx) * k + width * 0.5) / cw),
        v = Math.floor(((p.y - cy) * k + height * 0.5) / ch);
      const index = v * cols + u;
      if (
        u >= 0 &&
        v >= 0 &&
        u < cols &&
        v < rows &&
        (!buf[index] || p.z > buf[index].z)
      )
        buf[index] = p;
    }
    ctx.font = "700 " + font + "px Menlo,monospace";
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    for (let i = 0; i < buf.length; i++) {
      const p = buf[i];
      if (!p) continue;
      const rgb = palettes[id][p.color].map((c) =>
        Math.min(255, Math.round(c * p.light)),
      );
      ctx.fillStyle = "rgb(" + rgb.join(",") + ")";
      ctx.fillText(
        p.glyph,
        ((i % cols) + 0.5) * cw,
        (Math.floor(i / cols) + 0.5) * ch,
      );
    }
  };
})();

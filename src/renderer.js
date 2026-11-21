(function installRenderer() {
  "use strict";

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const mix = (a, b, t) => a + (b - a) * t;
  const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
  const vec = (x, y, z) => ({ x, y, z });
  const normalize = (v) => {
    const length = Math.hypot(v.x, v.y, v.z) || 1;
    return vec(v.x / length, v.y / length, v.z / length);
  };
  const glyphSets = {
    standart: ".,:;ic+soxX%#@",
    blok: "·:░░▒▒▓▓▧▩██",
    nokta: "·∙:∴⠒⠖⠶⣤⣶⣷⣿",
  };
  const materials = {
    aurora: [
      ["574873", "ec977e", "ffe3b1"],
      ["494378", "aa86e6", "e0ceff"],
      ["704e7f", "e88aaf", "ffdbdb"],
      ["4c577c", "9ba8c6", "e0e7f4"],
      ["805e78", "f4ac83", "ffe1a8"],
      ["5b517f", "bd90df", "f8d6fa"],
    ],
    buz: [
      ["525f8d", "699cc7", "cdefff"],
      ["515a9b", "8899d9", "d2d5ff"],
      ["496a92", "70bad4", "ccfaff"],
      ["6c71a4", "a7b0e2", "e4e9ff"],
      ["486b87", "65a5be", "baf8fb"],
      ["63639d", "9595d9", "dedaff"],
    ],
    fosfor: [
      ["466658", "72b88b", "c6fac7"],
      ["4f6d52", "8cb982", "d5edb9"],
      ["427267", "67b39c", "b6f8d6"],
      ["5b795d", "adcea0", "e9f9cb"],
      ["697450", "a9c778", "e8ffae"],
      ["487665", "80cda0", "c8fadc"],
    ],
    mono: [
      ["626575", "afb3c1", "f5f6fa"],
      ["545763", "9499a5", "d1d5df"],
      ["6a6979", "b9b4c2", "f7f1fa"],
      ["626977", "abb6c7", "edf4ff"],
      ["68666b", "afa8a8", "f8eeeb"],
      ["5c5c6b", "a5a5b4", "dadce7"],
    ],
  };
  const shades = 36;
  const faces = [
    { ids: [0, 4, 6, 2], axis: 0, sign: -1 },
    { ids: [1, 3, 7, 5], axis: 0, sign: 1 },
    { ids: [0, 1, 5, 4], axis: 1, sign: -1 },
    { ids: [2, 6, 7, 3], axis: 1, sign: 1 },
    { ids: [0, 2, 3, 1], axis: 2, sign: -1 },
    { ids: [4, 5, 7, 6], axis: 2, sign: 1 },
  ];
  const light = normalize(vec(-0.55, 0.86, 0.52));
  const readColor = (hex) =>
    [0, 2, 4].map((index) => parseInt(hex.slice(index, index + 2), 16));
  const rgb = (color, alpha = 1) =>
    "rgba(" + color.map(Math.round).join(",") + "," + alpha + ")";
  function sample(stops, value) {
    const t = clamp(value * 2, 0, 2),
      i = Math.min(1, Math.floor(t));
    return stops[i].map((v, k) => mix(v, stops[i + 1][k], t - i));
  }
  function axesOf(q) {
    const { x, y, z, w } = q;
    return [
      vec(1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y)),
      vec(2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x)),
      vec(2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y)),
    ];
  }
  function shadowTexture() {
    const el = document.createElement("canvas");
    el.width = el.height = 96;
    const ctx = el.getContext("2d"),
      gradient = ctx.createRadialGradient(48, 48, 0, 48, 48, 48);
    gradient.addColorStop(0, "rgba(0,0,2,.85)");
    gradient.addColorStop(0.34, "rgba(0,0,2,.58)");
    gradient.addColorStop(0.68, "rgba(0,0,2,.20)");
    gradient.addColorStop(1, "rgba(0,0,2,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 96, 96);
    return el;
  }
  function atlasFor(cw, ch, characters, colors) {
    const atlas = document.createElement("canvas");
    atlas.width = cw * characters.length * colors.length;
    atlas.height = ch * shades;
    const ctx = atlas.getContext("2d"),
      count = characters.length;
    ctx.font =
      "600 " + ch * 1.0 + 'px Menlo,Consolas,"Liberation Mono",monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let mat = 0; mat < colors.length; mat++) {
      for (let shade = 0; shade < shades; shade++) {
        ctx.fillStyle = rgb(sample(colors[mat], shade / (shades - 1)));
        for (let g = 0; g < count; g++) {
          ctx.fillText(
            characters[g],
            (mat * count + g + 0.5) * cw,
            (shade + 0.54) * ch,
            cw,
          );
        }
      }
    }
    return atlas;
  }

  class PhysicsRenderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d", { alpha: true });
      this.shadow = shadowTexture();
      this.lastBodies = [];
      this.config = {
        density: 55,
        palette: "aurora",
        grid: true,
        charset: "standart",
        selected: null,
        hovered: null,
      };
      this.textCodes = new Uint8Array(0);
      this.cols = 0;
      this.rows = 0;
      this.resetView();
    }
    resetView() {
      this.zoom = 1;
      this.yaw = Math.atan2(8.0, 10.7);
      this.pitch = 0.57;
      this.target = vec(0, 1.63, 0.1);
      this._camera();
    }
    setZoom(value) {
      this.zoom = clamp(Number(value) || 1, 0.55, 1.8);
      this._camera();
      return this.zoom;
    }
    orbit(dx, dy) {
      this.yaw -= dx * 0.0075;
      this.pitch = clamp(this.pitch + dy * 0.006, 0.1, 1.22);
      this._camera();
      return this.getView();
    }
    _camera() {
      const cy = Math.cos(this.yaw),
        sy = Math.sin(this.yaw),
        cp = Math.cos(this.pitch),
        sp = Math.sin(this.pitch);
      this.direction = vec(-sy * cp, -sp, -cy * cp);
      this.right = vec(cy, 0, -sy);
      this.up = vec(-sy * sp, cp, -cy * sp);
      this.radius = 19.0;
      this.position = vec(
        this.target.x - this.radius * this.direction.x,
        this.target.y - this.radius * this.direction.y,
        this.target.z - this.radius * this.direction.z,
      );
    }
    getView() {
      return {
        zoom: this.zoom,
        yaw: this.yaw,
        pitch: this.pitch,
        roll: 0,
        position: { ...this.position },
        target: { ...this.target },
        direction: { ...this.direction },
      };
    }
    _layout() {
      const rect = this.canvas.getBoundingClientRect(),
        dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.round(rect.width * dpr),
        height = Math.round(rect.height * dpr);
      if (!width || !height) return false;
      if (width !== this.canvas.width || height !== this.canvas.height) {
        this.canvas.width = width;
        this.canvas.height = height;
      }
      this.width = width;
      this.height = height;
      this.dpr = dpr;
      this.unit = Math.min(width / 9.35, height / 7.35);
      this.focal = this.unit * this.radius * this.zoom;
      this.cx = width * 0.5;
      this.cy = height * 0.505;
      const font =
        clamp(this.unit / dpr / 8.8, 3.9, 9.0) *
        (1.48 - 0.0094 * clamp(this.config.density, 0, 100));
      const cw = Math.max(2, Math.round(font * 0.66 * dpr)),
        ch = Math.max(3, Math.round(font * dpr));
      const charset = glyphSets[this.config.charset]
        ? this.config.charset
        : "standart";
      const palette = materials[this.config.palette]
        ? this.config.palette
        : "aurora";
      const cache = [cw, ch, charset, palette].join("/");
      if (this.atlasKey !== cache) {
        this.atlasKey = cache;
        this.characters = [...glyphSets[charset]];
        this.colors = materials[palette].map((stops) => stops.map(readColor));
        this.atlas = atlasFor(cw, ch, this.characters, this.colors);
      }
      this.cw = cw;
      this.ch = ch;
      const cols = Math.ceil(width / cw),
        rows = Math.ceil(height / ch);
      if (this.cols !== cols || this.rows !== rows) {
        this.cols = cols;
        this.rows = rows;
        const count = cols * rows;
        this.depth = new Float32Array(count);
        this.shade = new Uint8Array(count);
        this.material = new Uint8Array(count);
        this.textCodes = new Uint8Array(count);
      }
      return true;
    }
    _project(p) {
      const dx = p.x - this.position.x,
        dy = p.y - this.position.y,
        dz = p.z - this.position.z;
      const depth =
        dx * this.direction.x + dy * this.direction.y + dz * this.direction.z;
      if (depth < 0.32) return null;
      const inv = 1 / depth,
        scale = this.focal * inv;
      return {
        x: this.cx + (dx * this.right.x + dz * this.right.z) * scale,
        y: this.cy - (dx * this.up.x + dy * this.up.y + dz * this.up.z) * scale,
        inv,
      };
    }
    getRay(clientX, clientY) {
      this._layout();
      const rect = this.canvas.getBoundingClientRect();
      const x =
        (((clientX - rect.left) * this.width) / rect.width - this.cx) /
        this.focal;
      const y =
        (this.cy - ((clientY - rect.top) * this.height) / rect.height) /
        this.focal;
      return {
        origin: { ...this.position },
        direction: normalize(
          vec(
            this.direction.x + x * this.right.x + y * this.up.x,
            this.direction.y + y * this.up.y,
            this.direction.z + x * this.right.z + y * this.up.z,
          ),
        ),
      };
    }
    _floor() {
      const ctx = this.ctx;
      // Perspective-projected one-metre squares fade into the unlit perimeter.
      const ground = this._project(vec(0, 0, 0));
      if (ground) {
        const radius = this.unit * this.zoom * 6.6;
        const glow = ctx.createRadialGradient(
          ground.x,
          ground.y,
          0,
          ground.x,
          ground.y,
          radius,
        );
        glow.addColorStop(0, "rgba(112,101,135,.068)");
        glow.addColorStop(1, "rgba(112,101,135,0)");
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, this.width, this.height);
      }
      if (!this.config.grid) return;
      const reach = 10;
      ctx.lineWidth = Math.max(0.65, 0.65 * this.dpr);
      for (let axis = 0; axis < 2; axis++) {
        for (let i = -reach; i <= reach; i++) {
          const distance = Math.abs(i) / reach,
            alpha = (1 - distance * distance) * (i % 4 === 0 ? 0.24 : 0.16);
          if (!alpha) continue;
          const points = [];
          for (let t = -reach; t <= reach; t++) {
            const pos = axis === 0 ? vec(i, 0, t) : vec(t, 0, i);
            points.push(this._project(pos));
          }
          for (let j = 1; j < points.length; j++) {
            const a = points[j - 1],
              b = points[j];
            if (
              !a ||
              !b ||
              (a.y < 0 && b.y < 0) ||
              (a.x < 0 && b.x < 0) ||
              (a.x > this.width && b.x > this.width) ||
              (a.y > this.height && b.y > this.height)
            )
              continue;
            const falloff = Math.max(
              0,
              1 - Math.pow(Math.abs(j - reach - 0.5) / reach, 1.65),
            );
            ctx.strokeStyle = "rgba(155,151,176," + alpha * falloff + ")";
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }
    }
    _shadow(body) {
      const { x, y, z } = body.position,
        dims = body.dims;
      const size = Math.max(dims?.x || body.size, dims?.z || body.size);
      const bodyH = dims?.y || body.size;
      const alt = Math.max(0, y - bodyH * 0.5);
      const ground = vec(x + y * 0.18, 0, z - y * 0.12);
      const center = this._project(ground);
      if (!center) return;
      const radius = size * (1.0 + 0.16 * Math.min(6, alt));
      const a = this._project(vec(ground.x + radius, 0.002, ground.z));
      const b = this._project(vec(ground.x, 0.002, ground.z + radius));
      if (!a || !b) return;
      const ctx = this.ctx;
      ctx.save();
      ctx.transform(
        a.x - center.x,
        a.y - center.y,
        b.x - center.x,
        b.y - center.y,
        center.x,
        center.y,
      );
      ctx.globalAlpha = 0.82 / (1 + alt * 0.58);
      ctx.drawImage(this.shadow, -1, -1, 2, 2);
      ctx.restore();
    }
    _faces(body, list) {
      const { position: p, quaternion: q } = body;
      const axes = axesOf(q),
        dims = body.dims || { x: body.size, y: body.size, z: body.size };
      const half = [dims.x * 0.5, dims.y * 0.5, dims.z * 0.5],
        projected = [];
      for (let i = 0; i < 8; i++) {
        const x = (i & 1 ? 1 : -1) * half[0],
          y = (i & 2 ? 1 : -1) * half[1],
          z = (i & 4 ? 1 : -1) * half[2];
        projected.push(
          this._project(
            vec(
              p.x + x * axes[0].x + y * axes[1].x + z * axes[2].x,
              p.y + x * axes[0].y + y * axes[1].y + z * axes[2].y,
              p.z + x * axes[0].z + y * axes[1].z + z * axes[2].z,
            ),
          ),
        );
      }
      if (projected.some((v) => !v)) return;
      if (
        projected.every((v) => v.x < 0) ||
        projected.every((v) => v.x > this.width) ||
        projected.every((v) => v.y < 0) ||
        projected.every((v) => v.y > this.height)
      )
        return;
      const toEye = vec(
        this.position.x - p.x,
        this.position.y - p.y,
        this.position.z - p.z,
      );
      const selected = body.id === this.config.selected,
        hover = body.id === this.config.hovered;
      const mat = clamp(Math.floor(body.color || 0), 0, this.colors.length - 1);
      for (const face of faces) {
        const axis = axes[face.axis],
          sign = face.sign;
        if (sign * dot(axis, toEye) <= half[face.axis]) continue;
        const direct = Math.max(0, sign * dot(axis, light));
        const fill = Math.max(
          0,
          sign * (axis.x * 0.65 - axis.y * 0.3 + axis.z * 0.27),
        );
        const top = sign * axis.y;
        const diffuse = clamp(
          0.17 +
            0.73 * direct +
            0.12 * fill +
            0.045 * top +
            (selected ? 0.08 : hover ? 0.035 : 0),
          0.08,
          0.98,
        );
        const poly = face.ids.map((id) => projected[id]);
        list.push({
          poly,
          mat,
          diffuse,
          selected,
          hover,
          depth: poly.reduce((sum, v) => sum + v.inv, 0) / 4,
        });
      }
    }
    _paintFace(face) {
      const { ctx, dpr } = this,
        poly = face.poly;
      const color = sample(this.colors[face.mat], face.diffuse);
      ctx.beginPath();
      ctx.moveTo(poly[0].x, poly[0].y);
      for (let i = 1; i < 4; i++) ctx.lineTo(poly[i].x, poly[i].y);
      ctx.closePath();
      const baseGain = 0.05 + 0.3 * face.diffuse;
      const tint = color.map((v, i) => [14, 14, 19][i] + v * baseGain);
      ctx.fillStyle = rgb(tint);
      ctx.fill();
      ctx.lineWidth = (face.selected ? 1.7 : face.hover ? 1.25 : 0.76) * dpr;
      ctx.strokeStyle = face.selected
        ? "rgba(255,232,199,.95)"
        : face.hover
          ? "rgba(255,221,194,.80)"
          : rgb(color, 0.16 + 0.2 * face.diffuse);
      ctx.stroke();
    }
    _triangle(a, b, c, uvA, uvB, uvC, face) {
      const { cw, ch, cols, rows } = this;
      const ax = a.x / cw,
        ay = a.y / ch,
        bx = b.x / cw,
        by = b.y / ch,
        cx = c.x / cw,
        cy = c.y / ch;
      const dxB = bx - ax,
        dyB = by - ay,
        dxC = cx - ax,
        dyC = cy - ay,
        det = dxB * dyC - dyB * dxC;
      if (Math.abs(det) < 0.00001) return;
      const left = Math.max(0, Math.ceil(Math.min(ax, bx, cx) - 0.5)),
        right = Math.min(cols - 1, Math.floor(Math.max(ax, bx, cx) - 0.5));
      const top = Math.max(0, Math.ceil(Math.min(ay, by, cy) - 0.5)),
        bottom = Math.min(rows - 1, Math.floor(Math.max(ay, by, cy) - 0.5));
      const stepU = dyC / det,
        stepV = -dyB / det,
        dzB = b.inv - a.inv,
        dzC = c.inv - a.inv;
      const count = this.characters.length;
      for (let y = top; y <= bottom; y++) {
        let u = ((left + 0.5 - ax) * dyC - (y + 0.5 - ay) * dxC) / det,
          v = (dxB * (y + 0.5 - ay) - dyB * (left + 0.5 - ax)) / det;
        for (let x = left; x <= right; x++, u += stepU, v += stepV) {
          if (u < -0.00001 || v < -0.00001 || u + v > 1.00001) continue;
          const k = y * cols + x,
            inv = a.inv + u * dzB + v * dzC;
          if (inv < this.depth[k]) continue;
          this.depth[k] = inv;
          const wb = (u * b.inv) / inv,
            wc = (v * c.inv) / inv,
            wa = 1 - wb - wc;
          const s = wa * uvA[0] + wb * uvB[0] + wc * uvC[0],
            t = wa * uvA[1] + wb * uvB[1] + wc * uvC[1];
          const nearest = Math.min(s, t, 1 - s, 1 - t);
          const bevel = 0.155 * Math.max(0, 1 - nearest / 0.085);
          const local = 0.082 * (0.5 - s) + 0.11 * (0.5 - t);
          const level = clamp(face.diffuse + bevel + local, 0, 1);
          const dither =
            ((x * 31 + y * 47 + ((x * y) % 5) * 13) % 19) / 18 - 0.5;
          const g = clamp(
            Math.floor((0.09 + 0.91 * level) * (count - 1) + dither * 2.0),
            0,
            count - 1,
          );
          this.textCodes[k] = g + 1;
          this.shade[k] = Math.round(level * (shades - 1));
          this.material[k] = face.mat;
        }
      }
    }
    render(bodies = this.lastBodies, config = {}) {
      this.lastBodies = bodies || [];
      Object.assign(this.config, config);
      if (!this._layout()) return { cols: 0, rows: 0 };
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.width, this.height);
      this._floor();
      for (const body of this.lastBodies) this._shadow(body);
      const visible = [];
      for (const body of this.lastBodies) this._faces(body, visible);
      visible.sort((a, b) => a.depth - b.depth);
      for (const face of visible) this._paintFace(face);
      this.depth.fill(0);
      this.textCodes.fill(0);
      const a = [0, 0],
        b = [1, 0],
        c = [1, 1],
        d = [0, 1];
      for (const face of visible) {
        const poly = face.poly;
        this._triangle(poly[0], poly[1], poly[2], a, b, c, face);
        this._triangle(poly[0], poly[2], poly[3], a, c, d, face);
      }
      const { cw, ch, cols, rows } = this,
        count = this.characters.length;
      for (let y = 0, k = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++, k++) {
          const g = this.textCodes[k] - 1;
          if (g < 0) continue;
          ctx.drawImage(
            this.atlas,
            (this.material[k] * count + g) * cw,
            this.shade[k] * ch,
            cw,
            ch,
            x * cw,
            y * ch,
            cw,
            ch,
          );
        }
      }
      return { cols, rows };
    }
    getText() {
      const lines = [];
      for (let y = 0; y < this.rows; y++) {
        let line = "";
        for (let x = 0; x < this.cols; x++) {
          const code = this.textCodes[y * this.cols + x];
          line += code ? this.characters[code - 1] : " ";
        }
        lines.push(line);
      }
      return lines.join("\n");
    }
  }

  PhysicsRenderer.install = installRenderer;
  window.PhysicsRenderer = PhysicsRenderer;
})();

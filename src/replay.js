// Each pose stores id, position, quaternion, dimensions and palette index.
// Frames own their data, so Cannon can recycle or remove bodies immediately.
class ReplayTape {
  static fps = 30;
  static capacity = 8 * ReplayTape.fps + 1;
  static stride = 12;

  constructor() {
    this.frames = [];
  }
  get duration() {
    return Math.max(0, (this.frames.length - 1) / ReplayTape.fps);
  }
  capture(items, breaks) {
    const poses = new Float64Array(items.length * ReplayTape.stride);
    let offset = 0;
    for (const { id, position: p, quaternion: q, dims, color } of items) {
      poses.set(
        [id, p.x, p.y, p.z, q.x, q.y, q.z, q.w, dims.x, dims.y, dims.z, color],
        offset,
      );
      offset += ReplayTape.stride;
    }
    this.frames.push({ poses, breaks });
    if (this.frames.length > ReplayTape.capacity) this.frames.shift();
  }
  sample(seconds) {
    if (!this.frames.length) return { items: [], breaks: 0 };
    const cursor = Math.max(
      0,
      Math.min(this.frames.length - 1, seconds * ReplayTape.fps),
    );
    const i = Math.floor(cursor);
    const current = this.frames[i];
    const next = (this.frames[i + 1] || current).poses;
    const blend = cursor - i;
    const items = [];
    const p = current.poses;
    const stride = ReplayTape.stride;
    const offsets = new Map();
    for (let j = 0; j < next.length; j += stride) offsets.set(next[j], j);
    for (let j = 0; j < p.length; j += stride) {
      const k = offsets.get(p[j]);
      const mix = (n, sign = 1) =>
        k === undefined
          ? p[j + n]
          : p[j + n] + blend * (sign * next[k + n] - p[j + n]);
      let dot = 0;
      if (k !== undefined)
        for (let n = 4; n <= 7; n++) dot += p[j + n] * next[k + n];
      const sign = dot < 0 ? -1 : 1;
      const x = mix(4, sign),
        y = mix(5, sign),
        z = mix(6, sign),
        w = mix(7, sign);
      const norm = Math.hypot(x, y, z, w) || 1;
      const dims = { x: p[j + 8], y: p[j + 9], z: p[j + 10] };
      items.push({
        id: p[j],
        position: { x: mix(1), y: mix(2), z: mix(3) },
        quaternion: { x: x / norm, y: y / norm, z: z / norm, w: w / norm },
        dims,
        size: Math.max(dims.x, dims.y, dims.z),
        color: p[j + 11],
      });
    }
    return { items, breaks: current.breaks };
  }
  serialize() {
    return this.frames.map(({ poses, breaks }) => ({
      breaks,
      poses: Array.from(poses, (n) => Number(n.toFixed(5))),
    }));
  }
}
globalThis.ReplayTape = ReplayTape;

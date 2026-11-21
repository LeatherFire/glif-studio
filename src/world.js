(() => {
  "use strict";

  const C = window.CANNON;
  const timestep = 1 / 90;
  const maxBodies = 108;
  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
  const vector = (p) => new C.Vec3(p.x, p.y, p.z);
  const coordinates = (p) => ({ x: p.x, y: p.y, z: p.z });

  const materials = {
    clay: { density: 1, bounce: 0.3, strength: 1, color: 0 },
    glass: { density: 1.6, bounce: 0.12, strength: 0.63, color: 4 },
    rubber: { density: 0.77, bounce: 0.91, strength: Infinity, color: 2 },
  };

  class SandboxWorld {
    constructor() {
      this.options = { gravity: 50, restitution: 30, breakable: true };
      this.physics = new C.World({
        gravity: new C.Vec3(0, -9.81, 0),
        allowSleep: true,
      });
      this.physics.broadphase = new C.SAPBroadphase(this.physics);
      this.physics.solver.iterations = 18;
      this.physics.solver.tolerance = 0.0001;
      const contact = this.physics.defaultContactMaterial;
      contact.friction = 0.57;
      contact.restitution = 0.3;
      contact.contactEquationStiffness = 1e8;
      contact.contactEquationRelaxation = 4;

      this.materials = Object.fromEntries(
        Object.keys(materials).map((key) => [key, new C.Material(key)]),
      );
      this.surfacePairs = [];
      for (const [i, a] of Object.keys(materials).entries()) {
        for (const b of Object.keys(materials).slice(i)) {
          const bounce = Math.max(materials[a].bounce, materials[b].bounce);
          const pair = new C.ContactMaterial(
            this.materials[a],
            this.materials[b],
            {
              friction: contact.friction,
              restitution: bounce,
              contactEquationStiffness: 1e8,
              contactEquationRelaxation: 4,
            },
          );
          this.physics.addContactMaterial(pair);
          this.surfacePairs.push({ pair, bounce });
        }
      }
      const floor = new C.Body({
        mass: 0,
        shape: new C.Plane(),
        collisionFilterGroup: 2,
      });
      floor.material = this.materials.clay;
      floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
      this.physics.addBody(floor);
      this.floor = floor;
      this.blocks = new Map();
      this.renderItems = [];
      this.fractures = new Set();
      this.events = [];
      this.breaks = 0;
      this.accumulator = 0;
      this.spawnIndex = 0;
      this.clock = 0;
      this.grip = null;
      this.handleCollision = (event) => this._collision(event);
      this.loadPreset("kule");
    }

    isMoving() {
      if (this.grip) return true;
      for (const { body } of this.blocks.values())
        if (body.sleepState !== C.Body.SLEEPING) return true;
      return false;
    }

    items() {
      return this.renderItems;
    }

    setOptions(options = {}) {
      if (Number.isFinite(options.gravity)) {
        this.options.gravity = clamp(options.gravity, 0, 100);
        this.physics.gravity.set(0, (-9.81 * this.options.gravity) / 50, 0);
        for (const block of this.blocks.values()) block.body.wakeUp();
      }
      if (Number.isFinite(options.restitution)) {
        this.options.restitution = clamp(options.restitution, 0, 100);
        this.physics.defaultContactMaterial.restitution =
          this.options.restitution / 100;
        for (const { pair, bounce } of this.surfacePairs)
          pair.restitution = clamp(
            (bounce * this.options.restitution) / 30,
            0,
            1,
          );
      }
      if (typeof options.breakable === "boolean")
        this.options.breakable = options.breakable;
    }

    _block(x, y, z, size, color, yaw = 0, fragment = false, material = "clay") {
      const dims =
        typeof size === "number" ? { x: size, y: size, z: size } : { ...size };
      const shape = new C.Box(new C.Vec3(dims.x / 2, dims.y / 2, dims.z / 2));
      const body = new C.Body({
        shape,
        material: this.materials[material],
        mass: materials[material].density * dims.x * dims.y * dims.z,
        position: new C.Vec3(x, y, z),
        linearDamping: 0.065,
        angularDamping: 0.15,
        allowSleep: true,
        sleepSpeedLimit: 0.13,
        sleepTimeLimit: 0.62,
        collisionFilterGroup: 1,
      });
      body.quaternion.setFromEuler(0, yaw, 0);
      if (!fragment) body.addEventListener("collide", this.handleCollision);
      this.physics.addBody(body);
      const item = {
        id: body.id,
        position: body.position,
        quaternion: body.quaternion,
        dims,
        size: Math.max(dims.x, dims.y, dims.z),
        color,
      };
      this.blocks.set(body.id, { body, item, fragment, material });
      this.renderItems.push(item);
      return body;
    }

    _tower(x, z, sizes, colors, offsets) {
      let y = 0;
      sizes.forEach((size, i) => {
        this._block(
          x + offsets[i][0],
          y + size / 2,
          z + offsets[i][1],
          size,
          colors[i],
          offsets[i][2] || 0,
        );
        y += size + 0.003;
      });
    }

    loadPreset(id) {
      this.clear();
      this.scene = id;
      if (id === "duvar") {
        for (let row = 0; row < 4; row++) {
          const n = 5 - (row % 2);
          for (let col = 0; col < n; col++) {
            const x = (col - (n - 1) / 2) * 1.04;
            this._block(
              x,
              (row + 0.5) * 0.803,
              -0.45,
              { x: 1.02, y: 0.8, z: 0.75 },
              (col + row * 2) % 6,
            );
          }
        }
        this._block(0.55, 0.48, 1.75, 0.96, 0, -0.18);
      } else if (id === "domino") {
        const count = 15;
        for (let i = 0; i < count; i++) {
          const a = (i / (count - 1)) * Math.PI * 1.49 - Math.PI * 0.19;
          const x = 2.5 * Math.cos(a),
            z = 1.67 * Math.sin(a);
          const yaw = -Math.atan2(1.67 * Math.cos(a), -2.5 * Math.sin(a));
          this._block(
            x,
            0.82,
            z,
            { x: 0.23, y: 1.64, z: 0.65 },
            Math.floor(i / 3) % 6,
            yaw,
          );
        }
        this._block(2.5, 0.41, -2.05, 0.82, 0, 0.12);
      } else if (id === "yigin") {
        for (let row = 0; row < 3; row++) {
          const n = 3 - row;
          for (let ix = 0; ix < n; ix++) {
            for (let iz = 0; iz < n; iz++) {
              const offset = ix * 3 + iz + row * 5;
              const x =
                (ix - (n - 1) / 2) * 1.08 + Math.sin(offset * 1.75) * 0.12;
              const z =
                (iz - (n - 1) / 2) * 1.09 -
                0.22 +
                Math.cos(offset * 1.43) * 0.14;
              const body = this._block(
                x,
                1.16 + row * 1.67 + (offset % 4) * 0.14,
                z,
                0.96,
                (ix + iz + row * 2) % 6,
                Math.sin(offset) * 0.21,
              );
              body.angularVelocity.set(
                Math.sin(offset) * 0.47,
                0.08,
                Math.cos(offset * 0.71) * 0.18,
              );
            }
          }
        }
        this._block(-2.02, 1.42, 1.21, 0.88, 1, 0.31);
        this._block(1.98, 2.12, 0.9, 0.68, 4, -0.25);
      } else {
        this.scene = "kule";
        this._tower(
          -0.12,
          -0.57,
          [1.43, 1.22, 1.02, 0.83],
          [3, 2, 1, 0],
          [
            [0, 0],
            [-0.04, 0.02, -0.025],
            [0.015, 0.03, 0.062],
            [0.025, 0.07, -0.072],
          ],
        );
        this._tower(
          -2.52,
          0.44,
          [1.22, 0.99, 0.71],
          [4, 3, 1],
          [
            [0, 0],
            [-0.02, 0.01, 0.065],
            [-0.07, 0.02, 0.02],
          ],
        );
        this._tower(
          2.48,
          -0.92,
          [1.24, 1.09, 0.88],
          [4, 2, 0],
          [
            [0, 0],
            [0.02, 0.045, -0.045],
            [0.055, 0.02, 0.074],
          ],
        );
        const loose = this._block(0.92, 1.48, 1.52, 0.92, 0, -0.24);
        loose.velocity.set(-0.13, -0.08, 0.09);
        loose.angularVelocity.set(0.73, -0.42, 0.24);
        this._block(-3.0, 0.36, 1.48, 0.72, 2, 0.22);
        this._block(3.2, 0.35, 0.45, 0.7, 5, -0.17);
      }
      return this;
    }

    clear() {
      this.cancelGrab();
      for (const { body } of this.blocks.values())
        this.physics.removeBody(body);
      this.blocks.clear();
      this.renderItems.length = 0;
      this.events.length = 0;
      this.fractures.clear();
      this.breaks = this.spawnIndex = this.sampleStep = 0;
      this.accumulator = 0;
    }

    _remove(id) {
      const block = this.blocks.get(id);
      if (!block) return;
      if (this.grip?.id === id) this.cancelGrab();
      this.physics.removeBody(block.body);
      this.blocks.delete(id);
      this.renderItems.splice(this.renderItems.indexOf(block.item), 1);
    }

    _makeRoom() {
      if (this.blocks.size < maxBodies) return;
      const blocks = [...this.blocks.values()].filter(
        (block) => block.body.id !== this.grip?.id,
      );
      const replace = blocks.find((block) => block.fragment) || blocks[0];
      if (replace) this._remove(replace.body.id);
    }

    addCube(material = "clay") {
      this._makeRoom();
      const i = this.spawnIndex++;
      const x = 1.15 * Math.sin(i * 2.39 - 0.58);
      const z = 1.18 * Math.cos(i * 2.39);
      const s = 0.68 + ((i * 7 + 2) % 5) * 0.11;
      let floorY = 0;
      for (const { body, item } of this.blocks.values()) {
        if (
          Math.abs(body.position.x - x) < (item.size + s) / 2 &&
          Math.abs(body.position.z - z) < (item.size + s) / 2
        ) {
          floorY = Math.max(floorY, body.position.y + item.size / 2);
        }
      }
      const body = this._block(
        x,
        floorY + s / 2 + 1.45,
        z,
        s,
        materials[material].color,
        ((i % 7) - 3) * 0.085,
        false,
        material,
      );
      body.angularVelocity.set(0.25, -0.1, 0.13);
      return body.id;
    }

    launchCube(material = "clay") {
      this._makeRoom();
      const i = this.spawnIndex++;
      const targetX =
        this.scene === "domino" ? 2.08 : Math.sin(i * 1.63) * 0.58;
      const z = this.scene === "domino" ? -3.65 : 3.25;
      const x =
        this.scene === "domino" ? 2.45 : -0.93 + Math.sin(i * 0.89) * 0.81;
      const targetZ = this.scene === "domino" ? -0.93 : -0.45;
      const domino = this.scene === "domino";
      const body = this._block(
        x,
        domino ? 0.93 : 2.05,
        z,
        domino ? 0.76 : 1.0,
        materials[material].color,
        0.16,
        false,
        material,
      );
      const direction = new C.Vec3(targetX - x, 0.03, targetZ - z);
      direction.normalize();
      direction.scale(domino ? 13.2 : 15.5, body.velocity);
      body.velocity.y = 1.04;
      body.angularVelocity.set(-2.62, 0.86, -0.91);
      return body.id;
    }

    pick(ray) {
      if (!ray?.origin || !ray.direction || !this.blocks.size) return null;
      const from = vector(ray.origin),
        direction = vector(ray.direction);
      if (!direction.normalize()) return null;
      const to = direction.scale(200);
      to.vadd(from, to);
      const result = new C.RaycastResult();
      this.physics.raycastClosest(
        from,
        to,
        { collisionFilterMask: 1, skipBackfaces: true },
        result,
      );
      if (!result.hasHit || !this.blocks.has(result.body?.id)) return null;
      return {
        id: result.body.id,
        point: coordinates(result.hitPointWorld),
        distance: result.distance,
      };
    }

    grab(id, point) {
      const block = this.blocks.get(id);
      if (!block || !point) return false;
      this.cancelGrab();
      const body = block.body;
      body.wakeUp();
      const target = vector(point);
      const local = body.pointToLocalFrame(target);
      const anchor = new C.Body({
        mass: 0,
        type: C.Body.KINEMATIC,
        position: target,
        collisionFilterMask: 0,
        collisionFilterGroup: 0,
      });
      this.physics.addBody(anchor);
      const joint = new C.PointToPointConstraint(
        body,
        local,
        anchor,
        new C.Vec3(),
        body.mass * 1150,
      );
      joint.collideConnected = false;
      this.physics.addConstraint(joint);
      this.grip = { id, joint, anchor, target, body };
      return true;
    }

    moveGrab(point) {
      if (this.grip && point)
        this.grip.target.set(
          clamp(point.x, -24, 24),
          clamp(point.y, 0.01, 24),
          clamp(point.z, -24, 24),
        );
    }

    cancelGrab() {
      if (!this.grip) return;
      const { anchor, joint } = this.grip;
      this.physics.removeConstraint(joint);
      this.physics.removeBody(anchor);
      this.grip = null;
    }

    release(velocity) {
      if (!this.grip) return;
      const { body } = this.grip;
      this.cancelGrab();
      if (
        velocity &&
        [velocity.x, velocity.y, velocity.z].every(Number.isFinite)
      )
        body.velocity.copy(velocity);
      const speed = body.velocity.length();
      if (speed > 23) body.velocity.scale(23 / speed, body.velocity);
      const spin = body.angularVelocity.length();
      if (spin > 12)
        body.angularVelocity.scale(12 / spin, body.angularVelocity);
      body.wakeUp();
    }

    _collision(event) {
      if (!this.options.breakable) return;
      const victim = this.blocks.get(event.target.id);
      if (!victim || victim.body.id === this.grip?.id || victim.fragment)
        return;
      const impact = Math.abs(event.contact.getImpactVelocityAlongNormal());
      const threshold = event.body === this.floor ? 8.8 : 6.4;
      if (impact > threshold * materials[victim.material].strength)
        this.fractures.add(victim.body.id);
    }

    _fracture(id) {
      const block = this.blocks.get(id);
      if (!block || block.fragment || this.blocks.size > maxBodies - 3) return;
      const { body, item } = block,
        { dims } = item;
      const axes = ["x", "y", "z"].sort((a, b) => dims[b] - dims[a]);
      const part = { ...dims };
      part[axes[0]] *= 0.5;
      part[axes[1]] *= 0.5;
      this._remove(id);
      for (const a of [-1, 1]) {
        for (const b of [-1, 1]) {
          const local = new C.Vec3();
          local[axes[0]] = a * dims[axes[0]] * 0.25;
          local[axes[1]] = b * dims[axes[1]] * 0.25;
          const offset = body.quaternion.vmult(local);
          const p = body.position.vadd(offset);
          const piece = this._block(
            p.x,
            p.y,
            p.z,
            part,
            item.color,
            0,
            true,
            block.material,
          );
          piece.quaternion.copy(body.quaternion);
          body.angularVelocity.cross(offset, piece.velocity);
          piece.velocity.vadd(body.velocity, piece.velocity);
          offset.scale(2.12, offset);
          piece.velocity.vadd(offset, piece.velocity);
          piece.angularVelocity.copy(body.angularVelocity);
          piece.angularVelocity.x += b * 1.02;
          piece.angularVelocity.z += a * 0.93;
        }
      }
      this.breaks++;
      this.events.push({
        type: "break",
        id,
        point: coordinates(body.position),
      });
      if (this.events.length > 64) this.events.shift();
    }

    popEvents() {
      return this.events.splice(0);
    }

    step(dtSeconds) {
      if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) return;
      this.accumulator += Math.min(0.1, dtSeconds);
      while (this.accumulator + 1e-10 >= timestep) {
        if (this.grip) {
          const { anchor, target, body } = this.grip;
          target.vsub(anchor.position, anchor.velocity);
          const gain = Math.min(34, 26 / (anchor.velocity.length() || 1));
          anchor.velocity.scale(gain, anchor.velocity);
          body.wakeUp();
        }
        this.physics.step(timestep);
        this.clock += timestep;
        for (const id of this.fractures) this._fracture(id);
        this.fractures.clear();
        if (++this.sampleStep % 3 === 0 && this.onSample)
          this.onSample(this.renderItems, this.breaks);
        this.accumulator -= timestep;
      }
      for (const { body } of this.blocks.values()) {
        const p = body.position;
        if (Math.abs(p.x) > 22 || Math.abs(p.z) > 22 || p.y < -15)
          this._remove(body.id);
      }
    }
  }

  window.SandboxWorld = SandboxWorld;
})();

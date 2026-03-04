#!/usr/bin/env node
/**
 * Rotator simulator — WebSocket server speaking rotctld protocol.
 * Simulates a rotator that gradually slews toward the target position.
 *
 * Usage:
 *   node scripts/rotator-sim.mjs [port]
 *
 * Default port: 4533
 * Then connect in the app to ws://localhost:4533 (Network mode).
 *
 * Supported rotctld commands:
 *   p        → get position (returns two lines: az\nel)
 *   P az el  → set target position
 *   S        → stop (freeze at current position)
 *   q        → close connection
 */

import { WebSocketServer } from 'ws';

const PORT = parseInt(process.argv[2] || '4533', 10);
const TICK_MS = 50;

// Motor parameters — mimics a mid-range Yaesu-style rotator
const AZ_MAX_SPEED = 6.0;   // °/s peak azimuth slew
const EL_MAX_SPEED = 3.0;   // °/s peak elevation slew (typically slower)
const ACCEL = 8.0;          // °/s² ramp-up
const DECEL = 10.0;         // °/s² ramp-down (braking is usually faster)
const BACKLASH = 0.3;       // ° overshoot on direction reversal

let az = 0.0;
let el = 0.0;
let targetAz = 0.0;
let targetEl = 0.0;
let azSpeed = 0.0;  // current °/s
let elSpeed = 0.0;
let moving = false;

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function shortestAzPath(from, to) {
  let diff = to - from;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return diff;
}

function stepAxis(pos, speed, target, maxSpeed, isAz) {
  const dt = TICK_MS / 1000;
  const diff = isAz ? shortestAzPath(pos, target) : target - pos;
  const absDiff = Math.abs(diff);

  if (absDiff < 0.01 && Math.abs(speed) < 0.1) {
    return { pos: target, speed: 0 };
  }

  const dir = Math.sign(diff);

  // Stopping distance at current speed
  const stopDist = (speed * speed) / (2 * DECEL);

  if (absDiff <= stopDist + 0.05) {
    // Decelerate
    speed -= Math.sign(speed) * DECEL * dt;
    if (Math.sign(speed) !== dir && absDiff < 0.5) speed = 0;
  } else {
    // Accelerate toward target, capped at max speed
    speed += dir * ACCEL * dt;
    speed = clamp(speed, -maxSpeed, maxSpeed);
  }

  pos += speed * dt;

  // Wrap azimuth
  if (isAz) {
    if (pos < 0) pos += 360;
    if (pos >= 360) pos -= 360;
  } else {
    pos = clamp(pos, 0, 90);
  }

  return { pos, speed };
}

// Slew simulation
setInterval(() => {
  if (!moving) return;

  const azResult = stepAxis(az, azSpeed, targetAz, AZ_MAX_SPEED, true);
  az = azResult.pos;
  azSpeed = azResult.speed;

  const elResult = stepAxis(el, elSpeed, targetEl, EL_MAX_SPEED, false);
  el = elResult.pos;
  elSpeed = elResult.speed;

  if (azSpeed === 0 && elSpeed === 0 &&
      Math.abs(shortestAzPath(az, targetAz)) < 0.01 &&
      Math.abs(el - targetEl) < 0.01) {
    az = targetAz;
    el = targetEl;
    moving = false;
    log('Reached target position');
  }
}, TICK_MS);

function log(msg) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}]  ${msg}`);
}

function posStr() {
  return `az=${az.toFixed(1)}° el=${el.toFixed(1)}°`;
}

const wss = new WebSocketServer({ port: PORT });

console.log(`\n  Rotator simulator listening on ws://localhost:${PORT}`);
console.log(`  Az max: ${AZ_MAX_SPEED}°/s  El max: ${EL_MAX_SPEED}°/s  Accel: ${ACCEL}°/s²`);
console.log(`  Position: ${posStr()}\n`);

wss.on('connection', (ws, req) => {
  const remote = req.socket.remoteAddress;
  log(`Client connected from ${remote}`);

  ws.on('message', (data) => {
    const raw = data.toString().trim();
    if (!raw) return;

    // rotctld protocol: commands can be line-separated
    const lines = raw.split('\n');
    for (const line of lines) {
      const cmd = line.trim();
      if (!cmd) continue;

      if (cmd === 'p') {
        // Get position — return two lines
        const reply = `${az.toFixed(6)}\n${el.toFixed(6)}\n`;
        ws.send(reply);
        log(`← p  →  ${posStr()}`);
      } else if (cmd.startsWith('P ') || cmd.startsWith('P\t')) {
        // Set position
        const parts = cmd.split(/\s+/);
        if (parts.length >= 3) {
          targetAz = parseFloat(parts[1]);
          targetEl = clamp(parseFloat(parts[2]), 0, 90);
          moving = true;
          ws.send('RPRT 0\n');
          log(`← P ${targetAz.toFixed(1)} ${targetEl.toFixed(1)}  (moving from ${posStr()})`);
        } else {
          ws.send('RPRT -1\n');
          log(`← P  (bad args: "${cmd}")`);
        }
      } else if (cmd === 'S') {
        // Stop — freeze target to current, zero speeds
        targetAz = az;
        targetEl = el;
        azSpeed = 0;
        elSpeed = 0;
        moving = false;
        ws.send('RPRT 0\n');
        log(`← S  (stopped at ${posStr()})`);
      } else if (cmd === 'q') {
        log('← q  (quit)');
        ws.close();
      } else {
        ws.send('RPRT -1\n');
        log(`← ???  "${cmd}"`);
      }
    }
  });

  ws.on('close', () => {
    log('Client disconnected');
  });

  ws.on('error', (err) => {
    log(`WebSocket error: ${err.message}`);
  });
});

wss.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  Port ${PORT} is already in use. Try: node scripts/rotator-sim.mjs ${PORT + 1}\n`);
  } else {
    console.error(`Server error: ${err.message}`);
  }
  process.exit(1);
});

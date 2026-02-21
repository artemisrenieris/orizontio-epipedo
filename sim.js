const g = 10;
const TRACE_MAX = 5000;

const canvas = document.getElementById("simCanvas");
const ctx = canvas.getContext("2d");
const diagCanvas = document.getElementById("diagCanvas");
const dctx = diagCanvas.getContext("2d");

const massSlider = document.getElementById("massSlider");
const muSlider = document.getElementById("muSlider");
const forceSlider = document.getElementById("forceSlider");
const forceTimeSlider = document.getElementById("forceTimeSlider");
const vectorsToggle = document.getElementById("vectorsToggle");

const playBtn = document.getElementById("playBtn");
const pauseBtn = document.getElementById("pauseBtn");
const resetBtn = document.getElementById("resetBtn");
const slowBtn = document.getElementById("slowBtn");
const miniPlayBtn = document.getElementById("miniPlayBtn");
const miniResetBtn = document.getElementById("miniResetBtn");
const miniSlowBtn = document.getElementById("miniSlowBtn");
const graphModeSelect = document.getElementById("graphModeSelect");

const massValue = document.getElementById("massValue");
const muValue = document.getElementById("muValue");
const forceValue = document.getElementById("forceValue");
const forceTimeValue = document.getElementById("forceTimeValue");

const tValue = document.getElementById("tValue");
const xValue = document.getElementById("xValue");
const vValue = document.getElementById("vValue");
const aValue = document.getElementById("aValue");
const fricValue = document.getElementById("fricValue");
const fnetValue = document.getElementById("fnetValue");
const s1Value = document.getElementById("s1Value");
const s2Value = document.getElementById("s2Value");
const phaseLine = document.getElementById("phaseLine");
const statusLine = document.getElementById("statusLine");

const state = {
  m: Number(massSlider.value),
  mu: Number(muSlider.value),
  F: Number(forceSlider.value),
  forceDuration: Number(forceTimeSlider.value),
  showVectors: vectorsToggle.checked,
  playing: false,
  slowMotion: false,
  timeScale: 1,
  t: 0,
  x: 0,
  v: 0,
  a: 0,
  T: 0,
  Fnet: 0,
  Factive: 0,
  phase: "ready",
  stopCaptured: false,
  markers: {
    start: { x: 0, t: 0, v: 0 },
    forceOff: null,
    stop: null
  },
  status: "Κατάσταση: Έτοιμο.",
  graphMode: graphModeSelect.value,
  trace: [],
  yMin: -0.2,
  yMax: 0.2,
  tAxisMax: 0.5,
  tPredictedMax: 0.5,
  xPredictedMax: 12,
  prediction: null,
  lastTime: null
};

function graphSeriesConfig() {
  switch (state.graphMode) {
    case "a":
      return { key: "a", label: "α(t) [m/s²]", color: "#6a4c93" };
    case "x":
      return { key: "x", label: "x(t) [m]", color: "#2a9d8f" };
    case "fnet":
      return { key: "fnet", label: "ΣF(t) [N]", color: "#d90429" };
    case "v":
    default:
      return { key: "v", label: "υ(t) [m/s]", color: "#f77f00" };
  }
}

function syncTransportLabels() {
  miniPlayBtn.textContent = state.playing ? "Pause" : "Start";
}

function updatePredictedRange() {
  const T = state.mu * state.m * g;
  const net1 = state.F - T;
  const a1 = Math.max(0, net1 / state.m);
  const v1 = a1 * state.forceDuration;
  const s1 = 0.5 * a1 * state.forceDuration * state.forceDuration;
  const decel = state.mu * g;
  const t2 = decel > 1e-9 ? v1 / decel : 0;
  const s2 = decel > 1e-9 ? (v1 * v1) / (2 * decel) : 0;
  const totalT = a1 <= 1e-9 ? state.forceDuration : state.forceDuration + t2;
  state.prediction = {
    T,
    net1,
    a1,
    a2: decel > 1e-9 ? -decel : 0,
    v1,
    s1,
    s2,
    xTotal: s1 + s2,
    tTotal: totalT
  };
  state.tPredictedMax = Math.max(0.5, totalT);
  state.xPredictedMax = Math.max(8, (s1 + s2) * 1.25 + 1);
}

function updateDynamics() {
  state.T = state.mu * state.m * g;
  state.Factive = state.t < state.forceDuration ? state.F : 0;
  const netRaw = state.Factive - state.T;

  if (state.t < state.forceDuration) {
    if (state.v <= 1e-6 && netRaw <= 0) {
      state.phase = "stuck";
      state.Fnet = 0;
      state.a = 0;
      state.status = "Κατάσταση: Η F δεν ξεπερνά την τριβή, το σώμα μένει ακίνητο.";
    } else {
      state.phase = "force";
      state.Fnet = netRaw;
      state.a = state.Fnet / state.m;
      state.status = "Κατάσταση: Φάση 1, ασκείται η F (Ε.Ο.Επιτ.Κ.).";
    }
  } else if (state.v > 1e-6) {
    state.phase = "friction";
    state.Fnet = -state.T;
    state.a = state.Fnet / state.m;
    state.status = "Κατάσταση: Φάση 2, μόνο τριβή μέχρι στάση.";
  } else {
    state.phase = "stopped";
    state.Fnet = 0;
    state.a = 0;
    state.status = "Κατάσταση: Το σώμα σταμάτησε.";
  }
}

function pushHistoryPoint() {
  const point = {
    t: state.t,
    x: state.x,
    v: state.v,
    a: state.a,
    fnet: state.Fnet
  };

  const last = state.trace[state.trace.length - 1];
  if (last && Math.abs(last.t - point.t) < 1e-9) {
    state.trace[state.trace.length - 1] = point;
  } else {
    state.trace.push(point);
  }
  if (state.trace.length > TRACE_MAX) {
    state.trace.shift();
  }
  updateTraceBounds();
}

function updateTraceBounds() {
  const p = state.prediction;
  if (!p) {
    state.yMin = -0.2;
    state.yMax = 0.2;
    state.tAxisMax = Math.max(0.5, state.t);
    return;
  }

  const minSpan = 0.2;
  if (state.graphMode === "v") {
    const vmax = Math.max(0.2, p.v1);
    state.yMin = -0.08 * vmax;
    state.yMax = vmax * 1.12;
  } else if (state.graphMode === "a") {
    const lo = Math.min(0, p.a2);
    const hi = Math.max(0, p.a1);
    const span = Math.max(minSpan, hi - lo);
    const pad = 0.2 * span;
    state.yMin = lo - pad;
    state.yMax = hi + pad;
  } else if (state.graphMode === "x") {
    const xmax = Math.max(0.5, p.xTotal);
    state.yMin = -0.06 * xmax;
    state.yMax = xmax * 1.1;
  } else {
    const f1 = p.net1;
    const f2 = -p.T;
    const lo = Math.min(0, f1, f2);
    const hi = Math.max(0, f1, f2);
    const span = Math.max(1, hi - lo);
    const pad = 0.18 * span;
    state.yMin = lo - pad;
    state.yMax = hi + pad;
  }

  state.tAxisMax = Math.max(0.5, state.tPredictedMax, state.t);
}

function resetTraceNow() {
  state.trace = [{ t: state.t, x: state.x, v: state.v, a: state.a, fnet: state.Fnet }];
  updateTraceBounds();
}

function updateReadouts() {
  massValue.textContent = state.m.toFixed(1);
  muValue.textContent = state.mu.toFixed(2);
  forceValue.textContent = state.F.toFixed(1);
  forceTimeValue.textContent = state.forceDuration.toFixed(1);

  tValue.textContent = state.t.toFixed(2);
  xValue.textContent = state.x.toFixed(2);
  vValue.textContent = state.v.toFixed(2);
  aValue.textContent = state.a.toFixed(2);
  fricValue.textContent = state.T.toFixed(2);
  fnetValue.textContent = state.Fnet.toFixed(2);
  const s1 = state.markers.forceOff ? state.markers.forceOff.x : state.x;
  const s2 = state.markers.forceOff ? Math.max(0, state.x - state.markers.forceOff.x) : 0;
  s1Value.textContent = s1.toFixed(2);
  s2Value.textContent = s2.toFixed(2);

  phaseLine.textContent = `Φάση: ${state.phase === "force" ? "Με F" : state.phase === "friction" ? "Μόνο τριβή" : state.phase === "stuck" ? "Ακίνητο (F<=T)" : state.phase === "stopped" ? "Στάση" : "Έτοιμο"}`;
  statusLine.textContent = state.status;
}

function drawArrow(x, y, vx, vy, color, label) {
  if (Math.hypot(vx, vy) < 1) {
    return;
  }
  const tx = x + vx;
  const ty = y + vy;

  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(tx, ty);
  ctx.stroke();

  const a = Math.atan2(vy, vx);
  const h = 11;
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(tx - h * Math.cos(a - Math.PI / 6), ty - h * Math.sin(a - Math.PI / 6));
  ctx.lineTo(tx - h * Math.cos(a + Math.PI / 6), ty - h * Math.sin(a + Math.PI / 6));
  ctx.closePath();
  ctx.fill();

  if (label) {
    ctx.font = "bold 13px Arial";
    ctx.fillText(label, tx + 6, ty - 6);
  }
}

function drawCanvasStatus(text) {
  if (!text) return;
  const padX = 12;
  const boxY = 10;
  ctx.font = "bold 14px Arial";
  const metrics = ctx.measureText(text);
  const boxW = Math.min(canvas.width - 24, metrics.width + padX * 2);
  const boxH = 28;
  const boxX = (canvas.width - boxW) / 2;

  ctx.fillStyle = "rgba(255,255,255,0.86)";
  ctx.strokeStyle = "#b7c7da";
  ctx.lineWidth = 1.2;
  ctx.fillRect(boxX, boxY, boxW, boxH);
  ctx.strokeRect(boxX, boxY, boxW, boxH);

  ctx.fillStyle = "#1d3557";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, boxX + boxW / 2, boxY + boxH / 2 + 0.5, boxW - padX * 2);
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

function drawScene() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const y = 360;
  const left = 90;
  const right = 910;

  ctx.strokeStyle = "#7f94af";
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(left, y);
  ctx.lineTo(right, y);
  ctx.stroke();

  const xScale = (right - left - 80) / state.xPredictedMax;
  const blockX = left + 40 + Math.min(state.xPredictedMax, state.x) * xScale;
  const blockY = y - 20;

  const startPx = left + 40;
  const forceOffPx = state.markers.forceOff
    ? left + 40 + Math.min(state.xPredictedMax, state.markers.forceOff.x) * xScale
    : left + 40 + Math.min(state.xPredictedMax, state.x) * xScale;
  const nowPx = left + 40 + Math.min(state.xPredictedMax, state.x) * xScale;

  // Visualize displacement per phase directly on the track.
  if (forceOffPx > startPx + 1) {
    ctx.strokeStyle = "rgba(123, 44, 191, 0.95)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(startPx, y + 18);
    ctx.lineTo(forceOffPx, y + 18);
    ctx.stroke();
    ctx.fillStyle = "#7b2cbf";
    ctx.font = "bold 12px Arial";
    ctx.fillText("Δx₁", (startPx + forceOffPx) * 0.5 - 12, y + 35);
  }
  if (nowPx > forceOffPx + 1) {
    ctx.strokeStyle = "rgba(42, 157, 143, 0.95)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(forceOffPx, y + 18);
    ctx.lineTo(nowPx, y + 18);
    ctx.stroke();
    ctx.fillStyle = "#2a9d8f";
    ctx.font = "bold 12px Arial";
    ctx.fillText("Δx₂", (forceOffPx + nowPx) * 0.5 - 12, y + 35);
  }

  function drawMarker(marker, color) {
    if (!marker) {
      return;
    }
    const mx = left + 40 + Math.min(state.xPredictedMax, marker.x) * xScale;
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(mx, y - 48);
    ctx.lineTo(mx, y + 44);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(mx, y, 3.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = "bold 12px Arial";
    ctx.fillText(`υ=${marker.v.toFixed(2)} m/s`, mx - 34, y - 56);
    ctx.fillText(`t=${marker.t.toFixed(2)} s`, mx - 28, y + 60);
  }

  drawMarker(state.markers.start, "#1d3557");
  drawMarker(state.markers.forceOff, "#7b2cbf");
  drawMarker(state.markers.stop, "#d90429");

  function drawGhostBody(marker) {
    if (!marker) {
      return;
    }
    const mx = left + 40 + Math.min(state.xPredictedMax, marker.x) * xScale;
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = "#1d3557";
    ctx.lineWidth = 2;
    ctx.strokeRect(mx - 24, blockY - 20, 48, 40);
    ctx.restore();
  }

  drawGhostBody(state.markers.start);
  drawGhostBody(state.markers.forceOff);
  drawGhostBody(state.markers.stop);

  ctx.fillStyle = "#264653";
  ctx.fillRect(blockX - 24, blockY - 20, 48, 40);

  ctx.fillStyle = "#13233f";
  ctx.font = "bold 15px Arial";
  ctx.fillText("Οριζόντιο επίπεδο με τριβή", 42, 44);
  ctx.fillText(`x = ${state.x.toFixed(2)} m`, 42, 74);
  ctx.fillText(`υ = ${state.v.toFixed(2)} m/s`, 42, 96);

  if (state.showVectors && state.phase !== "stopped") {
    const fLen = state.Factive > 0 ? Math.min(220, Math.max(30, state.Factive * 3.6)) : 0;
    const tLen = state.v > 0.001 || state.phase === "force" ? Math.min(220, Math.max(30, state.T * 3.6)) : 0;
    const nLen = Math.min(220, Math.max(42, state.m * g * 1.35));

    drawArrow(blockX, blockY - 30, 0, -nLen, "#1d3557", "N");
    drawArrow(blockX, blockY + 30, 0, nLen, "#1d3557", "mg");
    if (fLen > 0) drawArrow(blockX, blockY, fLen, 0, "#ff3b30", "F");
    if (tLen > 0) drawArrow(blockX, blockY, -tLen, 0, "#ff3b30", "T");
    if (Math.abs(state.v) > 0.001) {
      drawArrow(
        blockX + 16,
        blockY - 44,
        Math.sign(state.v) * Math.min(130, Math.max(24, Math.abs(state.v) * 16)),
        0,
        "#f77f00",
        "υ"
      );
    }
  }

  drawCanvasStatus(state.status);
}

function drawMiniSeriesBox(x, y, w, h, label, points, key, color, minVal, maxVal, tMax) {
  dctx.strokeStyle = "#b5c5d9";
  dctx.fillStyle = "rgba(255,255,255,0.9)";
  dctx.lineWidth = 1.2;
  dctx.fillRect(x, y, w, h);
  dctx.strokeRect(x, y, w, h);

  dctx.fillStyle = "#2a3f5e";
  dctx.font = "bold 14px Arial";
  dctx.fillText(label, x + 8, y + 15);

  const plotX = x + 56;
  const plotY = y + 22;
  const plotW = w - 64;
  const plotH = h - 28;

  const toX = (t) => plotX + (t / tMax) * plotW;
  const toY = (v) => plotY + plotH - ((v - minVal) / (maxVal - minVal)) * plotH;

  // Subtle XY axes so students can orient quickly without clutter.
  const hasValidScale = maxVal - minVal > 1e-9 && tMax > 0;
  const xAxisY = hasValidScale && minVal <= 0 && maxVal >= 0 ? toY(0) : plotY + plotH;
  const yAxisX = plotX;
  dctx.strokeStyle = "rgba(42, 63, 94, 0.42)";
  dctx.lineWidth = 1.2;
  dctx.beginPath();
  dctx.moveTo(yAxisX, plotY);
  dctx.lineTo(yAxisX, plotY + plotH);
  dctx.moveTo(plotX, xAxisY);
  dctx.lineTo(plotX + plotW, xAxisY);
  dctx.stroke();
  dctx.fillStyle = "rgba(42, 63, 94, 0.72)";
  dctx.font = "bold 11px Arial";
  dctx.fillText("Y", yAxisX + 4, plotY + 12);
  dctx.fillText("X", plotX + plotW - 10, xAxisY - 6);

  if (points.length < 2 || !hasValidScale) {
    return;
  }

  const yTicks = 5;
  dctx.font = "11px Arial";
  dctx.fillStyle = "#34506f";
  dctx.strokeStyle = "#d6e0eb";
  dctx.lineWidth = 1;
  for (let i = 0; i <= yTicks; i += 1) {
    const frac = i / yTicks;
    const yv = maxVal - frac * (maxVal - minVal);
    const py = plotY + frac * plotH;
    dctx.beginPath();
    dctx.moveTo(plotX, py);
    dctx.lineTo(plotX + plotW, py);
    dctx.stroke();
    dctx.fillText(yv.toFixed(2), x + 6, py + 4);
  }

  dctx.strokeStyle = color;
  dctx.lineWidth = 2.6;
  dctx.beginPath();
  points.forEach((p, i) => {
    const px = toX(p.t);
    const py = toY(p[key]);
    if (i === 0) dctx.moveTo(px, py);
    else dctx.lineTo(px, py);
  });
  dctx.stroke();

  // Max-value trace: highlight its level on Y axis and project to the peak point.
  let maxPoint = points[0];
  for (let i = 1; i < points.length; i += 1) {
    if (points[i][key] > maxPoint[key]) {
      maxPoint = points[i];
    }
  }
  if (maxPoint) {
    const maxY = toY(maxPoint[key]);
    const maxX = toX(maxPoint.t);

    dctx.save();
    dctx.setLineDash([4, 4]);
    dctx.strokeStyle = "rgba(42, 63, 94, 0.45)";
    dctx.lineWidth = 1.1;
    dctx.beginPath();
    dctx.moveTo(plotX, maxY);
    dctx.lineTo(maxX, maxY);
    dctx.stroke();
    dctx.restore();

    dctx.strokeStyle = color;
    dctx.lineWidth = 2;
    dctx.beginPath();
    dctx.moveTo(plotX - 6, maxY);
    dctx.lineTo(plotX + 6, maxY);
    dctx.stroke();

    dctx.fillStyle = color;
    dctx.font = "bold 10px Arial";
    dctx.textAlign = "right";
    dctx.textBaseline = "middle";
    dctx.fillText(`max ${maxPoint[key].toFixed(2)}`, plotX - 8, maxY);
    dctx.textAlign = "start";
    dctx.textBaseline = "alphabetic";
  }

  // Phase separators on graph: force-off and stop.
  const tForceOff = state.markers.forceOff ? state.markers.forceOff.t : null;
  const tStop = state.markers.stop ? state.markers.stop.t : null;
  if (tForceOff !== null && tForceOff > 0 && tForceOff <= tMax) {
    const px = toX(tForceOff);
    dctx.save();
    dctx.setLineDash([4, 4]);
    dctx.strokeStyle = "#7b2cbf";
    dctx.lineWidth = 1.4;
    dctx.beginPath();
    dctx.moveTo(px, plotY);
    dctx.lineTo(px, plotY + plotH);
    dctx.stroke();
    dctx.restore();
    dctx.fillStyle = "#7b2cbf";
    dctx.font = "bold 11px Arial";
    dctx.fillText("F off", px + 4, plotY + 12);
  }
  if (tStop !== null && tStop > 0 && tStop <= tMax) {
    const px = toX(tStop);
    dctx.save();
    dctx.setLineDash([4, 4]);
    dctx.strokeStyle = "#2a9d8f";
    dctx.lineWidth = 1.4;
    dctx.beginPath();
    dctx.moveTo(px, plotY);
    dctx.lineTo(px, plotY + plotH);
    dctx.stroke();
    dctx.restore();
    dctx.fillStyle = "#2a9d8f";
    dctx.font = "bold 11px Arial";
    dctx.fillText("stop", px + 4, plotY + 24);
  }

  const latest = points[points.length - 1];
  if (latest) {
    const yNow = toY(latest[key]);
    dctx.save();
    dctx.setLineDash([5, 4]);
    dctx.strokeStyle = "rgba(42, 63, 94, 0.55)";
    dctx.lineWidth = 1.3;
    dctx.beginPath();
    dctx.moveTo(plotX, yNow);
    dctx.lineTo(plotX + plotW, yNow);
    dctx.stroke();
    dctx.restore();

    dctx.fillStyle = "#2a3f5e";
    dctx.font = "bold 11px Arial";
    dctx.textAlign = "right";
    dctx.textBaseline = "middle";
    dctx.fillText(latest[key].toFixed(2), plotX + plotW - 4, yNow - 8);
    dctx.textAlign = "start";
    dctx.textBaseline = "alphabetic";
  }
}

function drawLiveBars(x, y, w, h) {
  dctx.fillStyle = "rgba(255,255,255,0.92)";
  dctx.strokeStyle = "#b5c5d9";
  dctx.lineWidth = 1.2;
  dctx.fillRect(x, y, w, h);
  dctx.strokeRect(x, y, w, h);

  const labels = ["|F|", "|T|", "|ΣF|"];
  const colors = ["#f28482", "#f4a261", "#2a9d8f"];
  const values = [Math.abs(state.Factive), Math.abs(state.T), Math.abs(state.Fnet)];
  const maxAbs = Math.max(1, ...values);
  const zeroY = y + h * 0.86;
  const innerPad = 10;
  const gap = 10;
  const barAreaW = Math.max(90, w - innerPad * 2 - gap * 2);
  const barW = Math.max(22, barAreaW / 3);
  const startX = x + innerPad;

  dctx.strokeStyle = "#c8d7e8";
  dctx.beginPath();
  dctx.moveTo(x + 8, zeroY);
  dctx.lineTo(x + w - 8, zeroY);
  dctx.stroke();

  values.forEach((v, i) => {
    const bh = (Math.abs(v) / maxAbs) * (h * 0.62);
    const bx = startX + i * (barW + gap);
    const by = zeroY - bh;
    dctx.fillStyle = colors[i];
    dctx.fillRect(bx, by, barW, bh);
    dctx.fillStyle = "#233c5b";
    dctx.font = "bold 12px Arial";
    dctx.fillText(labels[i], bx, y + h - 10);
    dctx.fillText(v.toFixed(2), bx, by - 5);
  });
}

function drawFormulaBox(x, y, w, h) {
  dctx.fillStyle = "rgba(255,255,255,0.93)";
  dctx.strokeStyle = "#b5c5d9";
  dctx.lineWidth = 1.2;
  dctx.fillRect(x, y, w, h);
  dctx.strokeRect(x, y, w, h);

  dctx.fillStyle = "#223854";
  dctx.font = "bold 14px Arial";
  dctx.fillText("Live σχέσεις", x + 8, y + 15);
  dctx.font = "13px Arial";

  const l1 = `T = μmg = ${state.mu.toFixed(2)}·${state.m.toFixed(2)}·${g.toFixed(0)} = ${state.T.toFixed(2)} N`;
  const l2 = `Φ1: ΣF = F - T = ${state.Factive.toFixed(2)} - ${state.T.toFixed(2)} = ${(state.Factive - state.T).toFixed(2)} N`;
  const l3 = `Φ2: ΣF = -T = ${(-state.T).toFixed(2)} N`;
  const l4 = `α = ΣF/m = ${state.Fnet.toFixed(2)}/${state.m.toFixed(2)} = ${state.a.toFixed(2)} m/s²`;
  const l5 = `x=${state.x.toFixed(2)} m, υ=${state.v.toFixed(2)} m/s, t=${state.t.toFixed(2)} s`;

  dctx.fillText(l1, x + 8, y + 34);
  dctx.fillText(l2, x + 8, y + 52);
  dctx.fillText(l3, x + 8, y + 70);
  dctx.fillText(l4, x + 8, y + 88);
  dctx.fillText(l5, x + 8, y + 106);
}

function drawDiagnosticsPanel() {
  dctx.clearRect(0, 0, diagCanvas.width, diagCanvas.height);
  const pad = 12;
  const graphCfg = graphSeriesConfig();
  const narrow = diagCanvas.width < 760;

  if (narrow) {
    const fullW = diagCanvas.width - pad * 2;
    const graphH = Math.floor(diagCanvas.height * 0.47);
    const barsH = Math.floor(diagCanvas.height * 0.23);
    const formulaH = diagCanvas.height - graphH - barsH - pad * 4;
    drawMiniSeriesBox(pad, pad, fullW, graphH, graphCfg.label, state.trace, graphCfg.key, graphCfg.color, state.yMin, state.yMax, state.tAxisMax);
    drawLiveBars(pad, pad * 2 + graphH, fullW, barsH);
    drawFormulaBox(pad, pad * 3 + graphH + barsH, fullW, formulaH);
  } else {
    const leftW = Math.floor(diagCanvas.width * 0.5);
    const rightW = diagCanvas.width - leftW - pad * 3;
    const gx = pad;
    const gy = pad;
    const gw = leftW;
    const graphH = diagCanvas.height - pad * 2;
    drawMiniSeriesBox(gx, gy, gw, graphH, graphCfg.label, state.trace, graphCfg.key, graphCfg.color, state.yMin, state.yMax, state.tAxisMax);

    const rightX = gx + gw + pad;
    const barsH = 165;
    drawLiveBars(rightX, gy, rightW, barsH);
    drawFormulaBox(rightX, gy + barsH + 8, rightW, diagCanvas.height - (gy + barsH + 8) - pad);
  }
}

function resetMotion() {
  state.playing = false;
  state.t = 0;
  state.x = 0;
  state.v = 0;
  state.stopCaptured = false;
  state.markers = {
    start: { x: 0, t: 0, v: 0 },
    forceOff: null,
    stop: null
  };
}

function syncInputs() {
  state.m = Number(massSlider.value);
  state.mu = Number(muSlider.value);
  state.F = Number(forceSlider.value);
  state.forceDuration = Number(forceTimeSlider.value);
  state.showVectors = vectorsToggle.checked;
  updatePredictedRange();
  updateDynamics();
  updateReadouts();
  if (!state.playing) {
    resetTraceNow();
  }
}

function runPlay() {
  if (state.phase === "stopped") {
    resetMotion();
    updateDynamics();
    resetTraceNow();
  }
  state.playing = true;
  syncTransportLabels();
}

function runPause() {
  state.playing = false;
  syncTransportLabels();
}

function runReset() {
  resetMotion();
  updateDynamics();
  resetTraceNow();
  syncTransportLabels();
  updateReadouts();
  drawScene();
  drawDiagnosticsPanel();
}

function toggleSlow() {
  state.slowMotion = !state.slowMotion;
  state.timeScale = state.slowMotion ? 0.25 : 1;
  slowBtn.textContent = `Slow motion: ${state.slowMotion ? "On" : "Off"}`;
  slowBtn.classList.toggle("slow-on", state.slowMotion);
  miniSlowBtn.classList.toggle("slow-on", state.slowMotion);
}

function integrate(dt) {
  let remaining = dt;

  while (remaining > 1e-9) {
    updateDynamics();
    if (state.phase === "stopped") {
      break;
    }

    let segment = remaining;
    if (state.t < state.forceDuration) {
      segment = Math.min(segment, state.forceDuration - state.t);
    }

    if (state.phase === "stuck") {
      state.t += segment;
      if (!state.markers.forceOff && state.t >= state.forceDuration - 1e-9) {
        state.markers.forceOff = { x: state.x, t: state.forceDuration, v: state.v };
      }
      remaining -= segment;
      pushHistoryPoint();
      continue;
    }

    if (state.phase === "force") {
      state.x += state.v * segment + 0.5 * state.a * segment * segment;
      state.v += state.a * segment;
      state.t += segment;
      if (!state.markers.forceOff && state.t >= state.forceDuration - 1e-9) {
        state.markers.forceOff = { x: state.x, t: state.forceDuration, v: state.v };
      }
      remaining -= segment;
      pushHistoryPoint();
      continue;
    }

    if (state.phase === "friction") {
      const decel = state.mu * g;
      if (decel <= 1e-9) {
        state.x += state.v * segment;
        state.t += segment;
        remaining -= segment;
        continue;
      }

      const tStop = state.v / decel;
      if (tStop <= segment + 1e-9) {
        state.x += state.v * tStop - 0.5 * decel * tStop * tStop;
        state.t += tStop;
        state.v = 0;
        remaining -= tStop;
      } else {
        state.x += state.v * segment - 0.5 * decel * segment * segment;
        state.v -= decel * segment;
        state.t += segment;
        remaining -= segment;
      }
      pushHistoryPoint();
      continue;
    }
  }

  updateDynamics();
  if (state.phase === "stopped") {
    if (!state.markers.stop) {
      state.markers.stop = { x: state.x, t: state.t, v: state.v };
    }
    state.playing = false;
  }
  pushHistoryPoint();
}

function tick(timestamp) {
  if (state.lastTime === null) {
    state.lastTime = timestamp;
  }

  const dt = Math.min(0.033, (timestamp - state.lastTime) / 1000) * state.timeScale;
  state.lastTime = timestamp;

  if (state.playing) {
    integrate(dt);
  } else {
    updateDynamics();
  }

  syncTransportLabels();
  updateReadouts();
  drawScene();
  drawDiagnosticsPanel();
  requestAnimationFrame(tick);
}

[massSlider, muSlider, forceSlider, forceTimeSlider].forEach((el) => {
  el.addEventListener("input", syncInputs);
});

vectorsToggle.addEventListener("change", syncInputs);

playBtn.addEventListener("click", runPlay);
pauseBtn.addEventListener("click", runPause);
resetBtn.addEventListener("click", runReset);
slowBtn.addEventListener("click", toggleSlow);

miniPlayBtn.addEventListener("click", () => {
  if (state.playing) runPause();
  else runPlay();
});
miniResetBtn.addEventListener("click", runReset);
miniSlowBtn.addEventListener("click", toggleSlow);

graphModeSelect.addEventListener("change", () => {
  state.graphMode = graphModeSelect.value;
  state.yMin = -0.2;
  state.yMax = 0.2;
  updateTraceBounds();
});

syncInputs();
syncTransportLabels();
resetTraceNow();
requestAnimationFrame(tick);

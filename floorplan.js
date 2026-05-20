/* ===================================================
   LAKEWOOD RESIDENCE – FLOOR PLAN DRAWING ENGINE
   Renders a 2D architectural floor plan on <canvas>
   with dimensions, furniture, doors, windows, labels.
   Also handles PDF and DWG export.
   =================================================== */

(function () {
  "use strict";

  /* ── CANVAS SETUP ──────────────────────────────── */
  const canvas = document.getElementById("floorCanvas");
  const ctx    = canvas.getContext("2d");

  // Drawing units: 1 unit = 10px at 1:50 scale
  // Real-world: 1 unit = 500mm = 0.5m
  const SCALE  = 14;        // px per unit
  const W_EXT  = 6;         // exterior wall thickness (units)
  const W_INT  = 3;         // interior wall thickness (units)

  // Canvas logical size in units (house footprint + margin)
  const CW = 148;
  const CH = 120;

  canvas.width  = CW * SCALE;
  canvas.height = CH * SCALE;

  /* ── COLOUR PALETTE ────────────────────────────── */
  const C = {
    bg:        "#071428",
    wallExt:   "#3a7cbd",
    wallInt:   "#2a5a8a",
    wallFill:  "#1a3a5a",
    intFill:   "#102030",
    window:    "rgba(0,212,255,0.55)",
    doorSwing: "rgba(0,212,255,0.18)",
    doorLine:  "#00d4ff",
    dim:       "#ff6b35",
    dimText:   "#ff6b35",
    label:     "#c9d8e8",
    labelSub:  "#4a8ab0",
    furn:      "rgba(255,107,53,0.18)",
    furnStroke:"#ff6b35",
    grid:      "rgba(0,212,255,0.04)",
    hatching:  "rgba(58,124,189,0.25)",
    roomTint:  [
      "rgba(0,212,255,0.04)",
      "rgba(0,180,140,0.04)",
      "rgba(255,107,53,0.04)",
      "rgba(180,100,255,0.04)",
      "rgba(255,200,50,0.04)",
      "rgba(50,200,100,0.04)",
    ],
  };

  /* ── UTILITY ────────────────────────────────────── */
  const u  = (v) => v * SCALE;
  const uh = (v) => v * SCALE + 0.5; // half-pixel crisp lines

  function rect(x, y, w, h, fill, stroke, lw = 1) {
    ctx.beginPath();
    ctx.rect(u(x), u(y), u(w), u(h));
    if (fill)   { ctx.fillStyle   = fill;   ctx.fill();   }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
  }

  function line(x1, y1, x2, y2, color, lw = 1, dash = []) {
    ctx.beginPath();
    ctx.setLineDash(dash);
    ctx.moveTo(u(x1), u(y1));
    ctx.lineTo(u(x2), u(y2));
    ctx.strokeStyle = color;
    ctx.lineWidth   = lw;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function text(str, x, y, color, size = 9, align = "center", font = "'Share Tech Mono', monospace") {
    ctx.font         = `${size}px ${font}`;
    ctx.fillStyle    = color;
    ctx.textAlign    = align;
    ctx.textBaseline = "middle";
    ctx.fillText(str, u(x), u(y));
  }

  /* ── DIMENSION LINE HELPER ─────────────────────── */
  function dim(x1, y1, x2, y2, label, offset = 4, horiz = true) {
    const tick = 1.5;
    if (horiz) {
      const oy = y1 - offset;
      // witness lines
      line(x1, y1, x1, oy - tick, C.dim, 0.8);
      line(x2, y2, x2, oy - tick, C.dim, 0.8);
      // dimension line with arrows
      line(x1, oy, x2, oy, C.dim, 0.8);
      // arrowheads
      arrow(u(x1), u(oy), "right");
      arrow(u(x2), u(oy), "left");
      // label
      const mx = (x1 + x2) / 2;
      // white knockout box
      ctx.fillStyle = C.bg;
      ctx.fillRect(u(mx) - 22, u(oy) - 6, 44, 12);
      text(label, mx, oy, C.dimText, 8);
    } else {
      const ox = x1 - offset;
      line(x1, y1, ox - tick, y1, C.dim, 0.8);
      line(x2, y2, ox - tick, y2, C.dim, 0.8);
      line(ox, y1, ox, y2, C.dim, 0.8);
      arrow(u(ox), u(y1), "down");
      arrow(u(ox), u(y2), "up");
      const my = (y1 + y2) / 2;
      ctx.save();
      ctx.translate(u(ox), u(my));
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = C.bg;
      ctx.fillRect(-22, -6, 44, 12);
      ctx.font      = "8px 'Share Tech Mono', monospace";
      ctx.fillStyle = C.dimText;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, 0, 0);
      ctx.restore();
    }
  }

  function arrow(px, py, dir) {
    const s = 5;
    ctx.beginPath();
    ctx.fillStyle = C.dim;
    if (dir === "right") {
      ctx.moveTo(px, py);
      ctx.lineTo(px - s, py - 2.5);
      ctx.lineTo(px - s, py + 2.5);
    } else if (dir === "left") {
      ctx.moveTo(px, py);
      ctx.lineTo(px + s, py - 2.5);
      ctx.lineTo(px + s, py + 2.5);
    } else if (dir === "down") {
      ctx.moveTo(px, py);
      ctx.lineTo(px - 2.5, py - s);
      ctx.lineTo(px + 2.5, py - s);
    } else if (dir === "up") {
      ctx.moveTo(px, py);
      ctx.lineTo(px - 2.5, py + s);
      ctx.lineTo(px + 2.5, py + s);
    }
    ctx.closePath();
    ctx.fill();
  }

  /* ── DOOR HELPER ────────────────────────────────── */
  function door(x, y, size, angle, wallDir) {
    // swing arc
    ctx.save();
    ctx.translate(u(x), u(y));
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(u(size), 0);
    ctx.strokeStyle = C.doorLine;
    ctx.lineWidth   = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, u(size), 0, Math.PI / 2);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fillStyle   = C.doorSwing;
    ctx.fill();
    ctx.strokeStyle = C.doorLine;
    ctx.lineWidth   = 0.8;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(0, 0, u(size), 0, Math.PI / 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  /* ── WINDOW HELPER ──────────────────────────────── */
  function window_(x, y, w, h) {
    rect(x, y, w, h, C.window, C.wallExt, 1);
    // glazing lines
    const isHoriz = w > h;
    if (isHoriz) {
      line(x, y + h / 2, x + w, y + h / 2, C.doorLine, 0.8);
    } else {
      line(x + w / 2, y, x + w / 2, y + h, C.doorLine, 0.8);
    }
  }

  /* ── FURNITURE HELPERS ──────────────────────────── */
  function bed(x, y, w, h, label) {
    rect(x, y, w, h, C.furn, C.furnStroke, 0.8);
    // pillow
    rect(x + 0.5, y + 0.5, w - 1, h * 0.3, "rgba(255,107,53,0.25)", C.furnStroke, 0.5);
    text(label, x + w / 2, y + h / 2, C.furnStroke, 7);
  }

  function sofa(x, y, w, h) {
    rect(x, y, w, h, C.furn, C.furnStroke, 0.8);
    // back
    rect(x, y, w, h * 0.3, "rgba(255,107,53,0.3)", C.furnStroke, 0.5);
    // cushions
    const n = Math.floor(w / 5);
    for (let i = 0; i < n; i++) {
      rect(x + i * (w / n) + 0.3, y + h * 0.35, w / n - 0.6, h * 0.55, "rgba(255,107,53,0.2)", C.furnStroke, 0.4);
    }
  }

  function table(x, y, w, h) {
    rect(x, y, w, h, C.furn, C.furnStroke, 0.8);
    line(x, y, x + w, y + h, C.furnStroke, 0.4);
    line(x + w, y, x, y + h, C.furnStroke, 0.4);
  }

  function toilet(x, y, w, h) {
    rect(x, y, w, h * 0.35, C.furn, C.furnStroke, 0.8);
    ctx.beginPath();
    ctx.ellipse(u(x + w / 2), u(y + h * 0.65), u(w / 2 - 0.3), u(h * 0.38), 0, 0, Math.PI * 2);
    ctx.fillStyle   = C.furn;
    ctx.fill();
    ctx.strokeStyle = C.furnStroke;
    ctx.lineWidth   = 0.8;
    ctx.stroke();
  }

  function bathtub(x, y, w, h) {
    rect(x, y, w, h, C.furn, C.furnStroke, 0.8);
    rect(x + 0.5, y + 0.5, w - 1, h - 1, "rgba(0,212,255,0.12)", C.furnStroke, 0.5);
    ctx.beginPath();
    ctx.arc(u(x + w / 2), u(y + h * 0.65), u(1.2), 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,212,255,0.2)";
    ctx.fill();
  }

  function sink(x, y, r) {
    ctx.beginPath();
    ctx.ellipse(u(x), u(y), u(r), u(r * 0.7), 0, 0, Math.PI * 2);
    ctx.fillStyle   = C.furn;
    ctx.fill();
    ctx.strokeStyle = C.furnStroke;
    ctx.lineWidth   = 0.8;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(u(x), u(y), u(r * 0.2), 0, Math.PI * 2);
    ctx.fillStyle = C.furnStroke;
    ctx.fill();
  }

  function kitchenCounter(x, y, w, h) {
    rect(x, y, w, h, C.furn, C.furnStroke, 0.8);
    // hob circles
    const cx1 = x + w * 0.28, cx2 = x + w * 0.72;
    const cy1 = y + h * 0.3,  cy2 = y + h * 0.7;
    for (const [bx, by] of [[cx1,cy1],[cx2,cy1],[cx1,cy2],[cx2,cy2]]) {
      ctx.beginPath();
      ctx.arc(u(bx), u(by), u(1.1), 0, Math.PI * 2);
      ctx.strokeStyle = C.furnStroke;
      ctx.lineWidth   = 0.7;
      ctx.stroke();
    }
  }

  function wardrobe(x, y, w, h) {
    rect(x, y, w, h, C.furn, C.furnStroke, 0.8);
    line(x + w / 2, y, x + w / 2, y + h, C.furnStroke, 0.5);
    // handles
    const hh = h * 0.1;
    line(x + w * 0.1, y + h / 2 - hh, x + w * 0.4, y + h / 2 - hh, C.furnStroke, 0.5);
    line(x + w * 0.6, y + h / 2 - hh, x + w * 0.9, y + h / 2 - hh, C.furnStroke, 0.5);
  }

  function desk(x, y, w, h) {
    rect(x, y, w, h, C.furn, C.furnStroke, 0.8);
    // monitor
    rect(x + w * 0.25, y + h * 0.1, w * 0.5, h * 0.35, "rgba(0,212,255,0.2)", C.furnStroke, 0.5);
  }

  /* ── HATCHING FOR WALLS ─────────────────────────── */
  function hatchRect(x, y, w, h) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(u(x), u(y), u(w), u(h));
    ctx.clip();
    ctx.strokeStyle = C.hatching;
    ctx.lineWidth   = 0.6;
    const step = 4;
    for (let i = -u(h); i < u(w) + u(h); i += step) {
      ctx.beginPath();
      ctx.moveTo(u(x) + i, u(y));
      ctx.lineTo(u(x) + i + u(h), u(y) + u(h));
      ctx.stroke();
    }
    ctx.restore();
  }

  /* == MAIN DRAW ===================================== */
  function draw() {

    /* ── Background ─────────────────────────────── */
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // subtle grid
    ctx.strokeStyle = C.grid;
    ctx.lineWidth   = 0.5;
    for (let x = 0; x < canvas.width; x += u(2)) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += u(2)) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }

    /* ── HOUSE DEFINITION ───────────────────────────
       Origin at (10, 10) in units
       Overall footprint: 90 x 80 units
       1 unit = 0.5m at scale 1:50
       So footprint = 45m × 40m (but rooms are subdivided below to realistic sizes)

       Actually let's use a tighter house: 90u wide × 80u tall
       at scale 1u = 500mm = 0.5m → 45m × 40m is too large
       Let's use 1u = 200mm = 0.2m instead for room-level realism
       House rooms:
         Living Room: 6m×4.8m = 30u×24u
         Kitchen:     4.8m×3m = 24u×15u
         Master Bed:  4.5m×4.5m = 22.5→23u×23u
         Bed 2:       4m×3.75m = 20u×19u
         Bathroom:    2.5m×3m = 12.5→13u×15u
         Corridor:    1.5m×6m = 7.5u×30u
    ─────────────────────────────────────────────── */

    const OX = 14; // origin X
    const OY = 16; // origin Y

    // House total: 90u wide × 68u tall (not incl. outer walls)
    const HW = 90;
    const HH = 68;

    /* ── ROOM FILLS ─────────────────────────────── */
    // Living Room (bottom-left): x=OX+W_EXT, y=OY+W_EXT, 52u wide, 34u tall
    rect(OX + W_EXT, OY + W_EXT, 52, 34, C.roomTint[0]);
    // Kitchen (bottom-right): 52→90, OY+W_EXT, 30u wide, 34u tall
    rect(OX + W_EXT + 52 + W_INT, OY + W_EXT, 30, 34, C.roomTint[2]);
    // Corridor (middle): OX+W_EXT, OY+W_EXT+34+W_INT, 90u wide, 8u tall
    rect(OX + W_EXT, OY + W_EXT + 34 + W_INT, HW - W_INT, 8, C.roomTint[5]);
    // Master Bedroom (top-left): 46u wide, 20u tall
    rect(OX + W_EXT, OY + W_EXT + 34 + W_INT + 8 + W_INT, 44, 20, C.roomTint[1]);
    // Bedroom 2 (top-middle): 20u wide
    rect(OX + W_EXT + 44 + W_INT, OY + W_EXT + 34 + W_INT + 8 + W_INT, 20, 20, C.roomTint[3]);
    // Bathroom (top-right): 18u wide
    rect(OX + W_EXT + 44 + W_INT + 20 + W_INT, OY + W_EXT + 34 + W_INT + 8 + W_INT, 14, 20, C.roomTint[4]);

    /* ── EXTERIOR WALLS ─────────────────────────── */
    // Draw filled wall rectangles with hatching
    function extWall(x, y, w, h) {
      hatchRect(x, y, w, h);
      rect(x, y, w, h, null, C.wallExt, 1.5);
    }
    function intWall(x, y, w, h) {
      hatchRect(x, y, w, h);
      rect(x, y, w, h, null, C.wallInt, 1.2);
    }

    // --- TOP WALL ---
    extWall(OX, OY, HW, W_EXT);
    // --- BOTTOM WALL ---
    extWall(OX, OY + HH - W_EXT, HW, W_EXT);
    // --- LEFT WALL ---
    extWall(OX, OY, W_EXT, HH);
    // --- RIGHT WALL ---
    extWall(OX + HW - W_EXT, OY, W_EXT, HH);

    /* ── INTERIOR WALLS ─────────────────────────── */
    // Vertical: Living | Kitchen split
    intWall(OX + W_EXT + 52, OY + W_EXT, W_INT, 34);
    // Horizontal: Ground floor | Corridor
    intWall(OX + W_EXT, OY + W_EXT + 34, HW - W_EXT * 2, W_INT);
    // Horizontal: Corridor | Bedrooms
    intWall(OX + W_EXT, OY + W_EXT + 34 + W_INT + 8, HW - W_EXT * 2, W_INT);
    // Vertical: Master | Bed2 split
    intWall(OX + W_EXT + 44, OY + W_EXT + 34 + W_INT + 8 + W_INT, W_INT, 20);
    // Vertical: Bed2 | Bathroom split
    intWall(OX + W_EXT + 44 + W_INT + 20, OY + W_EXT + 34 + W_INT + 8 + W_INT, W_INT, 20);

    /* ── WINDOWS ────────────────────────────────── */
    // Living Room - south wall (large)
    window_(OX + W_EXT + 4, OY + HH - W_EXT, 20, W_EXT);
    window_(OX + W_EXT + 28, OY + HH - W_EXT, 20, W_EXT);
    // Kitchen - south wall
    window_(OX + W_EXT + 62, OY + HH - W_EXT, 14, W_EXT);
    // Living Room - west wall
    window_(OX, OY + W_EXT + 6, W_EXT, 14);
    // Master Bedroom - north wall
    window_(OX + W_EXT + 8, OY, 18, W_EXT);
    // Bedroom 2 - north wall
    window_(OX + W_EXT + 52, OY, 10, W_EXT);
    // Kitchen - east wall
    window_(OX + HW - W_EXT, OY + W_EXT + 8, W_EXT, 14);

    /* ── DOORS ──────────────────────────────────── */
    // Front door (south exterior): opens into living room
    // Clear gap in south wall at OX+W_EXT+10, width=8u
    rect(OX + W_EXT + 20, OY + HH - W_EXT - 0.2, 8, W_EXT + 0.4, C.bg, null);
    door(OX + W_EXT + 20, OY + HH - W_EXT, 8, -Math.PI / 2, "h");
    text("ENTRY", OX + W_EXT + 24, OY + HH - W_EXT * 1.8, C.labelSub, 7);

    // Living → Corridor door
    rect(OX + W_EXT + 10, OY + W_EXT + 34, 8, W_INT + 0.2, C.bg, null);
    door(OX + W_EXT + 10, OY + W_EXT + 34, 8, 0, "h");

    // Kitchen → Corridor door
    rect(OX + W_EXT + 62, OY + W_EXT + 34, 8, W_INT + 0.2, C.bg, null);
    door(OX + W_EXT + 62, OY + W_EXT + 34, 8, 0, "h");

    // Corridor → Master Bedroom
    rect(OX + W_EXT + 8, OY + W_EXT + 34 + W_INT + 8, 8, W_INT + 0.2, C.bg, null);
    door(OX + W_EXT + 8, OY + W_EXT + 34 + W_INT + 8 + W_INT, 8, -Math.PI / 2, "h");

    // Corridor → Bedroom 2
    rect(OX + W_EXT + 52, OY + W_EXT + 34 + W_INT + 8, 8, W_INT + 0.2, C.bg, null);
    door(OX + W_EXT + 52, OY + W_EXT + 34 + W_INT + 8 + W_INT, 8, -Math.PI / 2, "h");

    // Corridor → Bathroom (sliding implied by pocket door symbol)
    rect(OX + W_EXT + 68, OY + W_EXT + 34 + W_INT + 8, 7, W_INT + 0.2, C.bg, null);
    door(OX + W_EXT + 68, OY + W_EXT + 34 + W_INT + 8 + W_INT, 7, -Math.PI / 2, "h");

    /* ── FURNITURE ──────────────────────────────── */
    // --- Living Room ---
    sofa(OX + W_EXT + 4, OY + HH - W_EXT - 24, 20, 6);
    sofa(OX + W_EXT + 2, OY + HH - W_EXT - 18, 6, 10);
    table(OX + W_EXT + 12, OY + HH - W_EXT - 18, 10, 6);
    // TV unit
    rect(OX + W_EXT + 2, OY + W_EXT + 2, 28, 4, C.furn, C.furnStroke, 0.8);
    text("TV", OX + W_EXT + 16, OY + W_EXT + 4, C.furnStroke, 7);

    // --- Kitchen ---
    kitchenCounter(OX + W_EXT + 58, OY + W_EXT + 4, 24, 10);
    kitchenCounter(OX + W_EXT + 58, OY + W_EXT + 18, 8, 12);
    // dining table
    table(OX + W_EXT + 68, OY + W_EXT + 18, 12, 10);

    // --- Master Bedroom ---
    const mbY = OY + W_EXT + 34 + W_INT + 8 + W_INT;
    bed(OX + W_EXT + 6, mbY + 2, 18, 14, "MASTER BED\nKing 1800×2000");
    wardrobe(OX + W_EXT + 2, mbY + 2, 4, 14);
    desk(OX + W_EXT + 26, mbY + 2, 10, 6);

    // --- Bedroom 2 ---
    const b2X = OX + W_EXT + 44 + W_INT;
    bed(b2X + 2, mbY + 2, 14, 12, "BED 2\n1400×2000");
    wardrobe(b2X + 2, mbY + 16, 14, 4);

    // --- Bathroom ---
    const btX = OX + W_EXT + 44 + W_INT + 20 + W_INT;
    bathtub(btX + 1, mbY + 2, 7, 12);
    toilet(btX + 8, mbY + 3, 4, 5.5);
    sink(btX + 10, mbY + 12, 1.8);

    /* ── ROOM LABELS ────────────────────────────── */
    const labelStyle = (label, area, x, y) => {
      text(label, x, y, C.label, 10, "center");
      text(area,  x, y + 3.5, C.labelSub, 8, "center");
    };

    labelStyle("LIVING ROOM",     "28.8 m²", OX + W_EXT + 26, OY + W_EXT + 18);
    labelStyle("KITCHEN",         "14.4 m²", OX + W_EXT + 68, OY + W_EXT + 10);
    labelStyle("CORRIDOR",        "9.0 m²",  OX + W_EXT + 44, OY + W_EXT + 34 + W_INT + 5.5);
    labelStyle("MASTER BEDROOM",  "20.25 m²",OX + W_EXT + 22, mbY + 11);
    labelStyle("BEDROOM 2",       "15.0 m²", b2X + 10,         mbY + 12);
    labelStyle("BATHROOM",        "7.5 m²",  btX + 7,          mbY + 15);

    /* ── OVERALL DIMENSIONS ─────────────────────── */
    // Horizontal top (overall width)
    dim(OX, OY, OX + HW, OY, `${(HW * 0.2).toFixed(1)}m`, 6);
    // Vertical left (overall height)
    dim(OX, OY, OX, OY + HH, `${(HH * 0.2).toFixed(1)}m`, 6, false);

    // Sub-dimensions bottom
    dim(OX + W_EXT, OY + HH, OX + W_EXT + 52, OY + HH, "10.4m", 5.5);
    dim(OX + W_EXT + 52 + W_INT, OY + HH, OX + HW - W_EXT, OY + HH, "6.0m", 5.5);

    // Sub-dimensions right (heights)
    const rx = OX + HW;
    dim(rx, OY + W_EXT, rx, OY + W_EXT + 34, "6.8m", 5.5, false);
    dim(rx, OY + W_EXT + 34 + W_INT, rx, OY + W_EXT + 34 + W_INT + 8, "1.6m", 5.5, false);
    dim(rx, OY + W_EXT + 34 + W_INT + 8 + W_INT, rx, OY + HH - W_EXT, "4.0m", 5.5, false);

    /* ── WALL THICKNESS CALLOUT ─────────────────── */
    // Exterior callout arrow
    ctx.beginPath();
    ctx.setLineDash([3, 2]);
    ctx.moveTo(u(OX + HW * 0.5), u(OY));
    ctx.lineTo(u(OX + HW * 0.5 + 8), u(OY - 5));
    ctx.strokeStyle = C.dimText;
    ctx.lineWidth   = 0.8;
    ctx.stroke();
    ctx.setLineDash([]);
    text("EXT. WALL 300mm", OX + HW * 0.5 + 16, OY - 5.5, C.dimText, 7.5);

    // Interior callout
    ctx.beginPath();
    ctx.setLineDash([3, 2]);
    ctx.moveTo(u(OX + W_EXT + 52 + W_INT / 2), u(OY + W_EXT + 17));
    ctx.lineTo(u(OX + W_EXT + 52 + 10), u(OY + W_EXT + 10));
    ctx.strokeStyle = "#4a8ab0";
    ctx.lineWidth   = 0.8;
    ctx.stroke();
    ctx.setLineDash([]);
    text("INT. WALL 150mm", OX + W_EXT + 60, OY + W_EXT + 8, "#4a8ab0", 7);

    /* ── NORTH ARROW ON CANVAS ──────────────────── */
    const nx = OX + HW + 14, ny = OY + 10;
    ctx.beginPath();
    ctx.arc(u(nx), u(ny), u(5), 0, Math.PI * 2);
    ctx.strokeStyle = C.wallExt;
    ctx.lineWidth   = 1;
    ctx.stroke();
    // arrow
    ctx.beginPath();
    ctx.moveTo(u(nx), u(ny - 4.5));
    ctx.lineTo(u(nx - 2), u(ny + 2));
    ctx.lineTo(u(nx), u(ny + 1));
    ctx.lineTo(u(nx + 2), u(ny + 2));
    ctx.closePath();
    ctx.fillStyle = C.accent;
    ctx.fill();
    text("N", nx, ny - 6.5, C.accent, 8);

    /* ── TITLE BLOCK ON CANVAS ──────────────────── */
    const tbx = OX + HW + 4, tby = OY + 20;
    rect(tbx, tby, 24, 46, "rgba(10,21,32,0.8)", C.border, 0.8);
    ctx.font         = "7px 'Share Tech Mono', monospace";
    ctx.fillStyle    = C.labelSub;
    ctx.textAlign    = "left";
    ctx.textBaseline = "top";
    const rows = [
      ["PROJECT", "Lakewood Residence"],
      ["DRAWING", "Floor Plan"],
      ["SCALE",   "1:50"],
      ["DATE",    "2026-05-16"],
      ["DRAWN",   "Studio AI"],
      ["DWG NO.", "LW-A101"],
      ["REV",     "A"],
    ];
    rows.forEach(([k, v], i) => {
      const ry = u(tby + 2 + i * 6.5);
      ctx.fillStyle = C.labelSub;
      ctx.fillText(k, u(tbx + 1), ry);
      ctx.fillStyle = C.label;
      ctx.fillText(v, u(tbx + 8), ry);
      if (i < rows.length - 1) {
        ctx.beginPath();
        ctx.moveTo(u(tbx), u(tby + 2 + (i + 1) * 6.5) - 2);
        ctx.lineTo(u(tbx + 24), u(tby + 2 + (i + 1) * 6.5) - 2);
        ctx.strokeStyle = C.border;
        ctx.lineWidth   = 0.5;
        ctx.stroke();
      }
    });

    /* ── SHEET BORDER ───────────────────────────── */
    ctx.strokeStyle = C.wallExt;
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.rect(u(4), u(4), canvas.width - u(8), canvas.height - u(8));
    ctx.stroke();
    ctx.strokeStyle = C.border;
    ctx.lineWidth   = 0.8;
    ctx.beginPath();
    ctx.rect(u(5.5), u(5.5), canvas.width - u(11), canvas.height - u(11));
    ctx.stroke();
  }

  draw();

  /* ── POPULATE ROOM LIST ─────────────────────────── */
  const rooms = [
    { name: "Living Room", area: "28.8 m²" },
    { name: "Kitchen",     area: "14.4 m²" },
    { name: "Corridor",    area: "9.0 m²"  },
    { name: "Master Bed",  area: "20.25 m²"},
    { name: "Bedroom 2",   area: "15.0 m²" },
    { name: "Bathroom",    area: "7.5 m²"  },
  ];

  const rl = document.getElementById("roomList");
  rooms.forEach(r => {
    const chip = document.createElement("div");
    chip.className   = "room-chip";
    chip.textContent = `${r.name} — ${r.area}`;
    rl.appendChild(chip);
  });

  /* ── PDF EXPORT ─────────────────────────────────── */
  document.getElementById("btnPDF").addEventListener("click", () => {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a2",
    });

    // Title
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(18);
    pdf.setTextColor(30, 80, 130);
    pdf.text("LAKEWOOD RESIDENCE – FLOOR PLAN", 20, 20);

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(80, 100, 120);
    pdf.text("Drawing No: LW-A101  |  Scale: 1:50  |  Date: 2026-05-16  |  Rev: A", 20, 28);

    // Canvas image
    const imgData = canvas.toDataURL("image/png", 1.0);
    const pw = 550, ph = (canvas.height / canvas.width) * pw;
    pdf.addImage(imgData, "PNG", 20, 35, pw, ph);

    // Border
    pdf.setDrawColor(30, 80, 130);
    pdf.setLineWidth(1);
    pdf.rect(10, 10, 574, ph + 40);

    // Footer
    pdf.setFontSize(7);
    pdf.setTextColor(120, 140, 160);
    pdf.text("© Studio AI 2026 – All rights reserved. This drawing is for illustrative purposes.", 20, ph + 55);

    pdf.save("Lakewood_Residence_FloorPlan.pdf");
  });

  /* ── DWG EXPORT (structured text DXF) ──────────── */
  document.getElementById("btnDWG").addEventListener("click", () => {
    const dxf = generateDXF();
    const blob = new Blob([dxf], { type: "application/octet-stream" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = "Lakewood_Residence_FloorPlan.dxf";
    a.click();
    URL.revokeObjectURL(url);
  });

  /* ── DXF GENERATOR ──────────────────────────────── */
  function generateDXF() {
    // Metric: 1 DXF unit = 1mm
    // 1 canvas unit = 200mm
    const S = 200;
    const OX = 14, OY = 16;
    const HW = 90, HH = 68;
    const W_EXT = 6, W_INT = 3;

    function pt(x, y) { return `${(x * S).toFixed(0)},${(y * S).toFixed(0)},0`; }

    let lines = [];

    function addRect(layer, x, y, w, h) {
      const x2 = x + w, y2 = y + h;
      lines.push(
        `0\nLINE\n8\n${layer}\n10\n${(x*S).toFixed(0)}\n20\n${(y*S).toFixed(0)}\n30\n0\n11\n${(x2*S).toFixed(0)}\n21\n${(y*S).toFixed(0)}\n31\n0`,
        `0\nLINE\n8\n${layer}\n10\n${(x2*S).toFixed(0)}\n20\n${(y*S).toFixed(0)}\n30\n0\n11\n${(x2*S).toFixed(0)}\n21\n${(y2*S).toFixed(0)}\n31\n0`,
        `0\nLINE\n8\n${layer}\n10\n${(x2*S).toFixed(0)}\n20\n${(y2*S).toFixed(0)}\n30\n0\n11\n${(x*S).toFixed(0)}\n21\n${(y2*S).toFixed(0)}\n31\n0`,
        `0\nLINE\n8\n${layer}\n10\n${(x*S).toFixed(0)}\n20\n${(y2*S).toFixed(0)}\n30\n0\n11\n${(x*S).toFixed(0)}\n21\n${(y*S).toFixed(0)}\n31\n0`,
      );
    }

    function addText(layer, str, x, y) {
      lines.push(
        `0\nTEXT\n8\n${layer}\n10\n${(x*S).toFixed(0)}\n20\n${(y*S).toFixed(0)}\n30\n0\n40\n200\n1\n${str}\n72\n1\n11\n${(x*S).toFixed(0)}\n21\n${(y*S).toFixed(0)}\n31\n0`
      );
    }

    function addLine(layer, x1, y1, x2, y2) {
      lines.push(
        `0\nLINE\n8\n${layer}\n10\n${(x1*S).toFixed(0)}\n20\n${(y1*S).toFixed(0)}\n30\n0\n11\n${(x2*S).toFixed(0)}\n21\n${(y2*S).toFixed(0)}\n31\n0`
      );
    }

    const header = `0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1009\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n0\nSECTION\n2\nLAYER_TABLE\n0\nENDSEC\n0\nSECTION\n2\nENTITIES`;

    // External walls
    addRect("EXT-WALLS", OX, OY, HW, W_EXT);
    addRect("EXT-WALLS", OX, OY + HH - W_EXT, HW, W_EXT);
    addRect("EXT-WALLS", OX, OY, W_EXT, HH);
    addRect("EXT-WALLS", OX + HW - W_EXT, OY, W_EXT, HH);

    // Interior walls
    addRect("INT-WALLS", OX + W_EXT + 52, OY + W_EXT, W_INT, 34);
    addRect("INT-WALLS", OX + W_EXT, OY + W_EXT + 34, HW - W_EXT * 2, W_INT);
    addRect("INT-WALLS", OX + W_EXT, OY + W_EXT + 34 + W_INT + 8, HW - W_EXT * 2, W_INT);
    addRect("INT-WALLS", OX + W_EXT + 44, OY + W_EXT + 34 + W_INT + 8 + W_INT, W_INT, 20);
    addRect("INT-WALLS", OX + W_EXT + 44 + W_INT + 20, OY + W_EXT + 34 + W_INT + 8 + W_INT, W_INT, 20);

    // Windows
    addRect("WINDOWS", OX + W_EXT + 4, OY + HH - W_EXT, 20, W_EXT);
    addRect("WINDOWS", OX + W_EXT + 28, OY + HH - W_EXT, 20, W_EXT);
    addRect("WINDOWS", OX + W_EXT + 62, OY + HH - W_EXT, 14, W_EXT);
    addRect("WINDOWS", OX, OY + W_EXT + 6, W_EXT, 14);
    addRect("WINDOWS", OX + W_EXT + 8, OY, 18, W_EXT);
    addRect("WINDOWS", OX + W_EXT + 52, OY, 10, W_EXT);
    addRect("WINDOWS", OX + HW - W_EXT, OY + W_EXT + 8, W_EXT, 14);

    // Room labels
    const mbY = OY + W_EXT + 34 + W_INT + 8 + W_INT;
    const b2X = OX + W_EXT + 44 + W_INT;
    const btX = OX + W_EXT + 44 + W_INT + 20 + W_INT;

    addText("ROOM-LABELS", "LIVING ROOM 28.8m2",   OX + W_EXT + 26, OY + W_EXT + 18);
    addText("ROOM-LABELS", "KITCHEN 14.4m2",        OX + W_EXT + 68, OY + W_EXT + 10);
    addText("ROOM-LABELS", "CORRIDOR 9.0m2",        OX + W_EXT + 44, OY + W_EXT + 38);
    addText("ROOM-LABELS", "MASTER BEDROOM 20.25m2",OX + W_EXT + 22, mbY + 11);
    addText("ROOM-LABELS", "BEDROOM 2 15.0m2",      b2X + 10,         mbY + 12);
    addText("ROOM-LABELS", "BATHROOM 7.5m2",        btX + 7,          mbY + 15);

    // Dimension lines
    addLine("DIMENSIONS", OX, OY - 6, OX + HW, OY - 6);
    addLine("DIMENSIONS", OX, OY - 6, OX, OY);
    addLine("DIMENSIONS", OX + HW, OY - 6, OX + HW, OY);
    addText("DIMENSIONS", `${(HW * 0.2).toFixed(1)}m`, OX + HW / 2, OY - 7);

    const footer = `\n0\nENDSEC\n0\nEOF`;

    return header + "\n" + lines.join("\n") + footer;
  }

})();

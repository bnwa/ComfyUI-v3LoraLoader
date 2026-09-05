import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";

/**
 * Frontend extension implementing the rgthree "Power Lora Loader" style UX
 * for the v3 Power Lora Loader nodes (one per diffusion model family).
 *
 * Each node starts out with a single "Add LoRA" button. Clicking it appends
 * a "LoRA row" widget below it: a toggle, a LoRA picker, a model-strength
 * field and (SDXL only) a CLIP-strength field, plus a small remove button.
 *
 * The Python side of each node declares `accept_all_inputs=True` and simply
 * reads back whatever `lora_<n>` values show up in its inputs, so all of the
 * dynamic-widget bookkeeping lives here.
 */

// LiteGraph dispatches draw()/mouse() generically only for widgets whose
// `type` is literally "custom"; anything else is assumed to be one of its
// built-in widget kinds.
const ROW_WIDGET_TYPE = "custom";
const NODE_IDS_WITH_CLIP_STRENGTH = new Set(["V3PowerLoraLoaderModelClip"]);
const NODE_IDS = new Set([
  "V3PowerLoraLoaderModelClip",
  "V3PowerLoraLoaderModelOnly",
]);

const ADD_LORA_LABEL = "Add LoRA";

let loraListPromise = null;

/** Fetches (and caches) the list of available LoRA filenames. */
function fetchLoraList(forceRefresh = false) {
  if (forceRefresh || !loraListPromise) {
    loraListPromise = api
      .fetchApi("/models/loras")
      .then((res) => res.json())
      .catch(() => []);
  }
  return loraListPromise;
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, h / 2, w / 2));
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function fitString(ctx, str, maxWidth) {
  str = str == null ? "" : String(str);
  if (maxWidth <= 0) return "";
  if (ctx.measureText(str).width <= maxWidth) return str;
  const ellipsis = "\u2026";
  let out = str;
  while (out.length > 1 && ctx.measureText(out + ellipsis).width > maxWidth) {
    out = out.slice(0, -1);
  }
  return out + ellipsis;
}

function pointInBounds(pos, bounds) {
  if (!bounds) return false;
  const [x, w] = bounds;
  return pos[0] >= x && pos[0] <= x + w;
}

/**
 * A single "LoRA row": a coupled toggle + LoRA picker + strength widget(s) +
 * remove button, drawn and hit-tested as one custom LiteGraph widget.
 */
class PowerLoraRowWidget {
  constructor(node, name, initialValue) {
    this.node = node;
    this.name = name;
    this.type = ROW_WIDGET_TYPE;
    this.options = { serialize: true };
    this.hitAreas = {};

    const defaults = { on: true, lora: null, strengthModel: 1.0 };
    if (node.hasClipStrength) {
      defaults.strengthClip = 1.0;
    }
    this.value = Object.assign(defaults, initialValue || {});
  }

  serializeValue() {
    const value = { ...this.value };
    if (!this.node.hasClipStrength) {
      delete value.strengthClip;
    }
    return value;
  }

  computeSize(width) {
    return [width, (LiteGraph.NODE_WIDGET_HEIGHT || 20) + 6];
  }

  draw(ctx, node, widgetWidth, posY, height) {
    const margin = 10;
    const inner = 6;
    const midY = posY + height / 2;

    ctx.save();

    roundRect(ctx, margin, posY + 1, widgetWidth - margin * 2, height - 2, 6);
    ctx.fillStyle = LiteGraph.WIDGET_BGCOLOR || "#222";
    ctx.fill();

    let x = margin + inner;

    // --- enable/disable toggle -------------------------------------------------
    const toggleH = height * 0.55;
    const toggleW = toggleH * 1.8;
    const toggleY = midY - toggleH / 2;
    roundRect(ctx, x, toggleY, toggleW, toggleH, toggleH / 2);
    ctx.fillStyle = this.value.on
      ? "#89c07a"
      : (LiteGraph.WIDGET_OUTLINE_COLOR || "#555");
    ctx.fill();
    ctx.beginPath();
    const knobR = toggleH / 2 - 2;
    const knobX = this.value.on ? x + toggleW - toggleH / 2 : x + toggleH / 2;
    ctx.arc(knobX, midY, knobR, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    this.hitAreas.toggle = [x, toggleW];
    x += toggleW + inner * 1.5;

    if (!this.value.on) {
      ctx.globalAlpha = (app.canvas?.editor_alpha ?? 1) * 0.5;
    }

    // --- remove button (rightmost) ----------------------------------------------
    const removeW = height * 0.8;
    let rightX = widgetWidth - margin - inner - removeW;
    ctx.fillStyle = LiteGraph.WIDGET_TEXT_COLOR || "#ccc";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = ctx.font.replace(/\d+px/, `${Math.floor(height * 0.55)}px`);
    ctx.fillText("\u2715", rightX + removeW / 2, midY);
    this.hitAreas.remove = [rightX, removeW];
    rightX -= inner;

    // --- strength field(s), drawn right-to-left ---------------------------------
    const strengthW = node.hasClipStrength ? 56 : 64;

    const drawStrengthField = (label, value, edgeX) => {
      const fieldX = edgeX - strengthW;
      roundRect(ctx, fieldX, posY + height * 0.18, strengthW, height * 0.64, 4);
      ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
      ctx.fill();
      ctx.fillStyle = LiteGraph.WIDGET_TEXT_COLOR || "#ccc";
      ctx.textAlign = "center";
      const text = `${label}${(value ?? 1).toFixed(2)}`;
      ctx.fillText(fitString(ctx, text, strengthW - 4), fieldX + strengthW / 2, midY);
      return [fieldX, strengthW];
    };

    if (node.hasClipStrength) {
      this.hitAreas.strengthClip = drawStrengthField("C ", this.value.strengthClip, rightX);
      rightX = this.hitAreas.strengthClip[0] - inner;
    } else {
      this.hitAreas.strengthClip = null;
    }
    this.hitAreas.strengthModel = drawStrengthField(
      node.hasClipStrength ? "M " : "",
      this.value.strengthModel,
      rightX,
    );
    rightX = this.hitAreas.strengthModel[0] - inner;

    // --- lora file label ---------------------------------------------------------
    const loraWidth = Math.max(0, rightX - x - inner);
    ctx.fillStyle = LiteGraph.WIDGET_TEXT_COLOR || "#ccc";
    ctx.textAlign = "left";
    ctx.font = ctx.font.replace(/\d+px/, `${Math.floor(height * 0.5)}px`);
    ctx.fillText(fitString(ctx, this.value.lora || "None", loraWidth), x, midY);
    this.hitAreas.lora = [x, loraWidth];

    ctx.globalAlpha = app.canvas?.editor_alpha ?? 1;
    ctx.restore();
  }

  showLoraChooser(event) {
    fetchLoraList().then((loras) => {
      const values = ["None", ...loras];
      new LiteGraph.ContextMenu(values, {
        event,
        title: "Select a LoRA",
        callback: (value) => {
          this.value.lora = value === "None" ? null : value;
          this.node.setDirtyCanvas(true, true);
        },
      });
    });
  }

  promptForStrength(event, key) {
    const canvas = app.canvas;
    if (!canvas?.prompt) return;
    canvas.prompt(
      "Strength",
      this.value[key] ?? 1,
      (value) => {
        const parsed = Number(value);
        if (!Number.isNaN(parsed)) {
          this.value[key] = parsed;
          this.node.setDirtyCanvas(true, true);
        }
      },
      event,
    );
  }

  mouse(event, pos, node) {
    if (event.type !== "pointerdown") {
      // Swallow move/up while a down on this widget is being tracked, so
      // the canvas doesn't interpret the drag as moving/box-selecting the
      // node underneath us.
      return true;
    }
    if (pointInBounds(pos, this.hitAreas.toggle)) {
      this.value.on = !this.value.on;
      node.setDirtyCanvas(true, true);
      return true;
    }
    if (pointInBounds(pos, this.hitAreas.remove)) {
      node.removeLoraRow(this);
      return true;
    }
    if (pointInBounds(pos, this.hitAreas.lora)) {
      this.showLoraChooser(event);
      return true;
    }
    if (pointInBounds(pos, this.hitAreas.strengthModel)) {
      this.promptForStrength(event, "strengthModel");
      return true;
    }
    if (node.hasClipStrength && pointInBounds(pos, this.hitAreas.strengthClip)) {
      this.promptForStrength(event, "strengthClip");
      return true;
    }
    // Swallow the click so it doesn't fall through to dragging the node.
    return true;
  }
}

function isLoraRowValue(value) {
  return value && typeof value === "object" && "lora" in value && "on" in value;
}

function setupPowerLoraLoaderNode(nodeType, hasClipStrength) {
  nodeType.prototype.hasClipStrength = hasClipStrength;

  nodeType.prototype.addLoraRow = function (initialValue) {
    this._loraRowCounter = (this._loraRowCounter || 0) + 1;
    const widget = new PowerLoraRowWidget(
      this,
      `lora_${this._loraRowCounter}`,
      initialValue,
    );
    this.addCustomWidget(widget);
    this._resizeForWidgets();
    this.setDirtyCanvas(true, true);
    return widget;
  };

  nodeType.prototype.removeLoraRow = function (widget) {
    if (this.widgets && this.widgets.includes(widget)) {
      this.removeWidget(widget);
    }
    // Unlike growing, removing a row should shrink the node back down.
    const computed = this.computeSize();
    this.size[1] = computed[1];
    this.setDirtyCanvas(true, true);
  };

  nodeType.prototype._addAddLoraButton = function () {
    this.addWidget("button", ADD_LORA_LABEL, null, () => this.addLoraRow(), {
      serialize: false,
    });
  };

  nodeType.prototype._resizeForWidgets = function () {
    const computed = this.computeSize();
    this.size = this.size || [0, 0];
    this.size[1] = Math.max(computed[1], this.size[1]);
    if (this.size[0] < computed[0]) {
      this.size[0] = computed[0];
    }
  };

  const onNodeCreated = nodeType.prototype.onNodeCreated;
  nodeType.prototype.onNodeCreated = function () {
    const result = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
    // A brand new node instance should only ever show the button.
    this._loraRowCounter = 0;
    this._addAddLoraButton();
    this._resizeForWidgets();
    return result;
  };

  const origConfigure = nodeType.prototype.configure;
  nodeType.prototype.configure = function (info) {
    // Rebuild from scratch: drop every widget (including the button added
    // by onNodeCreated), let the base implementation restore non-widget
    // node state, then recreate the LoRA rows and button from the
    // serialized widget values. This correctly handles both workflow
    // deserialization and node copy/paste, since both funnel through
    // configure() with a full snapshot of widgets_values.
    while (this.widgets && this.widgets.length) {
      this.removeWidget(this.widgets[0]);
    }
    this._loraRowCounter = 0;

    if (origConfigure) {
      origConfigure.call(this, info);
    }

    // origConfigure restores `this.size` from the serialized node, but its
    // widget-restoration pass was a no-op above since `this.widgets` was
    // empty; rebuild the LoRA rows and button now that state is restored.
    const savedValues = (info && info.widgets_values) || [];
    for (const value of savedValues) {
      if (isLoraRowValue(value)) {
        this.addLoraRow(value);
      }
    }
    this._addAddLoraButton();

    this._resizeForWidgets();
    this.setDirtyCanvas(true, true);
  };
}

app.registerExtension({
  name: "v3LoraLoader.PowerLoraLoader",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (!NODE_IDS.has(nodeData.name)) {
      return;
    }
    setupPowerLoraLoaderNode(nodeType, NODE_IDS_WITH_CLIP_STRENGTH.has(nodeData.name));
  },
});

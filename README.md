# ComfyUI-v3LoraLoader

Power-Lora-Loader-style LoRA stacking nodes for ComfyUI, built on the `v3`
custom node API (`comfy_api.latest`). None of the supported model families
expose more per-LoRA parameters than a model strength (and, for one family, a
CLIP strength), so the node ontology is intentionally just two nodes, one per
input/output "shape":

| Node | Model families | Inputs / Outputs | Per-LoRA strengths |
| --- | --- | --- | --- |
| **Power Lora Loader (Model + CLIP)** | SDXL and derivatives (Illustrious XL, Pony XL, ...) | `MODEL` + `CLIP` | Model strength **and** CLIP strength |
| **Power Lora Loader (Model Only)** | Flux.1 Dev, Anima, Krea2 | `MODEL` only | Model strength |

CLIP strength is only exposed on the Model+CLIP node because the LoRAs for
Flux.1 Dev/Anima/Krea2 are conventionally trained against the diffusion model
only, so those checkpoints use the Model Only node, which doesn't take or
return a `CLIP` at all.

## UX

Each node mirrors the UX of rgthree-comfy's "Power Lora Loader":

- New node instances start out with a single **Add LoRA** button and nothing
  else.
- Clicking **Add LoRA** appends a LoRA row below it: an on/off toggle, a LoRA
  file picker, a model-strength field (click to type an exact value), a
  CLIP-strength field (Model + CLIP node only), and a small remove (✕)
  button.
- Reloading a saved workflow, or copy/pasting a node, faithfully restores
  every LoRA row and its current values.

## How it works

- **Backend (`v3_lora_loader/nodes.py`)**: each node's `Schema` sets
  `accept_all_inputs=True`, since the number of LoRA rows (and therefore
  inputs) isn't known ahead of time. `execute()` picks the dynamically named
  `lora_<n>` values back out of `**kwargs`, sorts them by their row order, and
  applies each enabled one with `comfy.sd.load_lora_for_models` (see
  `v3_lora_loader/lora_utils.py`).
- **Frontend (`web/js/power_lora_loader.js`)**: a LiteGraph custom widget
  draws and hit-tests each LoRA row (toggle / picker / strength fields /
  remove button) and serializes its value as the node's `lora_<n>` input,
  matching what the backend expects. The node's `configure()` is overridden
  to rebuild the LoRA rows from `widgets_values` on both workflow load and
  node clone/copy.

## Installation

Clone or copy this folder into your ComfyUI `custom_nodes` directory:

```
ComfyUI/custom_nodes/ComfyUI-v3LoraLoader
```

Restart ComfyUI. The two "Power Lora Loader (...)" nodes will appear under
the `loaders/lora` category (searchable as "lora" / "power lora loader").

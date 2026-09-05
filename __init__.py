"""ComfyUI-v3LoraLoader: Power-Lora-Loader-style nodes for the v3 node API.

Provides one "Power Lora Loader" node per supported diffusion model family
(SDXL and derivatives, Flux.1 Dev, Anima, Krea2), each exposing an
"Add LoRA" button that grows a stack of LoRA rows, matching the UX of
rgthree-comfy's Power Lora Loader node.
"""

from .v3_lora_loader import comfy_entrypoint

WEB_DIRECTORY = "./web"

__all__ = ["comfy_entrypoint", "WEB_DIRECTORY"]

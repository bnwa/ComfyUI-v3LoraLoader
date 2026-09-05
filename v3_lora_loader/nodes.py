"""v3-API Power Lora Loader nodes.

Rather than one node per diffusion model family, there are exactly two node
"shapes" here, because that's all the supported families actually need:

- Families whose LoRAs can meaningfully target both the diffusion model and
  CLIP (SDXL and its derivatives, e.g. Illustrious XL, Pony XL) get a
  MODEL+CLIP node with independent per-LoRA model/CLIP strengths.
- Families whose LoRAs only ever target the diffusion model (Flux.1 Dev,
  Anima, Krea2) get a MODEL-only node with just a per-LoRA model strength.

Both mirror the UX of rgthree-comfy's "Power Lora Loader": a node that starts
out with a single "Add LoRA" button, and grows a stack of coupled
LoRA-selection widgets as the user clicks that button. All of the actual
widget behavior lives in the frontend extension at
``web/js/power_lora_loader.js``; the Python side only needs to know how to
turn the dynamically-named ``lora_*`` inputs it receives back into applied
LoRA patches.
"""

from __future__ import annotations

from typing_extensions import override

from comfy_api.latest import ComfyExtension, io

from . import lora_utils

CATEGORY = "loaders/lora"


class LoraLoaderV3Base(io.ComfyNode):
    """Common execute() implementation shared by both node shapes.

    Subclasses only need to provide ``define_schema`` and set
    ``SUPPORTS_CLIP_STRENGTH``.
    """

    SUPPORTS_CLIP_STRENGTH = False

    @classmethod
    def execute(cls, model, clip=None, **kwargs) -> io.NodeOutput:
        cache = lora_utils.LoraCache()
        model, clip = lora_utils.apply_loras(
            model, clip, kwargs, cache, cls.SUPPORTS_CLIP_STRENGTH
        )
        if cls.SUPPORTS_CLIP_STRENGTH:
            return io.NodeOutput(model, clip)
        return io.NodeOutput(model)


class LoraLoaderClipV3(LoraLoaderV3Base):
    """Power Lora Loader for model families that also expose a CLIP model.

    Covers SDXL and its derivatives (Illustrious XL, Pony XL, ...).
    """

    SUPPORTS_CLIP_STRENGTH = True

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="V3PowerLoraLoaderModelClip",
            display_name="v3 LoRA Loader (Model + CLIP)",
            category=CATEGORY,
            description=(
                "Stack any number of LoRAs onto a diffusion model and its CLIP "
                "(SDXL and derivatives such as Illustrious XL and Pony XL), with "
                "independent per-LoRA model and CLIP strength control. "
                "Click \"Add LoRA\" to append a LoRA row."
            ),
            search_aliases=[
                "lora",
                "power lora loader",
                "sdxl lora",
                "illustrious",
                "pony",
            ],
            inputs=[
                io.Model.Input(
                    "model",
                    tooltip="The diffusion model the LoRAs will be applied to.",
                ),
                io.Clip.Input(
                    "clip",
                    tooltip="The CLIP model the LoRAs will be applied to.",
                ),
            ],
            outputs=[
                io.Model.Output(display_name="MODEL"),
                io.Clip.Output(display_name="CLIP"),
            ],
            # The lora_1, lora_2, ... rows are dynamically created by the
            # frontend widget and aren't declared ahead of time, so we need
            # to accept whatever extra inputs show up in the prompt.
            accept_all_inputs=True,
        )


class LoraLoaderV3(LoraLoaderV3Base):
    """Power Lora Loader for model families with no CLIP-targeted LoRA use.

    Covers Flux.1 Dev, Anima, and Krea2.
    """

    SUPPORTS_CLIP_STRENGTH = False

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="V3PowerLoraLoaderModelOnly",
            display_name="v3 LoRA Loader (Model Only)",
            category=CATEGORY,
            description=(
                "Stack any number of LoRAs onto a diffusion model (Flux.1 Dev, "
                "Anima, Krea2, or any other family whose LoRAs only target the "
                "diffusion model). Click \"Add LoRA\" to append a LoRA row."
            ),
            search_aliases=[
                "lora",
                "power lora loader",
                "flux lora",
                "flux.1",
                "anima lora",
                "krea lora",
                "krea2 lora",
            ],
            inputs=[
                io.Model.Input(
                    "model",
                    tooltip="The diffusion model the LoRAs will be applied to.",
                ),
            ],
            outputs=[
                io.Model.Output(display_name="MODEL"),
            ],
            accept_all_inputs=True,
        )


class V3PowerLoraLoaderExtension(ComfyExtension):
    @override
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        return [
            LoraLoaderClipV3,
            LoraLoaderV3,
        ]


async def comfy_entrypoint() -> V3PowerLoraLoaderExtension:
    return V3PowerLoraLoaderExtension()

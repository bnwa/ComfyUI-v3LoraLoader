"""Shared LoRA-loading helpers used by every Power Lora Loader node.

The nodes in this package accept an arbitrary, dynamically-sized set of "LoRA
row" values from the frontend widget (see ``web/js/power_lora_loader.js``).
Each row is a dict shaped like::

    {"on": bool, "lora": str | None, "strengthModel": float, "strengthClip": float | None}

and arrives as a node input keyed ``lora_<n>`` (``n`` being a monotonically
increasing integer assigned by the widget when the row was created). Because
the number and names of these inputs aren't known ahead of time, the node
schemas declare ``accept_all_inputs=True`` and this module is responsible for
picking the ``lora_*`` entries back out of the catch-all ``**kwargs``.
"""

from __future__ import annotations

from typing import Any

import comfy.sd
import comfy.utils
import folder_paths

LORA_ROW_PREFIX = "lora_"


class LoraCache:
    """Caches the most-recently-loaded LoRA state dict.

    Mirrors the behavior of the built-in ``LoraLoader`` node so that stacking
    many rows that reference the same file (e.g. while tweaking strengths)
    doesn't re-read it from disk on every execution.
    """

    def __init__(self) -> None:
        self._entries: dict[str, tuple[dict, dict | None]] = {}

    def get(self, lora_name: str) -> tuple[dict, dict | None]:
        cached = self._entries.get(lora_name)
        if cached is not None:
            return cached
        lora_path = folder_paths.get_full_path_or_raise("loras", lora_name)
        lora_sd, lora_metadata = comfy.utils.load_torch_file(
            lora_path, safe_load=True, return_metadata=True
        )
        self._entries[lora_name] = (lora_sd, lora_metadata)
        return lora_sd, lora_metadata


def _row_sort_key(item: tuple[str, Any]) -> int:
    key, _value = item
    suffix = key[len(LORA_ROW_PREFIX):]
    try:
        return int(suffix)
    except ValueError:
        return 0


def extract_lora_rows(kwargs: dict[str, Any]) -> list[dict[str, Any]]:
    """Pulls out and orders the dynamically-named ``lora_*`` row values.

    Rows are returned in the same order they appear in the node's UI (i.e.
    sorted by the numeric suffix of their key), which is also the order LoRAs
    get stacked/applied in.
    """
    candidates = [
        (key, value)
        for key, value in kwargs.items()
        if key.startswith(LORA_ROW_PREFIX)
        and isinstance(value, dict)
        and "lora" in value
        and "on" in value
    ]
    candidates.sort(key=_row_sort_key)
    return [value for _key, value in candidates]


def apply_loras(
    model,
    clip,
    kwargs: dict[str, Any],
    cache: LoraCache,
    supports_clip_strength: bool,
) -> tuple[Any, Any]:
    """Applies every enabled LoRA row found in ``kwargs`` to ``model``/``clip``.

    If ``supports_clip_strength`` is False (non-SDXL model families), any
    ``strengthClip`` present on a row is ignored and the LoRA is only ever
    applied to the diffusion model, matching how those architectures'
    text encoders are conventionally left untouched by LoRA training.
    """
    for row in extract_lora_rows(kwargs):
        if not row.get("on", True):
            continue
        lora_name = row.get("lora")
        if not lora_name or lora_name == "None":
            continue

        strength_model = float(row.get("strengthModel", 1.0) or 0.0)
        if supports_clip_strength and clip is not None:
            strength_clip_value = row.get("strengthClip")
            strength_clip = (
                float(strength_clip_value)
                if strength_clip_value is not None
                else strength_model
            )
        else:
            strength_clip = 0.0

        if strength_model == 0.0 and strength_clip == 0.0:
            continue

        lora_sd, lora_metadata = cache.get(lora_name)
        model, clip = comfy.sd.load_lora_for_models(
            model,
            clip if supports_clip_strength else None,
            lora_sd,
            strength_model,
            strength_clip,
            lora_metadata=lora_metadata,
        )

    return model, clip

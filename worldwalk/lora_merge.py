"""Merge a ComfyUI/Kijai-format Wan2.1 LoRA (e.g. CausVid few-step distillation) straight into a diffusers
WanTransformer3DModel / WanVACETransformer3DModel — no PEFT, no diffusers LoRA loader (which rejected it).

Key mapping (original Wan names -> diffusers names):
  blocks.N.self_attn.{q,k,v,o}   -> blocks.N.attn1.{to_q,to_k,to_v,to_out.0}
  blocks.N.cross_attn.{q,k,v,o}  -> blocks.N.attn2.{to_q,to_k,to_v,to_out.0}
  blocks.N.ffn.0 / ffn.2         -> blocks.N.ffn.net.0.proj / ffn.net.2
  text_embedding.0/2, time_embedding.0/2, time_projection.1, head.head -> condition_embedder.* / proj_out
LoRA pair names: lora_down/lora_up (+ .alpha) or lora_A/lora_B. Bias deltas (.diff_b) are added to the bias.
W += strength * (alpha / rank) * up @ down.   Returns a report dict (matched / unmatched / examples)."""
import re

import torch

_SIMPLE = {
    "text_embedding.0": "condition_embedder.text_embedder.linear_1",
    "text_embedding.2": "condition_embedder.text_embedder.linear_2",
    "time_embedding.0": "condition_embedder.time_embedder.linear_1",
    "time_embedding.2": "condition_embedder.time_embedder.linear_2",
    "time_projection.1": "condition_embedder.time_proj",
    "head.head": "proj_out",
}
_ATT = {"q": "to_q", "k": "to_k", "v": "to_v", "o": "to_out.0"}


def map_name(base):
    """original-Wan module path (without lora suffix) -> diffusers module path, or None"""
    b = re.sub(r"^(diffusion_model\.|transformer\.|model\.|lora_unet_)", "", base)
    m = re.match(r"blocks\.(\d+)\.(self_attn|cross_attn)\.([qkvo])$", b)
    if m:
        return f"blocks.{m.group(1)}.{'attn1' if m.group(2) == 'self_attn' else 'attn2'}.{_ATT[m.group(3)]}"
    m = re.match(r"blocks\.(\d+)\.ffn\.(0|2)$", b)
    if m:
        return f"blocks.{m.group(1)}.ffn.net.0.proj" if m.group(2) == "0" else f"blocks.{m.group(1)}.ffn.net.2"
    return _SIMPLE.get(b)


def split(key):
    for suf in (".lora_down.weight", ".lora_up.weight", ".lora_A.weight", ".lora_B.weight", ".alpha", ".diff_b", ".diff"):
        if key.endswith(suf):
            return key[: -len(suf)], suf
    return key, ""


@torch.no_grad()
def merge_lora(transformer, sd, strength=1.0):
    """sd: dict name -> tensor (safetensors.torch.load_file). Merges in place."""
    mods = dict(transformer.named_modules())
    groups = {}
    for k, v in sd.items():
        base, suf = split(k)
        groups.setdefault(base, {})[suf] = v
    matched, unmatched, bias = 0, [], 0
    for base, g in groups.items():
        name = map_name(base)
        mod = mods.get(name) if name else None
        down = g.get(".lora_down.weight", g.get(".lora_A.weight"))
        up = g.get(".lora_up.weight", g.get(".lora_B.weight"))
        if mod is None or not hasattr(mod, "weight"):
            if down is not None or ".diff_b" in g:
                unmatched.append(base)
            continue
        if down is not None and up is not None:
            rank = down.shape[0]
            alpha = float(g[".alpha"]) if ".alpha" in g else float(rank)
            delta = (up.float() @ down.float()) * (alpha / rank) * strength
            if delta.shape != mod.weight.shape:
                unmatched.append(f"{base} (shape {tuple(delta.shape)} vs {tuple(mod.weight.shape)})")
                continue
            mod.weight += delta.to(mod.weight.device, mod.weight.dtype)
            matched += 1
        if ".diff_b" in g and getattr(mod, "bias", None) is not None and g[".diff_b"].shape == mod.bias.shape:
            mod.bias += (g[".diff_b"].float() * strength).to(mod.bias.device, mod.bias.dtype)
            bias += 1
    return {"matched_layers": matched, "bias_deltas": bias, "unmatched": len(unmatched), "unmatched_examples": unmatched[:6]}

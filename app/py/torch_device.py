#!/usr/bin/env python3
import torch

def choose_torch_device():
    # Prefer Apple Metal (MPS) on Apple Silicon
    try:
        if hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
            return torch.device('mps')
    except Exception:
        pass
    # CUDA if present
    try:
        if torch.cuda.is_available():
            return torch.device('cuda')
    except Exception:
        pass
    # CPU fallback
    return torch.device('cpu')

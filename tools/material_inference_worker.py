"""Runs in the existing See-Through environment, never mutating its repository."""
import gc
import json
import sys
from pathlib import Path

config=json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
sys.path[:0]=[str(Path(config['repo'])/'common'),config['repo']]
import torch
from utils import inference_utils
from utils.torch_utils import seed_everything

seed_everything(config['seed'])
if config['operation']=='split':
    inference_utils.apply_layerdiff(config['source'],config['models']['layerdifforg/seethroughv0.0.2_layerdiff3d'],
        save_dir=config['output'],seed=config['seed'],resolution=config['resolution'],num_inference_steps=config['steps'],group_offload=True)
    # Like PachiPakuGen's probe, stop before depth and PSD assembly. Keep candidates.
    inference_utils.layerdiff_pipeline=None
else:
    inference_utils.apply_marigold(config['source'],config['models']['24yearsold/seethroughv0.0.1_marigold'],
        save_dir=config['output'],seed=config['seed'],resolution=config['resolution'],num_inference_steps=config['steps'],group_offload=True)
    inference_utils.marigold_pipeline=None
gc.collect()
torch.cuda.empty_cache()
print('SVG-Through material inference finished',flush=True)

"""Laser-cut L-bracket: when does the buckling guard bind as load and arm length change."""
from .model import Params, Material, solve, mass_g, build_polygon
from .measures import patch_max
from .dfm import Process, PROCESSES, PATCH_RHO, FREE, rule_violations, analysis_params, process_mass, evaluate
from .optimise import optimise
from .export import write_dxf, read_dxf
from .stl import write_extruded_stl
from . import ltb, dfm

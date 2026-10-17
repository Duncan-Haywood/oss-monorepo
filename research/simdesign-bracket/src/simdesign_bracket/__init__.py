"""Parametric L-bracket: 2D plane-stress FE (scikit-fem), optimisation, printability, STL export."""
from .model import Params, Material, solve, mass_g, build_polygon
from .printability import check_printability
from .stl import write_extruded_stl

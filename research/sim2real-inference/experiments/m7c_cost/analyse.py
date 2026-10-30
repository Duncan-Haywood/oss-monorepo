"""Run the milestone-3 pre-registered analysis (H1, H2, H6) unchanged on the cart-pole cost pools.
python3 analyse.py  ->  results/{coverage,h2,h6}.csv, results/summary.txt  (reads results/pool.csv in this directory)"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "m3_benchmark"))
import analyse as m3

if __name__ == "__main__":
    m3.main()

# aerolog-scaling milestone 9d (2026-10-29)

Question: can an adjustable tail area recover the longitudinal modes when the true tail slope is 0.75 to 1.0 of NeuralFoil's? Answer: yes for 77 of 78 designs (m up to 1.475). Details in `research/aerolog-scaling/LOG.md`.

For the next run:
- UIUC (m-selig.ae.illinois.edu) is still refused by the proxy (HTTP 000), so NACA 0012/0015 data and tail-slope validation remain open.
- Open: gust metrics at the adjusted tail (9c with m free); tail-slope identification protocol; thrust law; AIAA template (needs pdflatex).
- Environment: `pyenv.py pytest numpy aerosandbox neuralfoil` returns /usr/bin/python3.13 after about 4 min; tests need `PYTHONPATH=src`.

import os, pickle, subprocess, requests, yaml, tarfile
def f(user, blob, url, path):
    eval(user)
    pickle.loads(blob)
    yaml.load(blob)
    subprocess.run(user, shell=True)
    os.system("ls " + user)
    requests.get(url, verify=False)
    tarfile.open(path).extractall("/tmp/x")

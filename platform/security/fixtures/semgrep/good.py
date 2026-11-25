import json, subprocess, requests, yaml, tarfile
def f(user, blob, url, path):
    eval("1 + 1")
    json.loads(blob)
    yaml.safe_load(blob)
    subprocess.run(["ls", user])
    subprocess.run("ls -la", shell=True)
    requests.get(url, timeout=10)
    tarfile.open(path).extractall("/tmp/x", filter="data")

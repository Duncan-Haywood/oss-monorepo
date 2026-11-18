import hashlib
import io
import json
import multiprocessing
import threading
from datetime import datetime, timezone
from pathlib import Path

import pytest

from igmp import bucket as bk, outputs
from igmp.bucket import LocalBucket, Obj, PreconditionFailed, S3Bucket, open_bucket
from igmp.config import Config


def b2(data: bytes) -> str:
    return hashlib.blake2b(data, digest_size=20).hexdigest()


# --------------------------------------------------------------------------- LocalBucket

def test_local_put_get_head_list_delete(tmp_path):
    b = LocalBucket(tmp_path / "bkt")
    src = tmp_path / "a.jpg"
    src.write_bytes(b"jpeg bytes")
    o = b.put_file("library/2026/a.jpg", src, meta={"blake2b": "abc"})
    assert (o.key, o.size, o.etag, o.meta) == ("library/2026/a.jpg", 10, b2(b"jpeg bytes"), {"blake2b": "abc"})
    assert b.head("library/2026/a.jpg") == o
    assert b.head("library/2026/missing.jpg") is None
    b.put_bytes("status.json", b"{}", content_type="application/json")
    assert [x.key for x in b.list()] == ["library/2026/a.jpg", "status.json"]
    assert [x.key for x in b.list("library/")] == ["library/2026/a.jpg"]
    # metadata sidecars and temporaries never show as objects
    assert (tmp_path / "bkt" / ".meta" / "library" / "2026" / "a.jpg.json").exists()
    out = tmp_path / "dl" / "a.jpg"
    assert b.get_file("library/2026/a.jpg", out).etag == o.etag and out.read_bytes() == b"jpeg bytes"
    assert list(out.parent.iterdir()) == [out]
    data, obj = b.get_bytes("status.json")
    assert data == b"{}" and obj.etag == b2(b"{}")
    assert b.get_bytes("nope.json") is None
    with pytest.raises(KeyError):
        b.get_file("nope.json", tmp_path / "x")
    b.delete("library/2026/a.jpg")
    assert b.head("library/2026/a.jpg") is None and not (tmp_path / "bkt" / "library").exists()
    b.delete("library/2026/a.jpg")          # deleting what is gone is fine, as on S3


def test_local_empty_bucket_lists_nothing(tmp_path):
    assert list(LocalBucket(tmp_path / "none").list()) == []


def test_local_rejects_bad_keys(tmp_path):
    b = LocalBucket(tmp_path)
    for key in ("", "/abs", "a/../b", "a//b", ".meta/x"):
        with pytest.raises(ValueError):
            b.put_bytes(key, b"x")


def test_local_etag_follows_content_and_hand_copied_objects(tmp_path):
    b = LocalBucket(tmp_path)
    o1 = b.put_bytes("k", b"one")
    o2 = b.put_bytes("k", b"two")
    assert o1.etag != o2.etag == b2(b"two")
    # a file dropped into the folder by hand, and one changed behind the sidecar's back
    (tmp_path / "hand.txt").write_bytes(b"by hand")
    assert b.head("hand.txt").etag == b2(b"by hand") and b.head("hand.txt").meta == {}
    src = tmp_path / "s"
    src.write_bytes(b"orig")
    b.put_file("m", src, meta={"blake2b": "old"})
    (tmp_path / "m").write_bytes(b"changed!")
    h = b.head("m")
    assert h.etag == b2(b"changed!") and h.meta == {}       # stale meta would vouch for the old bytes


def test_local_conditional_puts(tmp_path):
    b = LocalBucket(tmp_path)
    o = b.put_bytes("lease.json", b"a", if_none_match=True)
    with pytest.raises(PreconditionFailed):
        b.put_bytes("lease.json", b"b", if_none_match=True)
    with pytest.raises(PreconditionFailed):
        b.put_bytes("lease.json", b"b", if_match="not-the-etag")
    with pytest.raises(PreconditionFailed):
        b.put_bytes("absent.json", b"b", if_match=o.etag)
    o2 = b.put_bytes("lease.json", b"b", if_match=o.etag)
    assert b.get_bytes("lease.json")[0] == b"b"
    with pytest.raises(PreconditionFailed):          # the old etag no longer holds
        b.put_bytes("lease.json", b"c", if_match=o.etag)
    assert b.put_bytes("lease.json", b"c", if_match=o2.etag).etag == b2(b"c")


def test_local_breaks_a_stale_lock(tmp_path, monkeypatch):
    b = LocalBucket(tmp_path)
    lock = tmp_path / ".meta" / "k.lock"
    lock.parent.mkdir(parents=True)
    lock.write_text("12345\n")
    import os
    os.utime(lock, (0, 0))                           # left by a process that died long ago
    assert b.put_bytes("k", b"x", if_none_match=True).size == 1
    assert not lock.exists()


def _race(root: str, n: int, q) -> None:
    try:
        LocalBucket(Path(root)).put_bytes("lease.json", f"worker {n}".encode(), if_none_match=True)
        q.put(n)
    except PreconditionFailed:
        q.put(None)


def test_local_conditional_create_race_between_processes(tmp_path):
    ctx = multiprocessing.get_context("fork")
    q = ctx.Queue()
    procs = [ctx.Process(target=_race, args=(str(tmp_path), i, q)) for i in range(8)]
    for p in procs:
        p.start()
    results = [q.get(timeout=30) for _ in procs]
    for p in procs:
        p.join(10)
    winners = [r for r in results if r is not None]
    assert len(winners) == 1
    assert LocalBucket(tmp_path).get_bytes("lease.json")[0] == f"worker {winners[0]}".encode()


def test_local_if_match_race_between_threads(tmp_path):
    b = LocalBucket(tmp_path)
    o = b.put_bytes("lease.json", b"start")
    wins, barrier = [], threading.Barrier(8)

    def one(i):
        barrier.wait()
        try:
            b.put_bytes("lease.json", f"t{i}".encode(), if_match=o.etag)
            wins.append(i)
        except PreconditionFailed:
            pass
    ts = [threading.Thread(target=one, args=(i,)) for i in range(8)]
    for t in ts:
        t.start()
    for t in ts:
        t.join()
    assert len(wins) == 1 and b.get_bytes("lease.json")[0] == f"t{wins[0]}".encode()


def test_local_never_writes_under_a_missing_volume(tmp_path, monkeypatch):
    vol = tmp_path / "Volumes" / "NAS"
    monkeypatch.setattr(outputs, "volume_root", lambda p: vol)
    monkeypatch.setattr(outputs, "_mounted", lambda v: False)
    b = LocalBucket(vol / "igmp")
    with pytest.raises(OSError, match="not mounted"):
        b.put_bytes("k", b"x")
    assert not vol.exists()
    assert list(b.list()) == [] and b.head("k") is None


# --------------------------------------------------------------------------- open_bucket

def cfg(tmp_path, **extra):
    return Config(library_roots=[], output_dir=tmp_path / "out", extra={"state_dir": str(tmp_path / "st"), **extra})


def test_open_bucket_from_settings(tmp_path):
    assert open_bucket(cfg(tmp_path)) is None
    lb = open_bucket(cfg(tmp_path, cloud_url=f"file://{tmp_path}/nas"))
    assert isinstance(lb, LocalBucket) and lb.root == tmp_path / "nas"
    lb = open_bucket(cfg(tmp_path, cloud_url=f"file://{tmp_path}/nas", cloud_prefix="me"))
    assert lb.root == tmp_path / "nas" / "me"
    s3 = open_bucket(cfg(tmp_path, cloud_url="s3://igmp-media/dh", cloud_prefix="v1/",
                         cloud_endpoint="https://acct.r2.cloudflarestorage.com"))
    assert isinstance(s3, S3Bucket)
    assert (s3.bucket, s3.prefix, s3.endpoint_url, s3.region) == \
        ("igmp-media", "dh/v1/", "https://acct.r2.cloudflarestorage.com", "auto")
    assert open_bucket(cfg(tmp_path, cloud_url="s3://b")).prefix == ""
    for bad in ("s3://", "gs://x", "/plain/path"):
        with pytest.raises(ValueError):
            open_bucket(cfg(tmp_path, cloud_url=bad))


# --------------------------------------------------------------------------- S3Bucket, no network

@pytest.fixture
def s3():
    pytest.importorskip("boto3")
    import boto3
    from botocore.stub import Stubber
    client = boto3.client("s3", region_name="auto", endpoint_url="https://example.invalid",
                          aws_access_key_id="test", aws_secret_access_key="test")
    with Stubber(client) as stub:
        yield S3Bucket("bkt", "pre", client=client), stub
        stub.assert_no_pending_responses()


WHEN = datetime(2026, 11, 1, 12, 0, tzinfo=timezone.utc)


def test_s3_head_and_missing(s3):
    b, stub = s3
    stub.add_response("head_object", {"ContentLength": 5, "ETag": '"e1"', "LastModified": WHEN,
                                      "Metadata": {"blake2b": "abc"}}, {"Bucket": "bkt", "Key": "pre/a/b.jpg"})
    stub.add_client_error("head_object", "404", http_status_code=404, expected_params={"Bucket": "bkt", "Key": "pre/x"})
    assert b.head("a/b.jpg") == Obj("a/b.jpg", 5, "e1", WHEN.timestamp(), {"blake2b": "abc"})
    assert b.head("x") is None


def test_s3_head_other_errors_raise(s3):
    from botocore.exceptions import ClientError
    b, stub = s3
    stub.add_client_error("head_object", "AccessDenied", http_status_code=403)
    with pytest.raises(ClientError):
        b.head("x")


def test_s3_list_pages_and_strips_the_prefix(s3):
    b, stub = s3
    stub.add_response("list_objects_v2", {"IsTruncated": True, "NextContinuationToken": "t",
                                          "Contents": [{"Key": "pre/library/r/a.jpg", "Size": 3, "ETag": '"x"',
                                                        "LastModified": WHEN}]},
                      {"Bucket": "bkt", "Prefix": "pre/library/"})
    stub.add_response("list_objects_v2", {"IsTruncated": False,
                                          "Contents": [{"Key": "pre/library/r/b.mp4", "Size": 9, "ETag": '"y"',
                                                        "LastModified": WHEN}]},
                      {"Bucket": "bkt", "Prefix": "pre/library/", "ContinuationToken": "t"})
    got = list(b.list("library/"))
    assert [(o.key, o.size, o.etag) for o in got] == [("library/r/a.jpg", 3, "x"), ("library/r/b.mp4", 9, "y")]


def test_s3_conditional_puts(s3):
    b, stub = s3
    stub.add_response("put_object", {"ETag": '"new"'},
                      {"Bucket": "bkt", "Key": "pre/lease.json", "Body": b"{}", "IfNoneMatch": "*",
                       "ContentType": "application/json"})
    stub.add_client_error("put_object", "PreconditionFailed", http_status_code=412)
    stub.add_client_error("put_object", "ConditionalRequestConflict", http_status_code=409)
    stub.add_response("put_object", {"ETag": '"n2"'},
                      {"Bucket": "bkt", "Key": "pre/lease.json", "Body": b"x", "IfMatch": '"new"'})
    o = b.put_bytes("lease.json", b"{}", if_none_match=True, content_type="application/json")
    assert (o.etag, o.size) == ("new", 2)
    with pytest.raises(PreconditionFailed):
        b.put_bytes("lease.json", b"{}", if_none_match=True)
    with pytest.raises(PreconditionFailed):
        b.put_bytes("lease.json", b"x", if_match="new")
    assert b.put_bytes("lease.json", b"x", if_match=o.etag).etag == "n2"


def test_s3_get_bytes_and_delete(s3):
    from botocore.response import StreamingBody
    b, stub = s3
    stub.add_response("get_object", {"Body": StreamingBody(io.BytesIO(b'{"a":1}'), 7), "ETag": '"e"',
                                     "LastModified": WHEN}, {"Bucket": "bkt", "Key": "pre/status.json"})
    stub.add_client_error("get_object", "NoSuchKey", http_status_code=404)
    stub.add_response("delete_object", {}, {"Bucket": "bkt", "Key": "pre/status.json"})
    data, o = b.get_bytes("status.json")
    assert json.loads(data) == {"a": 1} and o.etag == "e" and o.size == 7
    assert b.get_bytes("status.json") is None
    b.delete("status.json")


def test_s3_put_file_and_get_file(tmp_path, s3):
    from botocore.stub import ANY
    from botocore.response import StreamingBody
    b, stub = s3
    src = tmp_path / "clip.mp4"
    src.write_bytes(b"0123456789")
    stub.add_response("put_object", {"ETag": '"u"'},
                      {"Bucket": "bkt", "Key": "pre/library/r/clip.mp4", "Body": ANY,
                       "Metadata": {"blake2b": "abc", "igmp-proxy": "1"}, "ChecksumAlgorithm": ANY})
    stub.add_response("head_object", {"ContentLength": 10, "ETag": '"u"', "LastModified": WHEN,
                                      "Metadata": {"blake2b": "abc", "igmp-proxy": "1"}})
    o = b.put_file("library/r/clip.mp4", src, meta={"blake2b": "abc", "igmp-proxy": "1"})
    assert o.meta["igmp-proxy"] == "1" and o.size == 10

    stub.add_response("head_object", {"ContentLength": 10, "ETag": '"u"', "LastModified": WHEN, "Metadata": {}})
    stub.add_response("head_object", {"ContentLength": 10, "ETag": '"u"', "LastModified": WHEN, "Metadata": {}})
    stub.add_response("get_object", {"Body": StreamingBody(io.BytesIO(b"0123456789"), 10), "ContentLength": 10,
                                     "ETag": '"u"'})
    dest = tmp_path / "mirror" / "r" / "clip.mp4"
    assert b.get_file("library/r/clip.mp4", dest).size == 10
    assert dest.read_bytes() == b"0123456789" and list(dest.parent.iterdir()) == [dest]


def test_s3_client_is_made_lazily_from_the_environment(monkeypatch):
    pytest.importorskip("boto3")
    made = {}
    import boto3
    monkeypatch.setattr(boto3, "client", lambda *a, **k: made.update(args=a, kw=k) or "client")
    b = S3Bucket("bkt", endpoint_url="https://acct.r2.cloudflarestorage.com")
    assert made == {}
    assert b.client == "client"
    assert made["args"] == ("s3",) and made["kw"]["endpoint_url"] == "https://acct.r2.cloudflarestorage.com"
    assert "aws_access_key_id" not in made["kw"]       # credentials: boto3's default chain only

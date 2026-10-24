import json
import shutil
import subprocess
import xml.dom.minidom
from datetime import datetime

import pytest

from igmp import metadata
from igmp.config import Config
from igmp.models import Asset, Metrics, Point, Score
from igmp.store import Store

PLACES = {"Harbor": {"city": "Harbor", "state": "Coast", "country": "Nowhere", "country_code": "NW",
                     "timezone": "Asia/Riyadh", "lat": 41.0, "lon": 29.0}}


def cfg(tmp_path):
    return Config(library_roots=[], output_dir=tmp_path, places=PLACES)


def asset(tmp_path, **kw):
    raw = tmp_path / "2026-08-24_193814_Harbor_Party_A7RV_DSC06481.ARW"
    raw.write_bytes(b"raw")
    base = dict(id="a1", kind="photo", files=[str(raw)], raw=str(raw), preview=str(raw.with_suffix(".JPG")),
                taken_at=datetime(2026, 8, 24, 19, 38, 14), date_label="2026-08-24",
                location="Harbor", event="Party", camera="A7RV")
    return Asset(**{**base, **kw})


def score(**kw):
    base = dict(score=8.4, keep=True, role="hook", subject="street at night", mood="lively",
                vertical_focus=Point(x=0.4, y=0.5), feed_focus=Point(x=0.5, y=0.5), issues=["tilted"])
    return Score(**{**base, **kw})


def test_fields_carry_local_time_place_and_rating(tmp_path):
    f = metadata.fields(asset(tmp_path), cfg(tmp_path), score(), None, None, [])
    assert f["exif:DateTimeOriginal"] == "2026-08-24T19:38:14+03:00"
    assert f["photoshop:City"] == "Harbor" and f["Iptc4xmpCore:CountryCode"] == "NW"
    assert f["xmp:Rating"] == 4 and f["xmp:Label"] == "Yellow"
    assert "Places|Nowhere|Coast|Harbor" in f["lr:hierarchicalSubject"]
    assert "Events|Party" in f["lr:hierarchicalSubject"] and "street at night" in f["dc:subject"]
    assert f["igmp:VerticalFocus"] == "0.400,0.500" and f["igmp:GPSPrecision"] == "city"


def test_edit_status_sets_label(tmp_path):
    f = metadata.fields(asset(tmp_path), cfg(tmp_path), score(), None, {"status": "shipped", "full": "x.jpg"}, [])
    assert f["xmp:Label"] == "Green" and f["igmp:EditStatus"] == "shipped"


def test_unscored_shot_still_gets_time_and_place(tmp_path):
    f = metadata.fields(asset(tmp_path), cfg(tmp_path), None, None, None, [])
    assert "xmp:Rating" not in f and f["photoshop:Country"] == "Nowhere"


def test_sidecar_is_valid_xmp_next_to_the_raw(tmp_path):
    a = asset(tmp_path)
    path = metadata.write_sidecar(a, metadata.fields(a, cfg(tmp_path), score(), None, None, ["r1"]), cfg(tmp_path))
    assert path == tmp_path / "2026-08-24_193814_Harbor_Party_A7RV_DSC06481.xmp"
    text = path.read_text()
    body = text[text.index("<x:xmpmeta"):text.index("</x:xmpmeta>") + len("</x:xmpmeta>")]
    xml.dom.minidom.parseString(body)          # well-formed
    assert "<igmp:Writer>igmp</igmp:Writer>" in text and "r1" in text


@pytest.mark.skipif(shutil.which("exiftool") is None, reason="exiftool not installed")
def test_exiftool_reads_what_we_wrote(tmp_path):
    a = asset(tmp_path)
    c = cfg(tmp_path)
    path = metadata.write_sidecar(a, metadata.fields(a, c, score(), None, None, []), c)
    out = json.loads(subprocess.run(["exiftool", "-j", "-config", str(metadata.EXIFTOOL_CONFIG), "-G1",
                                     str(path)], capture_output=True, text=True).stdout)[0]
    assert out["XMP-exif:DateTimeOriginal"].startswith("2026:08:24 19:38:14+03:00")
    assert out["XMP-xmp:Rating"] == 4 and out["XMP-photoshop:City"] == "Harbor"
    assert out["XMP-igmp:Score"] == 8.4


@pytest.mark.skipif(shutil.which("exiftool") is None, reason="exiftool not installed")
def test_foreign_sidecar_is_merged_not_replaced(tmp_path):
    a = asset(tmp_path)
    c = cfg(tmp_path)
    side = metadata.sidecar_path(a)
    side.write_text('<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
                    '<rdf:Description rdf:about="" xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/" '
                    'crs:Exposure2012="+0.50"/></rdf:RDF></x:xmpmeta>')
    metadata.write_sidecar(a, metadata.fields(a, c, score(), None, None, []), c)
    out = json.loads(subprocess.run(["exiftool", "-j", "-config", str(metadata.EXIFTOOL_CONFIG), "-G1",
                                     str(side)], capture_output=True, text=True).stdout)[0]
    assert out["XMP-crs:Exposure2012"] in ("+0.50", 0.5)      # the other app's edit survives
    assert out["XMP-xmp:Rating"] == 4


def test_tag_all_skips_unchanged(tmp_path):
    c = cfg(tmp_path)
    store = Store(tmp_path / "s.sqlite")
    a = asset(tmp_path)
    store.put("scores", a.id, score())
    assert metadata.tag_all(c, store, [a]) == 1
    assert metadata.tag_all(c, store, [a]) == 0          # nothing changed, nothing rewritten
    store.put("scores", a.id, score(score=9.6))
    assert metadata.tag_all(c, store, [a]) == 1

"""Integrity-check tests, built on real archives rather than mocks.

Every fixture here is produced by the standard library's own writers and then,
where a corrupt case is needed, damaged the way a real failure damages a file:
truncated (the disk filled, the pipe broke) or bit-flipped (the storage lied).
Mocking the decompressors would test that the plumbing calls them; writing real
bytes tests the thing customers actually depend on, which is that a truncated
archive is never reported intact.
"""

from __future__ import annotations

import bz2
import gzip
import io
import lzma
import os
import sqlite3
import sys
import tarfile
import tempfile
import unittest
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from backup_evidence.integrity import (  # noqa: E402
    CORRUPT,
    INCONCLUSIVE,
    INTACT,
    UNSUPPORTED,
    detect_format,
    inspect_artifact,
)

PAYLOAD = b"backup payload line\n" * 5000  # ~100 KB, larger than one tar block


def _truncate(path: Path, fraction: float = 0.6) -> Path:
    cut = path.with_name("truncated-" + path.name)
    data = path.read_bytes()
    cut.write_bytes(data[: int(len(data) * fraction)])
    return cut


class ArtifactFixtureCase(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.dir = Path(self._tmp.name)

    def write(self, name: str, data: bytes) -> Path:
        path = self.dir / name
        path.write_bytes(data)
        return path

    def make_tar(self, name: str, mode: str = "w") -> Path:
        path = self.dir / name
        with tarfile.open(path, mode) as archive:
            for index in range(3):
                info = tarfile.TarInfo(f"member-{index}.txt")
                info.size = len(PAYLOAD)
                archive.addfile(info, io.BytesIO(PAYLOAD))
        return path


class DetectFormatTests(ArtifactFixtureCase):
    def test_detects_by_magic_bytes_not_extension(self) -> None:
        # A gzip stream deliberately named to look like something else: backup
        # jobs mislabel artifacts constantly, so the name must not be trusted.
        path = self.write("nightly.bak", gzip.compress(PAYLOAD))
        self.assertEqual(detect_format(path, path.read_bytes()[:4096]), "gzip")

    def test_detects_plain_tar(self) -> None:
        path = self.make_tar("plain.tar")
        self.assertEqual(detect_format(path, path.read_bytes()[:4096]), "tar")

    def test_unrecognised_content_is_unknown(self) -> None:
        path = self.write("notes.txt", b"just some text\n")
        self.assertEqual(detect_format(path, path.read_bytes()[:4096]), "unknown")


class GzipTests(ArtifactFixtureCase):
    def test_intact_gzip(self) -> None:
        result = inspect_artifact(self.write("dump.sql.gz", gzip.compress(PAYLOAD)))
        self.assertEqual(result["result"], INTACT)
        self.assertEqual(result["format"], "gzip")
        self.assertEqual(result["bytes_read"], len(PAYLOAD))

    def test_truncated_gzip_is_corrupt(self) -> None:
        path = self.write("dump.sql.gz", gzip.compress(PAYLOAD))
        result = inspect_artifact(_truncate(path))
        self.assertEqual(result["result"], CORRUPT)

    def test_bitflip_gzip_fails_crc(self) -> None:
        # The nastiest case: right length, right mtime, wrong bytes. Only the
        # format's own checksum catches it.
        data = bytearray(gzip.compress(PAYLOAD))
        data[len(data) // 2] ^= 0xFF
        result = inspect_artifact(self.write("rot.gz", bytes(data)))
        self.assertEqual(result["result"], CORRUPT)
        self.assertIn("CRC", result["detail"])


class TarTests(ArtifactFixtureCase):
    def test_intact_tar_gz_counts_members(self) -> None:
        result = inspect_artifact(self.make_tar("backup.tar.gz", "w:gz"))
        self.assertEqual(result["result"], INTACT)
        self.assertEqual(result["format"], "tar.gz")
        self.assertEqual(result["members_checked"], 3)

    def test_truncated_tar_gz_is_corrupt(self) -> None:
        result = inspect_artifact(_truncate(self.make_tar("backup.tar.gz", "w:gz")))
        self.assertEqual(result["result"], CORRUPT)

    def test_truncated_plain_tar_is_corrupt(self) -> None:
        result = inspect_artifact(_truncate(self.make_tar("backup.tar")))
        self.assertEqual(result["result"], CORRUPT)

    def test_tar_truncated_inside_a_valid_gzip_is_corrupt(self) -> None:
        """The `cmd | gzip` case: the gzip wrapper is flawless, the tar is not.

        This is the failure that motivates walking the tar rather than only
        decompressing it. Truncating the *tar* and then compressing the result
        yields a file whose gzip CRC matches perfectly -- decompression alone
        reports it clean.
        """
        tar_bytes = self.make_tar("inner.tar").read_bytes()
        cut = tar_bytes[: int(len(tar_bytes) * 0.5)]
        path = self.write("half.tar.gz", gzip.compress(cut))

        # Precondition: the gzip layer really is intact, so a decompress-only
        # check would pass this file.
        self.assertEqual(gzip.decompress(path.read_bytes()), cut)

        result = inspect_artifact(path)
        self.assertEqual(result["result"], CORRUPT)
        self.assertEqual(result["format"], "tar.gz")

    def test_bz2_and_xz_tars(self) -> None:
        for name, mode, fmt in (
            ("b.tar.bz2", "w:bz2", "tar.bz2"),
            ("b.tar.xz", "w:xz", "tar.xz"),
        ):
            with self.subTest(fmt=fmt):
                result = inspect_artifact(self.make_tar(name, mode))
                self.assertEqual(result["result"], INTACT)
                self.assertEqual(result["format"], fmt)

    def test_max_bytes_stops_early_and_reports_inconclusive(self) -> None:
        # A partial read must never be reported as intact -- the tail is exactly
        # where truncation lives, so stopping early means not knowing.
        result = inspect_artifact(self.make_tar("big.tar.gz", "w:gz"), max_bytes=1024)
        self.assertEqual(result["result"], INCONCLUSIVE)
        self.assertIn("limit", result["detail"])


class CompressionTests(ArtifactFixtureCase):
    def test_truncated_bz2_and_xz_are_corrupt(self) -> None:
        for name, data in (
            ("a.bz2", bz2.compress(PAYLOAD)),
            ("a.xz", lzma.compress(PAYLOAD)),
        ):
            with self.subTest(name=name):
                result = inspect_artifact(_truncate(self.write(name, data)))
                self.assertEqual(result["result"], CORRUPT)


class ZipTests(ArtifactFixtureCase):
    def _zip(self, name: str) -> Path:
        path = self.dir / name
        with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as archive:
            for index in range(3):
                archive.writestr(f"member-{index}.txt", PAYLOAD)
        return path

    def test_intact_zip(self) -> None:
        result = inspect_artifact(self._zip("good.zip"))
        self.assertEqual(result["result"], INTACT)
        self.assertEqual(result["members_checked"], 3)

    def test_truncated_zip_is_corrupt(self) -> None:
        result = inspect_artifact(_truncate(self._zip("good.zip")))
        self.assertEqual(result["result"], CORRUPT)


class SqliteTests(ArtifactFixtureCase):
    def _db(self, name: str) -> Path:
        path = self.dir / name
        connection = sqlite3.connect(path)
        connection.execute("CREATE TABLE t (a INTEGER, b TEXT)")
        connection.executemany(
            "INSERT INTO t VALUES (?, ?)", [(i, "x" * 200) for i in range(2000)]
        )
        connection.commit()
        connection.close()
        return path

    def test_intact_sqlite(self) -> None:
        result = inspect_artifact(self._db("app.db"))
        self.assertEqual(result["result"], INTACT)
        self.assertEqual(result["format"], "sqlite")

    def test_truncated_sqlite_is_corrupt(self) -> None:
        result = inspect_artifact(_truncate(self._db("app.db")))
        self.assertEqual(result["result"], CORRUPT)

    def test_check_does_not_modify_the_database(self) -> None:
        # A verifier that writes to the artifact it verifies (journal files,
        # recovery, an mtime bump) would corrupt the very evidence the rest of
        # this tool reasons about. It must be strictly read-only.
        path = self._db("app.db")
        before = path.read_bytes()
        before_mtime = path.stat().st_mtime
        inspect_artifact(path)
        self.assertEqual(path.read_bytes(), before)
        self.assertEqual(path.stat().st_mtime, before_mtime)
        self.assertEqual(sorted(p.name for p in self.dir.iterdir()), ["app.db"])

    def test_uri_special_characters_in_path_stay_read_only(self) -> None:
        """A `#` or `?` in the path must not silently drop `mode=ro`.

        SQLite URI filenames treat `#` as a fragment delimiter and `?` as the
        query delimiter, so an unencoded `file:/backups/app#1.db?mode=ro`
        parses as the path `/backups/app` with *no* query -- which means the
        default `rwc` mode, on the wrong file. The tell is not an exception
        (there is none) but a stray database appearing next to the real one,
        so that is what this asserts.
        """
        for name in ("app#1.db", "app 1.db", "app?1.db"):
            with self.subTest(name=name):
                path = self._db(name)
                before = path.read_bytes()
                result = inspect_artifact(path)
                self.assertEqual(result["result"], INTACT)
                self.assertEqual(path.read_bytes(), before)
                # Exact directory contents: the unencoded form created an
                # empty `app` alongside the real file and still reported ok.
                self.assertEqual([p.name for p in self.dir.iterdir()], [name])
                path.unlink()

    def test_the_connection_used_for_checking_cannot_write(self) -> None:
        # Direct evidence that mode=ro survives URI construction, rather than
        # inferring it from the absence of side effects.
        path = self._db("app#1.db")
        connection = sqlite3.connect(f"{path.resolve().as_uri()}?mode=ro", uri=True)
        self.addCleanup(connection.close)
        with self.assertRaises(sqlite3.OperationalError):
            connection.execute("CREATE TABLE injected (a)")


class TextDumpTests(ArtifactFixtureCase):
    def test_complete_postgres_dump(self) -> None:
        body = (
            b"-- PostgreSQL database dump\n"
            + b"INSERT INTO t VALUES (1);\n" * 100
            + b"-- PostgreSQL database dump complete\n"
        )
        result = inspect_artifact(self.write("db.sql", body))
        self.assertEqual(result["result"], INTACT)

    def test_truncated_postgres_dump_is_corrupt(self) -> None:
        body = b"-- PostgreSQL database dump\n" + b"INSERT INTO t VALUES (1);\n" * 100
        result = inspect_artifact(self.write("db.sql", body))
        self.assertEqual(result["result"], CORRUPT)
        self.assertIn("cut short", result["detail"])

    def test_complete_mysql_dump(self) -> None:
        body = b"-- MySQL dump 10.13\nINSERT INTO t VALUES (1);\n-- Dump completed on 2026-08-24\n"
        result = inspect_artifact(self.write("db.sql", body))
        self.assertEqual(result["result"], INTACT)

    def test_complete_postgres_dump_inside_gzip_is_intact(self) -> None:
        body = (
            b"-- PostgreSQL database dump\n"
            + b"INSERT INTO t VALUES (1);\n" * 100
            + b"-- PostgreSQL database dump complete\n"
        )
        result = inspect_artifact(self.write("db.sql.gz", gzip.compress(body)))
        self.assertEqual(result["result"], INTACT)
        self.assertEqual(result["format"], "gzip")

    def test_truncated_postgres_dump_inside_valid_gzip_is_corrupt(self) -> None:
        """The `pg_dump | gzip` case: the gzip wrapper is flawless, the dump is not.

        Without pipefail, gzip sees EOF, writes a valid footer, and exits 0.
        Decompressing the wrapper alone would report this file intact.
        """
        body = b"-- PostgreSQL database dump\n" + b"INSERT INTO t VALUES (1);\n" * 100
        path = self.write("db.sql.gz", gzip.compress(body))
        self.assertEqual(gzip.decompress(path.read_bytes()), body)
        result = inspect_artifact(path)
        self.assertEqual(result["result"], CORRUPT)
        self.assertEqual(result["format"], "gzip")
        self.assertIn("cut short", result["detail"])


class UnsupportedAndEdgeCaseTests(ArtifactFixtureCase):
    def test_empty_file_is_corrupt(self) -> None:
        # Zero bytes is the one size that is never a plausible backup.
        result = inspect_artifact(self.write("empty.tar.gz", b""))
        self.assertEqual(result["result"], CORRUPT)
        self.assertEqual(result["format"], "empty")

    def test_directory_is_unsupported_with_actionable_advice(self) -> None:
        (self.dir / "repo").mkdir()
        result = inspect_artifact(self.dir / "repo")
        self.assertEqual(result["result"], UNSUPPORTED)
        self.assertIn("restic check", result["detail"])

    def test_zstd_is_reported_unsupported_not_guessed(self) -> None:
        result = inspect_artifact(self.write("a.zst", b"\x28\xb5\x2f\xfd" + b"\x00" * 64))
        self.assertEqual(result["result"], UNSUPPORTED)
        self.assertEqual(result["format"], "zstd")

    def test_postgres_custom_dump_is_unsupported_with_advice(self) -> None:
        result = inspect_artifact(self.write("a.dump", b"PGDMP" + b"\x00" * 64))
        self.assertEqual(result["result"], UNSUPPORTED)
        self.assertIn("pg_restore", result["detail"])

    def test_unrecognised_file_is_unsupported_not_corrupt(self) -> None:
        # Absence of a recognised container is not evidence of damage, and
        # calling it corrupt would cry wolf on every plain-text artifact.
        result = inspect_artifact(self.write("notes.txt", b"plain text backup notes\n"))
        self.assertEqual(result["result"], UNSUPPORTED)

    def test_missing_path_is_inconclusive_not_raised(self) -> None:
        result = inspect_artifact(self.dir / "nope.tar.gz")
        self.assertEqual(result["result"], INCONCLUSIVE)

    @unittest.skipIf(os.geteuid() == 0, "root bypasses file permission bits")
    def test_unreadable_file_is_inconclusive_not_corrupt(self) -> None:
        # "I could not open it" and "it is damaged" are different answers, and
        # conflating them would page someone about a permissions bug.
        path = self.write("locked.gz", gzip.compress(PAYLOAD))
        path.chmod(0o000)
        self.addCleanup(path.chmod, 0o644)
        result = inspect_artifact(path)
        self.assertEqual(result["result"], INCONCLUSIVE)


if __name__ == "__main__":
    unittest.main()


class CompressedOpaquePayloadTests(ArtifactFixtureCase):
    """A clean wrapper must not be reported as a clean payload.

    Sibling of the `pg_dump | gzip` case: `gzip app.db` produces a file whose
    gzip CRC is perfect regardless of whether the database inside it is whole.
    Text dumps get a trailer check; a SQLite payload has no equivalent that
    works on a stream, so the honest answer is that it was not checked.
    """

    def _db_bytes(self) -> bytes:
        path = self.dir / "src.db"
        connection = sqlite3.connect(path)
        connection.execute("CREATE TABLE t (a INTEGER, b TEXT)")
        connection.executemany(
            "INSERT INTO t VALUES (?, ?)", [(i, "x" * 200) for i in range(2000)]
        )
        connection.commit()
        connection.close()
        raw = path.read_bytes()
        path.unlink()
        return raw

    def test_gzipped_sqlite_is_not_claimed_intact(self) -> None:
        raw = self._db_bytes()
        result = inspect_artifact(self.write("app.db.gz", gzip.compress(raw)))
        self.assertEqual(result["result"], UNSUPPORTED)
        self.assertIn("SQLite", result["detail"])
        self.assertIn("decompress it and run verify", result["detail"].lower())

    def test_gzipped_truncated_sqlite_is_not_claimed_intact(self) -> None:
        # The failure case: wrapper perfect, payload destroyed. Reporting
        # `intact` here would be the same overclaim the trailer check removed.
        raw = self._db_bytes()
        path = self.write("app.db.gz", gzip.compress(raw[: len(raw) // 2]))
        self.assertTrue(gzip.decompress(path.read_bytes()))  # wrapper is fine
        self.assertNotEqual(inspect_artifact(path)["result"], INTACT)

    def test_gzipped_pg_custom_dump_is_not_claimed_intact(self) -> None:
        result = inspect_artifact(
            self.write("db.dump.gz", gzip.compress(b"PGDMP" + b"\x00" * 4096))
        )
        self.assertEqual(result["result"], UNSUPPORTED)
        self.assertIn("PostgreSQL custom-format", result["detail"])

    def test_gzipped_plain_text_is_still_intact(self) -> None:
        # Control: an unrecognised payload has no checkable structure, so the
        # wrapper genuinely is the whole claim and `intact` stays correct.
        result = inspect_artifact(self.write("notes.txt.gz", gzip.compress(b"log line\n" * 500)))
        self.assertEqual(result["result"], INTACT)

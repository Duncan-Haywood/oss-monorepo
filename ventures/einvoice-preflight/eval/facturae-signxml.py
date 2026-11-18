"""Sign Facturae files with signxml (a second, independent XAdES implementation)
and record signxml's own verdict on each file and on mutants of it, for
eval/facturae-signature-corpus.mjs.

Usage: python facturae-signxml.py <in.xml> <out-dir>   (needs: pip install signxml)

The key and certificate are made fresh at each run (nothing is committed). Writes
<out-dir>/<name>.xml and <out-dir>/verdicts.json: {name: {"signxml": "ok" | error}}.
"""
import datetime, json, os, sys, re
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID
from lxml import etree
from signxml import SignatureMethod, DigestAlgorithm, CanonicalizationMethod
from signxml.xades import XAdESSigner, XAdESVerifier, XAdESSignaturePolicy, XAdESDataObjectFormat, XAdESSignatureConfiguration

POLICY = XAdESSignaturePolicy(
    Identifier="http://www.facturae.es/politica_de_firma_formato_facturae/politica_de_firma_formato_facturae_v3_1.pdf",
    Description="Politica de Firma FacturaE v3.1",
    DigestMethod=DigestAlgorithm.SHA1,
    DigestValue="Ohixl6upD6av8N7pEvDABhEL6hM=",
)

class Sha1TolerantSigner(XAdESSigner):
    """Facturae signers still write RSA-SHA1; signxml refuses it by default."""
    def check_deprecated_methods(self):
        pass

def make_cert(bits, cn, days_from=-30, days_to=365):
    key = rsa.generate_private_key(public_exponent=65537, key_size=bits)
    now = datetime.datetime.now(datetime.timezone.utc)
    issuer = x509.Name([x509.NameAttribute(NameOID.COUNTRY_NAME, "ES"), x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Eval CA, S.L."), x509.NameAttribute(NameOID.COMMON_NAME, "Eval Issuing CA")])
    subject = x509.Name([x509.NameAttribute(NameOID.COUNTRY_NAME, "ES"), x509.NameAttribute(NameOID.SERIAL_NUMBER, "IDCES-00000000T"), x509.NameAttribute(NameOID.COMMON_NAME, cn)])
    cert = (x509.CertificateBuilder().subject_name(subject).issuer_name(issuer).public_key(key.public_key())
            .serial_number(x509.random_serial_number()).not_valid_before(now + datetime.timedelta(days=days_from))
            .not_valid_after(now + datetime.timedelta(days=days_to)).sign(key, hashes.SHA256()))
    return key, cert

def main(src, out):
    os.makedirs(out, exist_ok=True)
    base = open(src, "rb").read()
    key2048, cert2048 = make_cert(2048, "EVAL SIGNER A")
    key3072, cert3072 = make_cert(3072, "EVAL SIGNER B")
    other_key, other_cert = make_cert(2048, "EVAL SIGNER C")
    verdicts = {}
    combos = []
    for sm, dg in [(SignatureMethod.RSA_SHA1, DigestAlgorithm.SHA1), (SignatureMethod.RSA_SHA256, DigestAlgorithm.SHA256),
                   (SignatureMethod.RSA_SHA512, DigestAlgorithm.SHA512), (SignatureMethod.RSA_SHA384, DigestAlgorithm.SHA384),
                   (SignatureMethod.RSA_SHA256, DigestAlgorithm.SHA512)]:
        for c14n in [CanonicalizationMethod.CANONICAL_XML_1_0, CanonicalizationMethod.CANONICAL_XML_1_1, CanonicalizationMethod.EXCLUSIVE_XML_CANONICALIZATION_1_0]:
            for bits in (2048, 3072):
                combos.append((sm, dg, c14n, bits))
    def verify(data, cert):
        try:
            cfg = XAdESSignatureConfiguration(require_x509=True, expect_references=3,
                signature_methods=frozenset(SignatureMethod), digest_algorithms=frozenset(DigestAlgorithm))
            XAdESVerifier().verify(data, x509_cert=cert.public_bytes(serialization.Encoding.PEM).decode(), expect_signature_policy=POLICY, expect_config=cfg)
            return "ok"
        except Exception as e:  # noqa: BLE001 -- the verdict is the point
            return f"{type(e).__name__}: {str(e)[:160]}"
    for i, (sm, dg, c14n, bits) in enumerate(combos):
        key, cert = (key2048, cert2048) if bits == 2048 else (key3072, cert3072)
        signer = Sha1TolerantSigner(signature_policy=POLICY, claimed_roles=["emisor"],
                             data_object_format=XAdESDataObjectFormat(Description="Factura electronica", MimeType="text/xml"),
                             signature_algorithm=sm, digest_algorithm=dg, c14n_algorithm=c14n)
        doc = etree.fromstring(base)
        signed = signer.sign(doc, key=key, cert=[cert.public_bytes(serialization.Encoding.PEM).decode()])
        data = etree.tostring(signed, xml_declaration=True, encoding="UTF-8")
        name = f"s{i:02d}-{sm.name}-{dg.name}-{c14n.name}-{bits}".lower()
        files = {name: data}
        # Mutants: edit an amount, edit SigningTime, flip the SignatureValue, swap the certificate, re-indent.
        files[name + "~amount"] = data.replace(b"<TotalAmount>1060.00</TotalAmount>", b"<TotalAmount>1060.01</TotalAmount>", 1)
        files[name + "~time"] = re.sub(rb"(<xades:SigningTime>)(\d{4})", lambda m: m.group(1) + str(int(m.group(2)) - 1).encode(), data, count=1)
        sv = re.search(rb"(<ds:SignatureValue[^>]*>)([A-Za-z0-9+/=\s]+)<", data)
        val = bytearray(sv.group(2)); j = next(k for k, ch in enumerate(val) if chr(ch).isalnum()); val[j] = ord("B") if val[j] != ord("B") else ord("C")
        files[name + "~sigvalue"] = data[:sv.start(2)] + bytes(val) + data[sv.end(2):]
        der_old = cert.public_bytes(serialization.Encoding.DER); der_new = other_cert.public_bytes(serialization.Encoding.DER)
        import base64
        b_old = base64.b64encode(der_old); b_new = base64.b64encode(der_new)
        stripped = re.sub(rb"\s+", b"", data[data.find(b"<ds:X509Certificate>"):data.find(b"</ds:X509Certificate>")])
        if stripped.endswith(b_old) or b_old in stripped:
            cstart = data.find(b"<ds:X509Certificate>") + len(b"<ds:X509Certificate>"); cend = data.find(b"</ds:X509Certificate>")
            files[name + "~cert"] = data[:cstart] + b_new + data[cend:]
        files[name + "~indent"] = data.replace(b"<FileHeader>", b"<FileHeader>\n    ", 1)
        for n, d in files.items():
            open(os.path.join(out, n + ".xml"), "wb").write(d)
            verdicts[n] = {"signxml": verify(d, cert)}
    json.dump(verdicts, open(os.path.join(out, "verdicts.json"), "w"), indent=1)
    print(f"{len(verdicts)} files written to {out}")

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])

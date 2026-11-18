(: PEPPOL-COMMON-R056-2 as Saxon evaluates it, over the files
   nl-vat-r056-2-differential.mjs --saxon-dir DIR writes. Each file's name ends
   in the JavaScript oracle's verdict (-warn or -ok); this prints one line per
   file whose Saxon verdict differs, then a count. Contexts and test copied
   from plain/peppol-ubl.json and plain/peppol-cii.json (BIS 3.0.22).
     java -cp Saxon-HE-12.5.jar net.sf.saxon.Query -qs:... dir=DIR  (see the eval note) :)
declare namespace cac = "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2";
declare namespace cbc = "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2";
declare namespace ram = "urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100";
declare variable $dir external;
let $results :=
  for $syntax in ("ubl", "cii")
  for $doc in collection(concat($dir, "/", $syntax, "?select=*.xml"))
  let $nodes := if ($syntax = "ubl")
    then $doc//cac:PartyTaxScheme[normalize-space(cac:TaxScheme/cbc:ID) = 'VAT']/cbc:CompanyID[starts-with(normalize-space(.), 'NL')]
    else $doc//ram:SpecifiedTaxRegistration[ram:ID/@schemeID = 'VA'][starts-with(normalize-space(.), 'NL')]
  let $warns := some $n in $nodes satisfies not(matches(normalize-space($n), '^NL[0-9]{9}B[0-9]{2}$'))
  let $name := tokenize(base-uri($doc), "/")[last()]
  return if ($warns = ends-with($name, "-warn.xml")) then "same" else concat($syntax, "/", $name, " saxon=", $warns)
return string-join((
  $results[. != "same"],
  concat("files: ", count($results), ", differ from the JavaScript oracle: ", count($results[. != "same"]))
), "&#10;")

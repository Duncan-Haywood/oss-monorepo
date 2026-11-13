// node eval/scan-read-by-eye/build-hymns.mjs
// Writes corpus/pange-lingua-full.gabc and corpus/veni-creator-full.gabc: every verse
// of the two hymns, each set to the first verse's neumes, which corpus/pange-lingua.gabc
// and corpus/veni-creator.gabc carry and which were read note by note against the 1908
// page scans (eval/scan-read-by-eye/README.md).
//
// The verse texts are as printed in the Graduale Romanum, Vatican edition, 1908
// (public domain): Pange lingua on p. 123*, Veni Creator on pp. 121*-122* (the first
// text, not the "secundum usum recentiorem" one printed beneath it). Each was read from
// the archive.org scan and checked against archive.org's OCR of the same pages.
// Syllables are split by hand; "|" separates syllables, a space separates words.
// The page prints no music for the closing Amen, so none is written here.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const corpus = join(here, '..', '..', 'corpus');

// Neumes per syllable of verse 1, in order, copied from the checked corpus files.
// Each line of the hymn ends with the bar given in `bars`.
export const HYMNS = {
  'pange-lingua': {
    header: 'name:Pange lingua (all six verses);\noffice-part:Hymnus;\nmode:3;\nbook:Graduale Romanum, Vatican edition, 1908, p. 123* (In festo Corporis Christi, ad processionem);\ntranscriber:verse 1 neumes from GregoBase 3855 (Andrew Hinkley, CC0), read against the 1908 scan; verses 2-6 set to the same neumes by chant-forge, text from the 1908 page;\n%%\n',
    clef: '(c4)',
    lineLengths: [8, 7, 8, 7, 8, 7],
    bars: ['(,)', '(:)', '(,)', '(:)', '(,)', '(::)'],
    neumes: ['e', 'e', 'f', 'ed', 'g', 'g', 'hj', 'j', 'jk', 'j', 'j', 'i', 'h', 'j', 'ivHG',
      'g', 'h', 'j', 'i', 'h', 'g', 'h', 'g', 'h', 'i', 'g', 'g', 'e', 'h', 'hd',
      'e', 'g', 'g', 'e', 'g', 'h', 'h', 'g', 'h', 'i', 'g', 'hg', 'fe', 'd', 'e'],
    verses: [
      'Pan|ge lin|gua glo|ri|ó|si / Cór|po|ris mys|té|ri|um, / San|gui|nís|que pre|ti|ó|si, / Quem in mun|di pré|ti|um / Fruc|tus ven|tris ge|ne|ró|si / Rex ef|fú|dit gén|ti|um.',
      'No|bis da|tus, no|bis na|tus / Ex in|tác|ta Vír|gi|ne, / Et in mun|do con|ver|sá|tus, / Spar|so ver|bi sé|mi|ne, / Su|i mo|ras in|co|lá|tus / Mi|ro clau|sit ór|di|ne.',
      'In su|pré|mae noc|te coe|nae / Re|cúm|bens cum frá|tri|bus, / Ob|ser|vá|ta le|ge ple|ne / Ci|bis in le|gá|li|bus, / Ci|bum tur|bae du|o|dé|nae / Se dat su|is má|ni|bus.',
      'Ver|bum ca|ro, pa|nem ve|rum / Ver|bo car|nem éf|fi|cit: / Fit|que san|guis Chris|ti me|rum, / Et si sen|sus dé|fi|cit, / Ad fir|mán|dum cor sin|cé|rum / So|la fi|des súf|fi|cit.',
      'Tan|tum er|go Sa|cra|mén|tum / Ve|ne|ré|mur cér|nu|i: / Et an|tí|quum do|cu|mén|tum / No|vo ce|dat rí|tu|i: / Prae|stet fi|des sup|ple|mén|tum / Sén|su|um de|féc|tu|i.',
      'Ge|ni|tó|ri, Ge|ni|tó|que / Laus et ju|bi|lá|ti|o, / Sa|lus, ho|nor, vir|tus quo|que / Sit et be|ne|díc|ti|o: / Pro|ce|dén|ti ab u|tró|que / Com|par sit lau|dá|ti|o.',
    ],
  },
  'veni-creator': {
    header: 'name:Veni Creator Spiritus (all seven verses);\noffice-part:Hymnus;\nmode:8;\nbook:Graduale Romanum, Vatican edition, 1908, pp. 121*-122* (Invocatio Sancti Spiritus);\ntranscriber:verse 1 neumes from GregoBase 3431 (Andrew Hinkley, CC0), read against the 1908 scan; verses 2-7 set to the same neumes by chant-forge, text from the 1908 pages;\n%%\n',
    clef: '(c3)',
    lineLengths: [8, 8, 8, 8],
    bars: ['(;)', '(:)', '(;)', '(::)'],
    neumes: ['e', 'f', 'ed', 'e', 'fe', 'h', 'i', 'h', 'h', 'e', 'f', 'h', 'ih', 'i', 'j', 'i',
      'h', 'ij', 'hg', 'fe', 'hi', 'e', 'f', 'h', 'gh', 'f', 'ed', 'f', 'fgf', 'e', 'd', 'e'],
    verses: [
      'Ve|ni Cre|á|tor Spí|ri|tus, / Men|tes tu|ó|rum ví|si|ta: / Im|ple su|pér|na grá|ti|a / Quae tu cre|á|sti péc|to|ra.',
      'Qui Pa|rá|cli|tus dí|ce|ris, / Do|num De|i al|tís|si|mi, / Fons vi|vus, ig|nis, cá|ri|tas, / Et spi|ri|tá|lis únc|ti|o.',
      'Tu sep|ti|fór|mis mú|ne|re, / Dex|trae De|i tu dí|gi|tus, / Tu ri|te pro|mís|sum Pa|tris, / Ser|mó|ne di|tans gút|tu|ra.',
      // "Infúnde amórem": the 1908 page prints the final e of Infúnde in italics (elided),
      // so "de a" is one syllable; Gregorio's <e> tag marks the elided vowel.
      'Ac|cén|de lu|men sén|si|bus, / In|fún|d<e>e</e>a|mó|rem cór|di|bus, / In|fír|ma nos|tri cór|po|ris / Vir|tú|te fir|mans pér|pe|ti.',
      'Hos|tem re|pél|las lón|gi|us, / Pa|cém|que do|nes pró|ti|nus: / Duc|tó|re sic te prae|vi|o / Vi|té|mus om|ne nó|xi|um.',
      'Per te sci|á|mus da Pa|trem, / Nos|cá|mus at|que Fí|li|um, / Te u|tri|ús|que Spí|ri|tum / Cre|dá|mus om|ni tém|po|re.',
      'Sit laus Pa|tri cum Fí|li|o, / Sanc|to si|mul Pa|rá|cli|to, / No|bís|que mit|tat Fí|li|us / Cha|rís|ma Sanc|ti Spí|ri|tus.',
    ],
  },
};

// Split one verse into lines of syllables. Returns [[{text, wordEnd}]].
export function syllables(verse) {
  return verse.split(' / ').map((line) => {
    const out = [];
    for (const word of line.split(' ')) {
      const parts = word.split('|');
      parts.forEach((p, i) => out.push({ text: p, wordEnd: i === parts.length - 1 }));
    }
    return out;
  });
}

export function buildHymn(h) {
  if (h.neumes.length !== h.lineLengths.reduce((a, b) => a + b, 0)) throw new Error('neume count does not match line lengths');
  const verses = h.verses.map((v, vi) => {
    const lines = syllables(v);
    if (lines.length !== h.lineLengths.length) throw new Error(`verse ${vi + 1}: ${lines.length} lines`);
    let k = 0, out = '';
    lines.forEach((line, li) => {
      if (line.length !== h.lineLengths[li]) throw new Error(`verse ${vi + 1} line ${li + 1}: ${line.length} syllables, want ${h.lineLengths[li]}`);
      for (const s of line) out += `${s.text}(${h.neumes[k++]})${s.wordEnd ? ' ' : ''}`;
      out += h.bars[li] + (li === lines.length - 1 ? '' : ' ');
    });
    return out.trim();
  });
  return h.header + h.clef + ' ' + verses.join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const [slug, h] of Object.entries(HYMNS)) {
    const text = buildHymn(h) + '\n';
    writeFileSync(join(corpus, `${slug}-full.gabc`), text);
    console.log(`wrote corpus/${slug}-full.gabc (${h.verses.length} verses)`);
  }
}

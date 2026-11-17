// The parts K, N, T, U, V, W and X of eval/coda-check.mjs (their BPM, pitches and syllables), shared by
// eval/vstop-diag.mjs and eval/place-sweep.mjs.
export const PARTS = {
  K: { bpm: 104, pitches: [47, 53, 57, 59, 62], all: ['fons', 'dens', 'pons', 'mons', 'gens', 'hinc', 'runt', 'bunt', 'tent', 'cant', 'frons', 'sanct', 'lunt', 'quent', 'ep', 'ip', 'op', 'ec', 'ic', 'oc', 'eb', 'ib', 'ob', 'ef', 'of', 'ot', 'ux', 'ix', 'ox', 'im', 'om', 'on', 'in', 'e', 'i', 'u'] },
  T: { bpm: 118, pitches: [47, 54, 59, 62, 63, 64], all: ['lub', 'tag', 'pob', 'sug', 'cad', 'mub', 'fod', 'rib', 'vob', 'tid', 'hag', 'peg', 'fun', 'ram', 'lim', 'ben', 'lut', 'mic', 'hep', 'gos', 'rax', 'lunc', 'hel', 'fa'] },
  U: { bpm: 110, pitches: [45, 50, 56, 58, 61, 63], all: ['dag', 'bob', 'mod', 'sig', 'lag', 'tib', 'ceb', 'nud', 'hod', 'fig', 'gub', 'pid', 'bam', 'sun', 'tem', 'hon', 'dent', 'hens', 'sonc', 'tint', 'dut', 'sic', 'gep', 'bos', 'lex', 'bel', 'mo', 'vit'] },
  V: { bpm: 114, pitches: [43, 53, 55, 57, 59, 62], all: ['dog', 'bag', 'tog', 'gig', 'vag', 'nig', 'sog', 'leg', 'hug', 'cag', 'dac', 'roc', 'puc', 'nac', 'tuc', 'lic', 'gob', 'dab', 'rub', 'lap', 'rup', 'sep', 'fip', 'mop', 'dap', 'nid', 'led', 'sud', 'rad', 'tod', 'gum', 'ron', 'lis', 'tas', 'mu'] },
  N: { bpm: 108, pitches: [42, 49, 54, 58, 63, 64], all: ['dant', 'lent', 'sint', 'gunt', 'hunc', 'rens', 'tens', 'fans', 'font', 'vint', 'nab', 'ped', 'lud', 'gab', 'rud', 'tob', 'vig', 'cod', 'pet', 'lac', 'sup', 'rot', 'tac', 'dum', 'ven', 'nam', 'pes', 'vos', 'ma', 'ne'] },
  W: { bpm: 122, pitches: [45, 52, 56, 58, 59, 61], all: ['tep', 'cap', 'nup', 'bip', 'hop', 'vep', 'lop', 'gap', 'rip', 'hup', 'tic', 'mac', 'sec', 'voc', 'ric', 'hac', 'buc', 'nec', 'pab', 'teb', 'nog', 'tig', 'rug', 'dob', 'mug', 'fed', 'nut', 'hos', 'pum', 'fu'] },
  X: { bpm: 106, pitches: [46, 55, 61, 62, 63, 64], all: ['lob', 'fub', 'nib', 'peb', 'fab', 'cub', 'fag', 'cog', 'bug', 'hud', 'rid', 'mud', 'fen', 'gim', 'lan', 'tum', 'lens', 'sunc', 'fant', 'gonc', 'rins', 'nep', 'ruc', 'sol', 'fos'] },
};

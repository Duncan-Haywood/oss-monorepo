"""Score GSS respondents' unasked items with a local open-weights chat model (no paid API).

One prompt prefix per respondent (system text + a background profile built only from demographic
and affiliation variables), then one short question suffix per item, scored in a single batch that
reuses the prefix's key/value cache. P(yes) = softmax over the next-token logits of "Yes" and "No".
"""
import math

try:  # the profile text needs neither; tests run without them
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer
except ImportError:  # pragma: no cover
    torch = None

SYSTEM = ('You predict how a respondent to the US General Social Survey answered a question, '
          'from a short description of the respondent. Reply with Yes or No only.')

# Questions, phrased so that "Yes" is the coded answer (src/gss.py TARGETS / CATHOLIC_ONLY).
QUESTIONS = {
    'attend_weekly':   'Does this person attend religious services every week or more often?',
    'pray_daily':      'Does this person pray at least once a day?',
    'god_no_doubt':    'Does this person say they know God really exists and have no doubts about it?',
    'afterlife':       'Does this person believe there is a life after death?',
    'premarsx_wrong':  'If a man and a woman have sex relations before marriage, does this person think it is always wrong?',
    'xmarsex_wrong':   'Does this person think a married person having sexual relations with someone other than the marriage partner is always wrong?',
    'homosex_wrong':   'Does this person think sexual relations between two adults of the same sex are always wrong?',
    'samesex_marr_no': 'Does this person disagree that homosexual couples should have the right to marry one another?',
    'cohab_not_ok':    'Does this person disagree that it is all right for a couple to live together without intending to get married?',
    'abortion_no':     'Does this person think a pregnant woman should NOT be able to obtain a legal abortion if she wants it for any reason?',
    'divorce_harder':  'Does this person think divorce in this country should be more difficult to obtain than it is now?',
    'pope_infallible': 'Does this person think it is true that the Pope is infallible on matters of faith and morals?',
}

REGION = {1: 'the Northeast', 2: 'the Midwest', 3: 'the South', 4: 'the West'}
RACE = {1: 'White', 2: 'Black', 3: 'of another race'}
POL = {1: 'extremely liberal', 2: 'liberal', 3: 'slightly liberal', 4: 'moderate', 5: 'slightly conservative',
       6: 'conservative', 7: 'extremely conservative'}
PARTY = {0: 'a strong Democrat', 1: 'a not very strong Democrat', 2: 'an independent close to the Democrats',
         3: 'an independent', 4: 'an independent close to the Republicans', 5: 'a not very strong Republican',
         6: 'a strong Republican', 7: 'a supporter of another party'}
MARITAL = {1: 'married', 2: 'widowed', 3: 'divorced', 4: 'separated', 5: 'never married'}
RELITEN = {1: 'a strong', 2: 'a not very strong', 3: 'a somewhat strong'}
GEN = {1: 'Born outside the United States.', 2: 'Born in the United States, with at least one parent born abroad.',
       3: 'Born in the United States to US-born parents.'}


def _ok(x):
    return x is not None and not (isinstance(x, float) and math.isnan(x))


def profile(r):
    """Plain-English background from the demographic variables the tabular demographic model sees
    (no religion or morality item answers)."""
    s = [f'Interviewed in {int(r.year)}.']
    who = 'woman' if r.female == 1 else 'man' if r.female == 0 else 'person'
    s.append(f'A {int(r.age)}-year-old {who}.' if _ok(r.age) else f'A {who} of unknown age.')
    eth = RACE.get(r.race, '') if _ok(r.race) else ''
    if _ok(r.hispanic_any):
        eth = (eth + ', ' if eth else '') + ('Hispanic' if r.hispanic_any == 1 else 'not Hispanic')
    if eth:
        s.append(eth[0].upper() + eth[1:] + '.')
    if _ok(r.generation):
        s.append(GEN[int(r.generation)])
    if _ok(r.region):
        s.append(f'Lives in {REGION[int(r.region)]}.')
    if _ok(r.educ):
        s.append(f'{int(r.educ)} years of schooling.')
    fam = []
    if _ok(r.marital):
        fam.append(MARITAL[int(r.marital)].capitalize())
    if _ok(r.childs):
        c = int(r.childs)
        fam.append('no children' if c == 0 else '1 child' if c == 1 else f'{c} or more children' if c == 8 else f'{c} children')
    if fam:
        s.append(', '.join(fam) + '.')
    if _ok(r.realinc):
        s.append(f'Family income about ${int(round(r.realinc, -3)):,} a year in 1986 dollars.')
    pol = []
    if _ok(r.polviews):
        pol.append(f'politically {POL[int(r.polviews)]}')
    if _ok(r.partyid):
        pol.append(PARTY[int(r.partyid)])
    if pol:
        s.append('Describes self as ' + ' and '.join(pol) + '.')
    rel = f'Religion: {r.tradition}'
    if _ok(r.reliten) and int(r.reliten) in RELITEN:
        rel += f', {RELITEN[int(r.reliten)]} affiliation'
    s.append(rel + '.')
    if _ok(r.raised_catholic):
        s.append('Raised Catholic.' if r.raised_catholic == 1 else 'Not raised Catholic.')
    return ' '.join(s)


class Scorer:
    def __init__(self, model_dir, threads=4, dtype=None):
        dtype = dtype or torch.bfloat16
        torch.set_num_threads(threads)
        self.tok = AutoTokenizer.from_pretrained(model_dir)
        self.m = AutoModelForCausalLM.from_pretrained(model_dir, dtype=dtype).eval()
        self.yes = self.tok.encode('Yes', add_special_tokens=False)
        self.no = self.tok.encode('No', add_special_tokens=False)
        assert len(self.yes) == 1 and len(self.no) == 1
        full = self.tok.apply_chat_template(
            [{'role': 'system', 'content': SYSTEM}, {'role': 'user', 'content': 'Respondent: @@P\n\n@@Q'}],
            tokenize=False, add_generation_prompt=True)
        self.head, rest = full.split('@@P')
        self.mid, self.tail = rest.split('@@Q')

    def prefix_ids(self, prof):
        return self.tok(self.head + prof + self.mid, add_special_tokens=False).input_ids

    def suffix_ids(self, item):
        return self.tok('Question: ' + QUESTIONS[item] + '\nAnswer Yes or No.' + self.tail,
                        add_special_tokens=False).input_ids

    def score(self, prof, items):
        """P(yes) for each item for one respondent. Prefix runs once; suffixes run as one batch."""
        with torch.inference_mode():
            return self._score(prof, items)

    def _score(self, prof, items):
        pre = torch.tensor([self.prefix_ids(prof)])
        out = self.m(pre, use_cache=True)
        cache = out.past_key_values
        suf = [self.suffix_ids(j) for j in items]
        L = max(len(x) for x in suf)
        pad = self.tok.pad_token_id or 0
        ids = torch.tensor([x + [pad] * (L - len(x)) for x in suf])
        B, P = len(items), pre.shape[1]
        cache.batch_repeat_interleave(B)
        att = torch.cat([torch.ones(B, P, dtype=torch.long),
                         torch.tensor([[1] * len(x) + [0] * (L - len(x)) for x in suf])], 1)
        pos = torch.arange(P, P + L).unsqueeze(0).expand(B, L)
        lg = self.m(ids, past_key_values=cache, attention_mask=att, position_ids=pos).logits
        last = torch.tensor([len(x) - 1 for x in suf])
        z = lg[torch.arange(B), last].float()
        d = z[:, self.yes[0]] - z[:, self.no[0]]
        return torch.sigmoid(d).tolist()

    def score_plain(self, prof, item):
        """Reference path: the same token ids in one unbatched pass, no cache (checks the batched path)."""
        with torch.inference_mode():
            return self._score_plain(prof, item)

    def _score_plain(self, prof, item):
        ids = torch.tensor([self.prefix_ids(prof) + self.suffix_ids(item)])
        z = self.m(ids).logits[0, -1].float()
        return float(torch.sigmoid(z[self.yes[0]] - z[self.no[0]]))

"""The evidence ledger: hypotheses, priors and likelihood-ratio ranges, with sources.

Every number here is one of three kinds, and each entry says which (`basis`):

* "published"  a figure a named author published (cited at the point of use);
* "argued"     an endpoint a named author argued for in words (e.g. "the fine-tuning
               evidence gives no confirmation" is log10 LR = 0), turned into a number
               by us;
* "sweep"      no published figure exists, so we sweep a plausible range and report
               whether conclusions survive (research/CLAUDE.md, "Run the numbers").

log10 likelihood ratios are relative to naturalism (N) unless the item says otherwise.
An item applies the same ratio to every hypothesis in `favours`; the hypotheses outside
`favours` keep likelihood 1.  That is an assumption (e.g. that fine-tuning is as likely
under non-Christian theism as under Christianity), stated so it can be attacked.
"""

HYPOTHESES = ["N", "T_other", "C_catholic", "C_orthodox", "C_other"]
LABELS = {
    "N": "naturalism / atheism",
    "T_other": "theism, not Christian",
    "C_catholic": "Christianity, Catholic",
    "C_orthodox": "Christianity, Eastern Orthodox",
    "C_other": "Christianity, other (Protestant, Oriental Orthodox, ...)",
}
THEISM = ["T_other", "C_catholic", "C_orthodox", "C_other"]
CHRISTIAN = ["C_catholic", "C_orthodox", "C_other"]

# Prior structure: P(theism), P(Christian | theism), and shares within Christianity.
PRIOR_DEFAULT = {"theism": 0.5, "christian_given_theism": 0.5,
                 "within": {"C_catholic": 0.501, "C_orthodox": 0.12, "C_other": 0.379}}
PRIOR_SOURCES = {
    "theism": "0.5: S. D. Unwin, The Probability of God (2003), 'maximum ignorance' start; swept 0.01-0.99",
    "christian_given_theism": "0.5: sweep (no defensible published figure); swept 0.01-0.99",
    "within": ("Shares of the world's Christians, Pew Research Center, Global Christianity (19 Dec 2011): "
               "Catholic 50.1%, Orthodox 12%, Protestant 36.7% + other 1% "
               "https://www.pewresearch.org/religion/2011/12/19/global-christianity-traditions/ ; "
               "a head-count prior, not an argument; 'equal' shares are the alternative"),
}

ITEMS = [
    # ------------------------------------------------ theism vs naturalism
    dict(id="goodness", level="theism", favours=THEISM, lo=-0.30, hi=1.00, basis="published",
         what="Human recognition of moral goodness",
         sources="hi: Unwin (2003) D=10; lo: Shermer, 'God's Number Is Up', Scientific American (July 2004) D=0.5"),
    dict(id="moral_evil", level="theism", favours=THEISM, lo=-1.00, hi=-0.30, basis="published",
         what="The existence of moral evil",
         sources="hi: Unwin (2003) D=0.5; lo: Shermer (2004) D=0.1"),
    dict(id="natural_evil", level="theism", favours=THEISM, lo=-2.00, hi=-1.00, basis="sweep",
         what="Natural evil; the distribution of pain and pleasure",
         sources="hi: Unwin (2003) D=0.1 (published); lo: sweep for P. Draper, Pain and Pleasure, Nous 23 (1989) doi:10.2307/2215486, who argues the data are 'many times' likelier under indifference"),
    dict(id="prayer", level="theism", favours=THEISM, lo=0.00, hi=0.30, basis="published",
         what="Intranatural miracles (answered prayer)",
         sources="hi: Unwin (2003) D=2; lo: STEP trial, Benson et al., Am Heart J 151 (2006) 934-942 doi:10.1016/j.ahj.2005.05.028 (no effect of intercessory prayer, RR 1.02) read as LR 1"),
    dict(id="experience", level="theism", favours=THEISM, lo=0.00, hi=0.30, basis="argued",
         what="Religious experience",
         sources="hi: Unwin (2003) D=2; lo: LR 1 for the view that such experiences have a sufficient naturalistic explanation"),
    dict(id="fine_tuning", level="theism", favours=THEISM, lo=0.00, hi=3.00, basis="sweep",
         what="Fine-tuning of physical constants for life",
         sources="lo: E. Sober, The Design Argument (Blackwell Guide to the Philosophy of Religion, 2005): observation selection effect makes it no evidence; hi: sweep for R. Collins (Blackwell Companion to Natural Theology, 2009), who argues for a very large ratio"),
    dict(id="hiddenness", level="theism", favours=THEISM, lo=-1.00, hi=0.00, basis="sweep",
         what="Non-resistant non-belief (divine hiddenness)",
         sources="lo: sweep for J. L. Schellenberg, Divine Hiddenness and Human Reason (1993); hi: LR 1 for theodicies of hiddenness"),
    # ------------------------------------------------ Christianity vs the rest
    dict(id="resurrection", level="christian", favours=CHRISTIAN, lo=0.00, hi=44.0, basis="argued",
         what="The testimony to Jesus's resurrection (empty tomb, appearances, Paul, the disciples' transformation)",
         sources="hi: T. & L. McGrew, The Argument from Miracles, Blackwell Companion to Natural Theology (2009) pp. 593-662, a combined Bayes factor reported as of order 10^44 (secondary report; exact figure to be checked against the chapter); lo: LR 1 for the Humean reading that legend and visions explain the record"),
    # ------------------------------------------------ Catholic vs Orthodox (and everyone else)
    # No published likelihood ratios exist for these.  Each range is symmetric about 0
    # on purpose: they are placeholders for a structured elicitation from scholars of
    # both traditions (PROPOSAL.md, milestone M3), not our judgement of the evidence.
    dict(id="roman_primacy_early", level="church", favours=["C_catholic"], lo=-1.00, hi=1.00, basis="sweep",
         what="Early testimony to the Roman church's precedence: 1 Clement (c. 96), Ignatius, Romans preface ('presides in love'), Irenaeus, Against Heresies 3.3.2",
         sources="Primary texts at https://www.newadvent.org/fathers/0103303.htm ; the Orthodox reading (a primacy of honour) is the reason the low end is 1, not less"),
    dict(id="canon28", level="church", favours=["C_catholic"], lo=-1.00, hi=1.00, basis="sweep",
         what="Chalcedon canon 28 (451) grounds Rome's rank in its being the imperial city and gives Constantinople equal privileges; Leo I rejected it",
         sources="https://www.newadvent.org/fathers/3811.htm ; Siecienski, The Papacy and the Orthodox (OUP 2017)"),
    dict(id="honorius", level="church", favours=["C_catholic"], lo=-1.00, hi=1.00, basis="sweep",
         what="Constantinople III (681), accepted by both churches, anathematised Pope Honorius",
         sources="Constantinople III, session 13; Catholic reply: the letter was not ex cathedra (see experiments/e1_arguments, 'honorius' crux)"),
    dict(id="filioque", level="church", favours=["C_catholic"], lo=-1.00, hi=1.00, basis="sweep",
         what="The Creed of 381 lacks the Filioque; added in the West (Toledo 589, Rome c. 1014); Latin fathers (Augustine) taught procession from the Son",
         sources="A. E. Siecienski, The Filioque: History of a Doctrinal Controversy (OUP 2010)"),
    dict(id="development", level="church", favours=["C_catholic"], lo=-0.50, hi=0.50, basis="sweep",
         what="Whether later doctrines (papal infallibility 1870, Marian dogmas) are faithful development or innovation",
         sources="J. H. Newman, An Essay on the Development of Christian Doctrine (1845) vs the Orthodox appeal to the seven councils"),
]

# Published bottom lines this ledger should be able to reproduce or bracket.
PUBLISHED_POSTERIORS = [
    dict(who="S. D. Unwin, The Probability of God (2003)", claim="P(God) = 0.67",
         reproduce={"prior": 0.5, "D": [10, 0.5, 0.1, 2, 1, 2]},
         note="Goodness 10, moral evil 0.5, natural evil 0.1, intranatural miracles 2 are confirmed by reviews; "
              "the last two (extranatural miracles, religious experience) are taken as 1 and 2, the values whose "
              "product (2) the reported 67% requires."),
    dict(who="M. Shermer, Scientific American (July 2004), using Unwin's method", claim="P(God) = 0.02",
         reproduce={"prior": 0.5, "D": [0.5, 0.1, 0.1, 1, 0.5, 0.1]},
         note="Six D values transcribed from https://michaelshermer.com/sciam-columns/gods-number-is-up/ "
              "(goodness 0.5, moral evil 0.1, natural evil 0.1, intranatural miracles 1, extranatural miracles 0.5, "
              "religious experience 0.1). Their product is 2.5e-4, so Unwin's own formula gives 0.025%, not the "
              "'2 percent' the column states: the published bottom line does not follow from its published inputs (E6)."),
    dict(who="R. Swinburne, The Resurrection of God Incarnate (OUP 2003)", claim="P(God incarnate and risen) ~ 0.97",
         reproduce=None, note="NDPR review https://ndpr.nd.edu/news/the-resurrection-of-god-incarnate/"),
]

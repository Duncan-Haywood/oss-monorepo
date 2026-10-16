import corpus_dupes as cd
import duplicate_check as dc


def items(*pairs):
    return [dc.Item("venture", label, text) for label, text in pairs]


def test_reworded_pair_outscores_unrelated():
    its = items(
        ("a", "sealcoating bid estimator for driveway contractors pricing square footage"),
        ("b", "driveway sealcoating contractors bid estimator pricing by square footage"),
        ("c", "beekeeper hive inventory tracker for honey harvest records"),
        ("d", "invoice reminder emailer for freelance designers"),
    )
    found = cd.pairs(its, cd.vectors(its), 0.3)
    assert found and (found[0][1], found[0][2]) == ("a", "b")
    assert all("c" not in (x[1], x[2]) for x in found)


def test_clusters_merge_transitively():
    groups = cd.clusters([(0.9, "a", "b"), (0.8, "b", "c"), (0.7, "x", "y")])
    assert groups == [["a", "b", "c"], ["x", "y"]]


def test_real_corpus_runs():
    ventures = [i for i in dc.load_ventures() if i.source == "venture"]
    assert len(ventures) > 100
    found = cd.pairs(ventures, cd.vectors(ventures), 0.99)
    assert all(s <= 1.0001 for s, _, _ in found)

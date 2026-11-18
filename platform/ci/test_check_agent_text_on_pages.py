import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import check_agent_text_on_pages as c


def test_flags_agent_process_text():
    html = ("Jobber's own site is not\n  reachable from this session to confirm. "
            "Not repeated here, since this session cannot verify today's figures. "
            "Requests to wisk.ai are blocked from this session. The AEAT's server refused this session.")
    assert len(c.agent_text(html)) == 4


def test_the_users_own_session_is_fine():
    html = ("Net profit this session. Every mile the car moved this session. "
            "This page does not track today's plan names. Add the sandbox settings.")
    assert c.agent_text(html) == []


def test_repository_pages_are_clean():
    assert c.main([]) == 0

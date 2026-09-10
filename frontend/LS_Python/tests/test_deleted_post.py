"""
Offline checks for DELETED-POST detection.

A running view/reaction task must notice when its post is deleted, CONFIRM it
before acting on that verdict, then stop quietly (no crash, nothing counted,
no retry) — and it must NEVER treat a post that still exists as deleted.

Pyrogram + pytgcalls are NOT installed here (they only live on the VPS), so the
telegram libs are stubbed. Run with:  python -m tests.test_deleted_post
"""

from __future__ import annotations

import asyncio
import sys
import types
from unittest.mock import MagicMock


# --- stub the telegram libraries so agent.userbot can be imported ------------
class _AnyModule(types.ModuleType):
    def __getattr__(self, name):
        if name.startswith("__"):
            raise AttributeError(name)
        sub = _AnyModule(f"{self.__name__}.{name}")
        setattr(self, name, sub)
        return sub


class _Finder:
    PREFIXES = ("pyrogram", "pytgcalls", "ntgcalls", "tgcrypto", "psycopg", "psycopg_pool", "dotenv")

    def find_module(self, fullname, path=None):
        return self if fullname.split(".")[0] in self.PREFIXES else None

    def load_module(self, fullname):
        mod = _AnyModule(fullname)
        mod.__path__ = []
        sys.modules[fullname] = mod
        return mod


sys.meta_path.insert(0, _Finder())
sys.modules.setdefault("agent", types.ModuleType("agent"))
sys.modules["agent"].__path__ = ["agent"]

from agent import userbot  # noqa: E402

userbot.Client = MagicMock  # type: ignore[assignment]
userbot.GetMessagesViews = lambda **kw: kw  # type: ignore[assignment]


def check(name: str, ok: bool) -> None:
    print(("PASS " if ok else "FAIL ") + name)
    if not ok:
        raise SystemExit(1)


class FakeMessage:
    def __init__(self, mid: int, empty: bool = False):
        self.id = mid
        self.empty = empty


class FakeClient:
    """Warm client stand-in whose post can be 'deleted' at any moment."""

    def __init__(self, acc_id: int, *, state: dict):
        self.acc_id = acc_id
        self.state = state          # {"deleted": bool, "probe_error": Exception|None}
        self.views = 0
        self.reactions = 0
        self.probes = 0

    async def resolve_peer(self, chat_id):
        return f"peer:{chat_id}"

    async def invoke(self, _query):
        if self.state.get("deleted"):
            raise RuntimeError("[400 MSG_ID_INVALID] the message id is invalid")
        self.views += 1
        return True

    async def send_reaction(self, chat_id, message_id, emoji=None):
        if self.state.get("deleted"):
            raise RuntimeError("[400 MESSAGE_ID_INVALID] message gone")
        self.reactions += 1
        return True

    async def get_messages(self, chat_id, message_id):
        self.probes += 1
        err = self.state.get("probe_error")
        if err is not None:
            raise err
        if self.state.get("deleted"):
            return FakeMessage(message_id, empty=True)
        return FakeMessage(message_id)


def _pool(state: dict, n: int = 3) -> list[FakeClient]:
    userbot._POOL.clear()
    clients = []
    for i in range(1, n + 1):
        c = FakeClient(i, state=state)
        userbot._POOL[i] = {"client": c}
        clients.append(c)
    return clients


def _fast() -> None:
    userbot._account_pacing_delay = lambda _acc: 0.0  # type: ignore[assignment]
    userbot._ACCOUNT_NEXT_FREE.clear()
    userbot.POST_CHECK_CONFIRM_DELAY = 0.0
    userbot.POST_CHECK_INTERVAL = 0.0
    userbot._DELETE_HINTS.clear()
    userbot.set_membership_sink(None)


# --------------------------------------------------------------------- tests --

def test_error_classifier() -> None:
    check(
        "MSG_ID_INVALID looks like a deletion",
        userbot.looks_deleted_error(RuntimeError("[400 MSG_ID_INVALID]")),
    )
    check(
        "CHANNEL_PRIVATE is NOT a deletion",
        not userbot.looks_deleted_error(RuntimeError("[400 CHANNEL_PRIVATE]")),
    )
    check(
        "a flood wait is NOT a deletion",
        not userbot.looks_deleted_error(RuntimeError("[420 FLOOD_WAIT_X]")),
    )
    check("a plain timeout is NOT a deletion", not userbot.looks_deleted_error(RuntimeError("timeout")))


def test_existing_post_is_never_reported_deleted() -> None:
    state = {"deleted": False}
    _pool(state)
    _fast()
    check("a live post is not deleted", asyncio.run(userbot.post_is_deleted(-100111, 5)) is False)

    # Even a live delete HINT must not be trusted on its own.
    userbot.note_delete_hint(-100111, 5)
    guard = userbot.DeletionGuard(-100111, 5)
    check("a delete hint alone never stops a live post", asyncio.run(guard.is_deleted()) is False)

    # Unknown/transient probe failures must also read as "still there".
    state["probe_error"] = RuntimeError("[420 FLOOD_WAIT_30]")
    check(
        "an unconfirmed check keeps the post alive",
        asyncio.run(userbot.post_is_deleted(-100111, 5)) is False,
    )
    state.pop("probe_error")


def test_deleted_post_is_confirmed() -> None:
    state = {"deleted": True}
    clients = _pool(state)
    _fast()
    check("a deleted post is confirmed deleted", asyncio.run(userbot.post_is_deleted(-100111, 7)) is True)
    check("confirmation used more than one check", sum(c.probes for c in clients) >= 2)


def test_view_job_skips_deleted_post() -> None:
    state = {"deleted": True}
    clients = _pool(state)
    _fast()
    raised = False
    try:
        asyncio.run(userbot.view_post_scheduled(-100111, 9, 0.0, member_ids=[1, 2, 3]))
    except userbot.PostDeleted:
        raised = True
    check("view task reports PostDeleted", raised)
    check("no userbot viewed the deleted post", all(c.views == 0 for c in clients))


def test_view_stops_when_post_is_deleted_mid_run() -> None:
    state = {"deleted": False}
    clients = _pool(state, n=6)
    _fast()

    original = userbot._account_pacing_delay

    def _delay(acc_id):
        # Delete the post right after the second userbot has viewed it.
        if sum(c.views for c in clients) >= 2:
            state["deleted"] = True
            userbot.note_delete_hint(-100111, 11)
        return 0.0

    userbot._account_pacing_delay = _delay  # type: ignore[assignment]
    done = asyncio.run(userbot.view_post_scheduled(-100111, 11, 0.0, member_ids=[1, 2, 3, 4, 5, 6]))
    userbot._account_pacing_delay = original  # type: ignore[assignment]

    total = sum(c.views for c in clients)
    check(f"the run stopped early after the deletion (viewed {total}/6)", total < 6)
    check(f"it returned the views that already landed ({done})", done == total)


def test_react_job_skips_deleted_post() -> None:
    state = {"deleted": True}
    clients = _pool(state)
    _fast()
    raised = False
    try:
        asyncio.run(
            userbot.react_post_scheduled(-100111, 13, ["👍"], 0.0, member_ids=[1, 2, 3])
        )
    except userbot.PostDeleted:
        raised = True
    check("reaction task reports PostDeleted", raised)
    check("no userbot reacted to the deleted post", all(c.reactions == 0 for c in clients))


def test_worker_turns_deletion_into_a_skip() -> None:
    """The worker must answer 'skipped' — never crash, never count, never retry."""
    sys.modules.setdefault("agent.db", _AnyModule("agent.db"))
    from agent import worker  # imported lazily: it pulls in the db stub

    counted: list[tuple] = []
    worker.db.arun = lambda fn, *a, **kw: _async_value([])  # type: ignore[attr-defined]
    worker.db.get_channel_member_ids = lambda *_a: []       # type: ignore[attr-defined]
    worker.db.bump_view_sent = lambda *a: counted.append(a)  # type: ignore[attr-defined]
    worker.db.bump_reaction_sent = lambda *a: counted.append(a)  # type: ignore[attr-defined]

    async def _boom(*_a, **_kw):
        raise userbot.PostDeleted(-100111, 21)

    worker.userbot.view_post_scheduled = _boom     # type: ignore[assignment]
    worker.userbot.react_post_scheduled = _boom    # type: ignore[assignment]
    worker.userbot.PostDeleted = userbot.PostDeleted  # type: ignore[assignment]

    view_res = asyncio.run(
        worker.handle_view_post({"payload": {"chat_id": -100111, "message_id": 21, "target_id": 3}})
    )
    react_res = asyncio.run(
        worker.handle_react_post(
            {"payload": {"chat_id": -100111, "message_id": 21, "target_id": 3, "emojis": ["👍"]}}
        )
    )
    check(f"view job skipped ({view_res})", view_res.get("stage") == "skipped")
    check(f"reaction job skipped ({react_res})", react_res.get("stage") == "skipped")
    check("nothing was counted for the deleted post", counted == [])


def _async_value(value):
    async def _inner():
        return value

    return _inner()


if __name__ == "__main__":
    test_error_classifier()
    test_existing_post_is_never_reported_deleted()
    test_deleted_post_is_confirmed()
    test_view_job_skips_deleted_post()
    test_view_stops_when_post_is_deleted_mid_run()
    test_react_job_skips_deleted_post()
    test_worker_turns_deletion_into_a_skip()
    print("\nALL CHECKS PASSED")

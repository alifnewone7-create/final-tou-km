"""
Offline checks for grouped posts (albums / grouped photos): one media group must
be treated as a SINGLE post for auto view + auto reaction.

Pyrogram + pytgcalls are NOT installed here (they only live on the VPS), so the
telegram libs are stubbed. Run with:  python -m tests.test_album_grouping
"""

from __future__ import annotations

import asyncio
import sys
import types
from unittest.mock import MagicMock


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


class AlbumClient:
    """Fake client whose chat holds one 3-item album (10,11,12) + normal posts."""

    ALBUM = [10, 11, 12]

    def __init__(self, acc_id: int = 1):
        self.acc_id = acc_id
        self.view_calls: list[list[int]] = []
        self.react_calls: list[int] = []
        self.group_lookups = 0

    async def get_media_group(self, chat_id, message_id):
        self.group_lookups += 1
        if int(message_id) not in self.ALBUM:
            raise ValueError("The message doesn't belong to a media group")
        out = []
        for mid in self.ALBUM:
            m = MagicMock()
            m.id = mid
            out.append(m)
        return out

    async def resolve_peer(self, chat_id):
        return f"peer:{chat_id}"

    async def invoke(self, query):
        self.view_calls.append(list(query["id"]))
        return True

    async def send_reaction(self, chat_id, message_id, emoji=None):
        self.react_calls.append(int(message_id))
        return True


def _fresh(client=None):
    userbot._ALBUM_CACHE.clear()
    userbot._SEEN_POSTS.clear()
    userbot._SEEN_GROUPS.clear()
    userbot._POOL.clear()
    userbot._ACCOUNT_NEXT_FREE.clear()
    userbot._account_pacing_delay = lambda _a, _g=0.0: 0.0  # type: ignore[assignment]
    userbot.set_membership_sink(None)
    c = client or AlbumClient(1)
    userbot._POOL[1] = {"client": c}
    return c


def test_album_ids() -> None:
    c = _fresh()
    check("album item resolves to all 3 ids", asyncio.run(userbot.album_ids(-100123, 11)) == [10, 11, 12])
    check("normal post is not an album", asyncio.run(userbot.album_ids(-100123, 20)) == [])
    lookups = c.group_lookups
    asyncio.run(userbot.album_ids(-100123, 11))
    check("album lookup is cached (no extra API call)", c.group_lookups == lookups)


def test_collapse_post_ids() -> None:
    _fresh()
    ids = asyncio.run(userbot.collapse_album_post_ids(-100123, [10, 11, 12]))
    check(f"a 3-item album collapses to ONE post id ({ids})", ids == [10])

    _fresh()
    ids = asyncio.run(userbot.collapse_album_post_ids(-100123, [9, 10, 11, 12, 13]))
    check(f"normal posts survive, album counts once ({ids})", ids == [9, 10, 13])

    _fresh()
    ids = asyncio.run(userbot.collapse_album_post_ids(-100123, [11, 12, 13]))
    check(
        f"album already dispatched earlier is not re-queued ({ids})",
        ids == [13],
    )


def test_view_covers_whole_album() -> None:
    c = _fresh()
    count = asyncio.run(userbot.view_post_scheduled(-100123, 10, 0.0, member_ids=[1]))
    check(f"one userbot viewed the album ({count})", count == 1)
    check(
        f"the view call carried all 3 album items ({c.view_calls})",
        c.view_calls == [[10, 11, 12]],
    )

    c = _fresh()
    asyncio.run(userbot.view_post_scheduled(-100123, 20, 0.0, member_ids=[1]))
    check(f"a normal post still views just itself ({c.view_calls})", c.view_calls == [[20]])


def test_reaction_hits_album_once() -> None:
    c = _fresh()
    count = asyncio.run(
        userbot.react_post_scheduled(-100123, 10, ["🔥"], 0.0, 0, 0, 0, 1, [1])
    )
    check(f"the album got exactly one reaction ({count})", count == 1)
    check(f"the reaction landed on the album's first message ({c.react_calls})", c.react_calls == [10])


def test_live_handler_dispatches_album_once() -> None:
    c = _fresh()
    dispatched: list[int] = []

    async def view_dispatch(chat_id, message_id):
        dispatched.append(int(message_id))

    userbot.set_view_dispatch(view_dispatch)
    userbot.set_reaction_dispatch(None)

    async def _deliver():
        for mid in (10, 11, 12):
            msg = MagicMock()
            msg.id = mid
            msg.media_group_id = "777777"
            msg.chat.id = -100123
            await userbot._on_channel_post(c, msg)
        # a following standalone post is still detected normally
        msg = MagicMock()
        msg.id = 13
        msg.media_group_id = None
        msg.chat.id = -100123
        await userbot._on_channel_post(c, msg)

    asyncio.run(_deliver())
    check(
        f"3 album items -> 1 dispatch + the normal post ({dispatched})",
        dispatched == [12, 13],
    )
    userbot.set_view_dispatch(None)


if __name__ == "__main__":
    test_album_ids()
    test_collapse_post_ids()
    test_view_covers_whole_album()
    test_reaction_hits_album_once()
    test_live_handler_dispatches_album_once()
    print("\nALL CHECKS PASSED")

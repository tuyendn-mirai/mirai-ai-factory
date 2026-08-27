"""Agent catalog read model for Layer 5.

v1 source is a static seed file. Layer 4 (Langflow) does not expose a
Registry API with domain/owner/version/eval fields yet — swap `_load_seed`
for a real HTTP call once that API exists. Callers (chat_profiles.py) only
depend on `list_agents`, not on where the data comes from.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

_SEED_PATH = Path(__file__).parent / "data" / "agents_seed.json"


@dataclass(frozen=True)
class AgentCatalogEntry:
    id: str
    name: str
    domain: str
    description: str
    version: str
    owner: str
    flow_id: str
    allowed_roles: list[str] = field(default_factory=list)
    allowed_tenants: list[str] = field(default_factory=list)


def _load_seed() -> list[AgentCatalogEntry]:
    raw = json.loads(_SEED_PATH.read_text(encoding="utf-8"))
    return [AgentCatalogEntry(**entry) for entry in raw]


def list_agents() -> list[AgentCatalogEntry]:
    return _load_seed()


def list_agents_for_user(role: str | None, tenant: str | None) -> list[AgentCatalogEntry]:
    agents = list_agents()

    def visible(agent: AgentCatalogEntry) -> bool:
        role_ok = not agent.allowed_roles or role in agent.allowed_roles
        tenant_ok = not agent.allowed_tenants or tenant in agent.allowed_tenants
        return role_ok and tenant_ok

    return [agent for agent in agents if visible(agent)]


def get_agent(agent_id: str) -> AgentCatalogEntry | None:
    return next((agent for agent in list_agents() if agent.id == agent_id), None)

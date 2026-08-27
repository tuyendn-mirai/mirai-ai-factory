"""Auth callbacks for Layer 5.

Two mechanisms are registered:

- `password_auth_callback`: dev-only, hardcoded users. Lets you exercise
  catalog RBAC filtering (mirai_hub.catalog) before Keycloak exists.
- `oauth_callback`: real SSO path. Chainlit's KeycloakOAuthProvider activates
  automatically once OAUTH_KEYCLOAK_* env vars are set (no code change
  needed for the OAuth flow itself) — see README. Keycloak is not deployed
  in this platform yet (PLATFORM.md), so the realm-role/tenant claim names
  below are a guess and MUST be verified against the real client's token
  once Keycloak is live.
"""

from __future__ import annotations

import os

import chainlit as cl

_DEV_USERS = {
    "admin": {"password": os.environ.get("DEV_ADMIN_PASSWORD", "admin"), "role": "admin", "tenant": "internal"},
    "analyst": {"password": os.environ.get("DEV_ANALYST_PASSWORD", "analyst"), "role": "analyst", "tenant": "internal"},
}


@cl.password_auth_callback
def password_auth_callback(username: str, password: str) -> cl.User | None:
    record = _DEV_USERS.get(username)
    if record and record["password"] == password:
        return cl.User(
            identifier=username,
            metadata={"role": record["role"], "tenant": record["tenant"]},
        )
    return None


# Chainlit raises at import time if @cl.oauth_callback is registered with no
# OAUTH_*_CLIENT_ID set — only register once Keycloak (or another provider)
# is actually configured.
if os.environ.get("OAUTH_KEYCLOAK_CLIENT_ID"):

    @cl.oauth_callback
    def oauth_callback(
        provider_id: str,
        token: str,
        raw_user_data: dict,
        default_user: cl.User,
        id_token: str | None = None,
    ) -> cl.User | None:
        # TODO(README checklist): verify these claim names against a real
        # Keycloak realm/client once deployed — placeholder mapping for now.
        realm_access = raw_user_data.get("realm_access", {})
        roles = realm_access.get("roles", [])
        role = "admin" if "admin" in roles else "analyst" if "analyst" in roles else "guest"
        tenant = raw_user_data.get("tenant", "internal")

        default_user.metadata.update({"role": role, "tenant": tenant})
        return default_user

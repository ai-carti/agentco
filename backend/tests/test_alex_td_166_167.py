"""
ALEX-TD-166: CompanyCreate/CompanyUpdate.name — missing max_length (regression from ALEX-TD-109).
             ROADMAP marked as "fixed" but code never received max_length=200.

ALEX-TD-167: RegisterRequest.email — missing max_length.
             EmailStr validates format but not length; multi-MB email strings accepted.
"""
import pytest


def _register_and_login(client, email="td166@example.com", password="pass1234"):
    client.post("/auth/register", json={"email": email, "password": password})
    resp = client.post("/auth/login", json={"email": email, "password": password})
    return resp.json()["access_token"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


# ── ALEX-TD-166: CompanyCreate.name max_length ────────────────────────────────

def test_company_create_name_over_200_returns_422(auth_client):
    """ALEX-TD-166: POST /api/companies/ with name > 200 chars must return 422."""
    client, _ = auth_client
    token = _register_and_login(client, email="td166a@example.com")
    long_name = "X" * 201
    resp = client.post(
        "/api/companies/",
        json={"name": long_name},
        headers=_auth(token),
    )
    assert resp.status_code == 422, (
        f"Expected 422 for company name len 201, got {resp.status_code}. "
        "CompanyCreate.name must have max_length=200."
    )


def test_company_create_name_exactly_200_accepted(auth_client):
    """ALEX-TD-166: POST /api/companies/ with name = 200 chars must return 201."""
    client, _ = auth_client
    token = _register_and_login(client, email="td166b@example.com")
    name_200 = "Y" * 200
    resp = client.post(
        "/api/companies/",
        json={"name": name_200},
        headers=_auth(token),
    )
    assert resp.status_code == 201, (
        f"Expected 201 for company name len 200, got {resp.status_code}."
    )


def test_company_update_name_over_200_returns_422(auth_client):
    """ALEX-TD-166: PUT /api/companies/{id} with name > 200 chars must return 422."""
    client, _ = auth_client
    token = _register_and_login(client, email="td166c@example.com")
    # First create a company
    create_resp = client.post(
        "/api/companies/",
        json={"name": "Valid Name"},
        headers=_auth(token),
    )
    assert create_resp.status_code == 201
    company_id = create_resp.json()["id"]

    long_name = "Z" * 201
    resp = client.put(
        f"/api/companies/{company_id}",
        json={"name": long_name},
        headers=_auth(token),
    )
    assert resp.status_code == 422, (
        f"Expected 422 for company update name len 201, got {resp.status_code}. "
        "CompanyUpdate.name must have max_length=200."
    )


def test_company_create_name_max_length_in_schema():
    """ALEX-TD-166: CompanyCreate schema must declare maxLength=200 on name field."""
    from agentco.handlers.companies import CompanyCreate
    schema = CompanyCreate.model_json_schema()
    name_field = schema.get("properties", {}).get("name", {})
    assert "maxLength" in name_field, (
        f"CompanyCreate.name must have max_length=200 constraint. "
        f"Schema: {name_field}"
    )
    assert name_field["maxLength"] == 200, (
        f"CompanyCreate.name maxLength must be 200, got {name_field['maxLength']}"
    )


def test_company_update_name_max_length_in_schema():
    """ALEX-TD-166: CompanyUpdate schema must declare maxLength=200 on name field."""
    from agentco.handlers.companies import CompanyUpdate
    schema = CompanyUpdate.model_json_schema()
    name_field = schema.get("properties", {}).get("name", {})
    assert "maxLength" in name_field, (
        f"CompanyUpdate.name must have max_length=200 constraint. "
        f"Schema: {name_field}"
    )
    assert name_field["maxLength"] == 200


# ── ALEX-TD-167: RegisterRequest.email max_length ────────────────────────────

def test_register_email_over_254_returns_422(auth_client):
    """ALEX-TD-167: POST /auth/register with email local-part > 254 chars total must return 422.

    RFC 5321 max total email length is 254 chars. An email with 300-char local-part
    should be rejected. Note: pydantic EmailStr rejects truly malformed emails,
    but may accept very long local-parts. max_length=254 is the RFC max.
    """
    client, _ = auth_client
    # Construct an email with local-part that makes total length > 254
    # local-part@domain.com — local part can be up to 64 chars per RFC
    # We create something obviously over the limit
    long_local = "a" * 250
    long_email = f"{long_local}@example.com"  # 262 chars total
    resp = client.post(
        "/auth/register",
        json={"email": long_email, "password": "password123"},
    )
    assert resp.status_code == 422, (
        f"Expected 422 for email len {len(long_email)}, got {resp.status_code}. "
        "RegisterRequest.email must have max_length guard."
    )


def test_register_email_max_length_in_schema():
    """ALEX-TD-167: RegisterRequest schema must declare maxLength on email field."""
    from agentco.handlers.auth import RegisterRequest
    schema = RegisterRequest.model_json_schema()
    email_field = schema.get("properties", {}).get("email", {})
    assert "maxLength" in email_field, (
        f"RegisterRequest.email must have max_length constraint. "
        f"Schema: {email_field}"
    )
    assert email_field["maxLength"] <= 254, (
        f"RegisterRequest.email maxLength must be <= 254 (RFC 5321 limit), "
        f"got {email_field['maxLength']}"
    )

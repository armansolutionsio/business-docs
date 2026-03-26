"""
Test 1.4 — Lead idempotency: mismo Idempotency-Key => 1 solo lead
"""


def test_1_4_lead_idempotency(client):
    """Reintentar POST /leads con mismo Idempotency-Key => 1 solo lead."""
    key = "test-idem-lead-001"
    headers = {"Idempotency-Key": key}
    payload = {"source": "WEB", "status": "NEW", "notes": "consulta inicial"}

    r1 = client.post("/v1/leads", json=payload, headers=headers)
    assert r1.status_code == 201, r1.text
    lead_id = r1.json()["id"]

    # Retry with same key (simulates network retry or double-submit)
    r2 = client.post("/v1/leads", json=payload, headers=headers)
    assert r2.status_code == 201, r2.text
    assert r2.json()["id"] == lead_id, "Se creó un segundo lead en lugar de retornar el existente"

    # Third retry still returns same id
    r3 = client.post("/v1/leads", json=payload, headers=headers)
    assert r3.json()["id"] == lead_id

    # Confirm only one record exists with this id
    all_leads = client.get("/v1/leads").json()
    matching = [l for l in all_leads if l["id"] == lead_id]
    assert len(matching) == 1, f"Se encontraron {len(matching)} leads con el mismo id"


def test_lead_without_idempotency_key_creates_multiple(client):
    """Sin Idempotency-Key, cada POST crea un lead nuevo."""
    payload = {"source": "WEB", "status": "NEW"}
    r1 = client.post("/v1/leads", json=payload)
    r2 = client.post("/v1/leads", json=payload)
    assert r1.json()["id"] != r2.json()["id"]


def test_lead_with_party(client):
    # Create party first
    party_r = client.post("/v1/parties", json={"doc_type": "DNI", "doc_number": "55566677"})
    party_id = party_r.json()["id"]

    r = client.post("/v1/leads", json={"party_id": party_id, "source": "WHATSAPP"})
    assert r.status_code == 201
    assert r.json()["party_id"] == party_id


def test_get_lead_not_found(client):
    r = client.get("/v1/leads/00000000-0000-0000-0000-000000000000")
    assert r.status_code == 404

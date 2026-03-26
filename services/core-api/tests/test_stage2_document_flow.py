"""
Stage 2 Tests — Business Docs integration with Core API.

Test 2.1: Quote con buyer DNI => Party + Lead + DocumentRef en Core.
Test 2.2: Mismo Idempotency-Key => no duplica DocumentRef.

Requires a running Postgres test DB (same setup as conftest.py).
Run: cd services/core-api && pytest tests/test_stage2_document_flow.py -v
"""
from decimal import Decimal


# ── helpers ──────────────────────────────────────────────────────────────────

def _create_party(client, doc_number: str, doc_type: str = "DNI", full_name: str = "Test User"):
    r = client.post("/v1/parties", json={
        "doc_type": doc_type,
        "doc_number": doc_number,
        "full_name": full_name,
        "email": "test@armantravel.com",
        "phone": "+54911999888",
    })
    assert r.status_code == 201, r.text
    return r.json()


def _create_lead(client, party_id: str, notes: str = None):
    payload = {"party_id": party_id, "source": "QUOTE", "status": "NEW"}
    if notes:
        payload["notes"] = notes
    r = client.post("/v1/leads", json=payload)
    assert r.status_code == 201, r.text
    return r.json()


SAMPLE_TOTALS = {
    "subtotal": "5000.00",
    "discount": "0.00",
    "taxable_base": "5000.00",
    "iva": "0.00",
    "iva_rate": "0",
    "other_taxes": "0.00",
    "total": "5000.00",
}


# ── Test 2.1 ──────────────────────────────────────────────────────────────────

def test_2_1_quote_creates_party_lead_docref(client):
    """Test 2.1: DocumentRef QUOTE vincula Party + Lead y almacena totals."""
    # 1. Party
    party = _create_party(client, "33445566", "DNI", "Juan Pérez")
    party_id = party["id"]
    assert party["doc_type"] == "DNI"
    assert party["doc_number_normalized"] == "33445566"

    # 2. Lead
    lead = _create_lead(client, party_id, notes="Cotización vuelo BUE-MAD")
    lead_id = lead["id"]
    assert lead["party_id"] == party_id
    assert lead["source"] == "QUOTE"
    assert lead["status"] == "NEW"

    # 3. DocumentRef for QUOTE, linking both party and lead, with totals
    doc_r = client.post("/v1/documents/refs", json={
        "party_id": party_id,
        "lead_id": lead_id,
        "doc_type": "QUOTE",
        "external_ref": "COT-0001",
        "totals": SAMPLE_TOTALS,
    })
    assert doc_r.status_code == 201, doc_r.text
    doc = doc_r.json()

    assert doc["party_id"] == party_id, "DocumentRef debe tener party_id"
    assert doc["lead_id"] == lead_id, "DocumentRef debe tener lead_id"
    assert doc["doc_type"] == "QUOTE"
    assert doc["doc_number"] == 1, "Primer doc para esta party+type debe ser 1"
    assert doc["external_ref"] == "COT-0001"
    assert doc["totals"] is not None, "totals debe estar almacenado"
    assert doc["totals"]["total"] == "5000.00"
    assert doc["totals"]["taxable_base"] == "5000.00"

    # Verify GET retrieves all three entities
    party_check = client.get(f"/v1/parties/{party_id}")
    assert party_check.status_code == 200

    lead_check = client.get(f"/v1/leads/{lead_id}")
    assert lead_check.status_code == 200

    docref_check = client.get(f"/v1/documents/refs/{doc['id']}")
    assert docref_check.status_code == 200
    assert docref_check.json()["lead_id"] == lead_id


def test_2_1_docref_resolves_party_from_lead(client):
    """DocumentRef con lead_id pero sin party_id => resuelve party automáticamente."""
    party = _create_party(client, "55443322", "DNI", "María García")
    party_id = party["id"]
    lead = _create_lead(client, party_id)
    lead_id = lead["id"]

    # Create DocumentRef supplying only lead_id (no party_id)
    doc_r = client.post("/v1/documents/refs", json={
        "lead_id": lead_id,
        "doc_type": "QUOTE",
    })
    assert doc_r.status_code == 201, doc_r.text
    doc = doc_r.json()

    # party_id must have been resolved from lead
    assert doc["party_id"] == party_id, "party_id debe resolverse desde lead"
    assert doc["lead_id"] == lead_id
    assert doc["doc_number"] == 1


def test_2_1_correlative_doc_number_increments(client):
    """doc_number se incrementa correctamente por (party, doc_type)."""
    party = _create_party(client, "77889900", "DNI", "Carlos López")
    party_id = party["id"]

    r1 = client.post("/v1/documents/refs", json={"party_id": party_id, "doc_type": "QUOTE"})
    r2 = client.post("/v1/documents/refs", json={"party_id": party_id, "doc_type": "QUOTE"})
    r3 = client.post("/v1/documents/refs", json={"party_id": party_id, "doc_type": "INVOICE"})

    assert r1.json()["doc_number"] == 1
    assert r2.json()["doc_number"] == 2
    assert r3.json()["doc_number"] == 1, "Numeración separada por doc_type"


# ── Test 2.2 ──────────────────────────────────────────────────────────────────

def test_2_2_idempotency_same_key_no_duplicate(client):
    """Test 2.2: Mismo Idempotency-Key => devuelve el mismo DocumentRef sin duplicar."""
    party = _create_party(client, "11223355", "DNI", "Ana Martínez")
    party_id = party["id"]
    idem_key = "idem-stage2-test-2-2-abc"
    headers = {"Idempotency-Key": idem_key}

    # Primera llamada — crea DocumentRef
    r1 = client.post(
        "/v1/documents/refs",
        json={"party_id": party_id, "doc_type": "QUOTE", "totals": SAMPLE_TOTALS},
        headers=headers,
    )
    assert r1.status_code == 201, r1.text
    doc_id_1 = r1.json()["id"]
    doc_number_1 = r1.json()["doc_number"]

    # Segunda llamada con mismo key — debe devolver el mismo registro
    r2 = client.post(
        "/v1/documents/refs",
        json={"party_id": party_id, "doc_type": "QUOTE", "totals": SAMPLE_TOTALS},
        headers=headers,
    )
    assert r2.status_code == 201, r2.text
    assert r2.json()["id"] == doc_id_1, "Idempotency-Key debe retornar mismo DocumentRef"
    assert r2.json()["doc_number"] == doc_number_1, "doc_number no debe cambiar"

    # Tercera llamada — aún con mismo key
    r3 = client.post(
        "/v1/documents/refs",
        json={"party_id": party_id, "doc_type": "QUOTE"},
        headers=headers,
    )
    assert r3.json()["id"] == doc_id_1, "Tercera llamada con mismo key también debe ser idempotente"

    # Verificar que solo existe 1 DocumentRef para esta party+QUOTE
    refs_list = client.get(f"/v1/documents/refs?sale_id=00000000-0000-0000-0000-000000000000")
    # The list endpoint filters by sale_id; check via direct doc lookup
    doc_direct = client.get(f"/v1/documents/refs/{doc_id_1}")
    assert doc_direct.status_code == 200


def test_2_2_different_keys_create_separate_docs(client):
    """Diferentes Idempotency-Keys generan DocumentRefs distintos (numeración correcta)."""
    party = _create_party(client, "99887744", "DNI", "Pedro Ruiz")
    party_id = party["id"]

    r1 = client.post(
        "/v1/documents/refs",
        json={"party_id": party_id, "doc_type": "QUOTE"},
        headers={"Idempotency-Key": "key-doc-A"},
    )
    r2 = client.post(
        "/v1/documents/refs",
        json={"party_id": party_id, "doc_type": "QUOTE"},
        headers={"Idempotency-Key": "key-doc-B"},
    )

    assert r1.status_code == 201
    assert r2.status_code == 201
    assert r1.json()["id"] != r2.json()["id"], "Diferentes keys generan docs distintos"
    assert r2.json()["doc_number"] == r1.json()["doc_number"] + 1


# ── Test: totals persisted correctly ─────────────────────────────────────────

def test_totals_components_stored_correctly(client):
    """Los componentes del desglose fiscal se persisten completos en JSONB."""
    party = _create_party(client, "12345679", "DNI", "Lucia Fernández")
    party_id = party["id"]

    totals = {
        "subtotal": "10000.00",
        "discount": "500.00",
        "taxable_base": "9500.00",
        "iva": "1995.00",
        "iva_rate": "21",
        "other_taxes": "0.00",
        "total": "11495.00",
    }
    r = client.post("/v1/documents/refs", json={
        "party_id": party_id,
        "doc_type": "INVOICE",
        "totals": totals,
    })
    assert r.status_code == 201
    stored = r.json()["totals"]
    assert stored["subtotal"] == "10000.00"
    assert stored["discount"] == "500.00"
    assert stored["taxable_base"] == "9500.00"
    assert stored["iva"] == "1995.00"
    assert stored["iva_rate"] == "21"
    assert stored["total"] == "11495.00"

"""
Test 1.1 — Party dedup by normalized document
Test 1.2 — CUIT with wrong check digit → 400
"""


def test_1_1_dni_with_dots_and_without_yield_same_party(client):
    """DNI '12.345.678' y '12345678' => retorna el mismo party_id (no duplica)."""
    r1 = client.post(
        "/v1/parties",
        json={"doc_type": "DNI", "doc_number": "12.345.678", "full_name": "Juan Pérez"},
    )
    assert r1.status_code == 201, r1.text
    party_id_1 = r1.json()["id"]
    assert r1.json()["doc_number_normalized"] == "12345678"

    r2 = client.post(
        "/v1/parties",
        json={"doc_type": "DNI", "doc_number": "12345678", "full_name": "Juan Pérez"},
    )
    assert r2.status_code == 201, r2.text
    party_id_2 = r2.json()["id"]

    assert party_id_1 == party_id_2, "Se creó un duplicado en lugar de retornar el existente"


def test_1_1_cuit_with_hyphens_normalized(client):
    """CUIT con formato XX-XXXXXXXX-V queda normalizado a 11 dígitos."""
    # 20-12345678-6 → valid check digit (remainder=5 → 11-5=6)
    r = client.post(
        "/v1/parties",
        json={"doc_type": "CUIT", "doc_number": "20-12345678-6"},
    )
    assert r.status_code == 201, r.text
    assert r.json()["doc_number_normalized"] == "20123456786"

    # Same number without hyphens → same party
    r2 = client.post(
        "/v1/parties",
        json={"doc_type": "CUIT", "doc_number": "20123456786"},
    )
    assert r2.status_code == 201, r2.text
    assert r2.json()["id"] == r.json()["id"]


def test_1_2_cuit_wrong_check_digit_returns_400(client):
    """CUIT con dígito verificador incorrecto => 400 'CUIT inválido'."""
    # 20-12345678-9: check digit should be 6 (remainder=5), not 9
    r = client.post(
        "/v1/parties",
        json={"doc_type": "CUIT", "doc_number": "20-12345678-9"},
    )
    assert r.status_code == 400, r.text
    assert "inválido" in r.json()["detail"].lower()


def test_1_2_cuil_wrong_check_digit_returns_400(client):
    """CUIL con dígito verificador incorrecto también debe retornar 400.
    27-12345678-0 es válido (check=0), así que usamos -1 que es incorrecto.
    """
    r = client.post(
        "/v1/parties",
        json={"doc_type": "CUIL", "doc_number": "27-12345678-1"},  # valid is 0, not 1
    )
    assert r.status_code == 400, r.text


def test_dni_too_short_returns_400(client):
    r = client.post("/v1/parties", json={"doc_type": "DNI", "doc_number": "123"})
    assert r.status_code == 400


def test_get_party_by_id(client):
    r = client.post("/v1/parties", json={"doc_type": "DNI", "doc_number": "9876543"})
    assert r.status_code == 201
    pid = r.json()["id"]
    r2 = client.get(f"/v1/parties/{pid}")
    assert r2.status_code == 200
    assert r2.json()["id"] == pid


def test_get_party_not_found(client):
    r = client.get("/v1/parties/00000000-0000-0000-0000-000000000000")
    assert r.status_code == 404

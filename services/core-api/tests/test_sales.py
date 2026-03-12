"""
Test 1.3 — Sale con 2 SaleItems y 3 Costs => GET /sales/{id} devuelve desglose y totales
"""
from decimal import Decimal


def _create_buyer(client, doc_number: str = "44455566"):
    r = client.post("/v1/parties", json={"doc_type": "DNI", "doc_number": doc_number})
    assert r.status_code == 201
    return r.json()["id"]


def test_1_3_sale_detail_with_items_and_costs(client):
    """Sale con 2 SaleItems y 3 Costs => GET devuelve desglose y totales correctos."""
    buyer_id = _create_buyer(client, "11223344")

    # Create sale
    sale_r = client.post("/v1/sales", json={"buyer_party_id": buyer_id, "currency": "ARS"})
    assert sale_r.status_code == 201, sale_r.text
    sale_id = sale_r.json()["id"]

    # Create 2 sale items
    item1 = client.post("/v1/sale-items", json={
        "sale_id": sale_id,
        "description": "Vuelo BUE-MAD",
        "item_type": "FLIGHT",
        "quantity": 1,
        "unit_price": "1000.00",
        "total_price": "1000.00",
    })
    assert item1.status_code == 201, item1.text

    item2 = client.post("/v1/sale-items", json={
        "sale_id": sale_id,
        "description": "Hotel Madrid 3 noches",
        "item_type": "HOTEL",
        "quantity": 3,
        "unit_price": "200.00",
        "total_price": "600.00",
    })
    assert item2.status_code == 201, item2.text

    # Create 3 costs
    for i in range(1, 4):
        c = client.post("/v1/costs", json={
            "sale_id": sale_id,
            "description": f"Costo proveedor {i}",
            "amount": "100.00",
            "currency": "ARS",
        })
        assert c.status_code == 201, c.text

    # GET sale detail
    r = client.get(f"/v1/sales/{sale_id}")
    assert r.status_code == 200, r.text
    data = r.json()

    assert len(data["items"]) == 2, f"Esperado 2 items, obtenidos {len(data['items'])}"
    assert len(data["costs"]) == 3, f"Esperado 3 costs, obtenidos {len(data['costs'])}"

    assert Decimal(data["subtotal"]) == Decimal("1600.00"), f"subtotal incorrecto: {data['subtotal']}"
    assert Decimal(data["total_costs"]) == Decimal("300.00"), f"total_costs incorrecto: {data['total_costs']}"
    assert Decimal(data["payments_total"]) == Decimal("0.00"), "payments_total debe ser 0 (sin pagos completados)"


def test_sale_payments_total_counts_only_completed(client):
    """payments_total solo suma pagos con status=COMPLETED."""
    buyer_id = _create_buyer(client, "99887766")
    sale_r = client.post("/v1/sales", json={"buyer_party_id": buyer_id})
    sale_id = sale_r.json()["id"]

    # PENDING payment
    client.post("/v1/payments", json={
        "sale_id": sale_id, "amount": "500.00", "status": "PENDING"
    })
    # COMPLETED payment
    client.post("/v1/payments", json={
        "sale_id": sale_id, "amount": "300.00", "status": "COMPLETED"
    })

    r = client.get(f"/v1/sales/{sale_id}")
    assert r.status_code == 200
    assert Decimal(r.json()["payments_total"]) == Decimal("300.00")


def test_sale_not_found(client):
    r = client.get("/v1/sales/00000000-0000-0000-0000-000000000000")
    assert r.status_code == 404


def test_sale_item_linked_to_sale(client):
    buyer_id = _create_buyer(client, "12312312")
    sale_r = client.post("/v1/sales", json={"buyer_party_id": buyer_id})
    sale_id = sale_r.json()["id"]

    item_r = client.post("/v1/sale-items", json={
        "sale_id": sale_id,
        "description": "Seguro de viaje",
        "quantity": 1,
        "unit_price": "80.00",
        "total_price": "80.00",
    })
    assert item_r.status_code == 201
    item_id = item_r.json()["id"]

    # Cost linked to specific sale item
    cost_r = client.post("/v1/costs", json={
        "sale_id": sale_id,
        "sale_item_id": item_id,
        "description": "Costo seguro",
        "amount": "50.00",
    })
    assert cost_r.status_code == 201
    assert cost_r.json()["sale_item_id"] == item_id

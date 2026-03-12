"""
Document validation and normalization for Argentina.

Supported types:
  DNI      — 7 or 8 digits (strips dots/spaces/hyphens)
  CUIL     — 11 digits, mod-11 check (strips hyphens/dots/spaces)
  CUIT     — same algorithm as CUIL
  PASSPORT — alphanumeric, uppercased, spaces stripped
"""

import re
from typing import Literal

DocType = Literal["DNI", "CUIL", "CUIT", "PASSPORT"]

# Multipliers for CUIT/CUIL mod-11 validation
_CUIT_MULTIPLIERS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]


def _strip(number: str) -> str:
    return re.sub(r"[\s.\-]", "", number)


def normalize_dni(number: str) -> str:
    normalized = _strip(number)
    if not re.match(r"^\d{7,8}$", normalized):
        raise ValueError(
            f"DNI inválido: debe tener 7 u 8 dígitos (recibido: '{number}')"
        )
    return normalized


def normalize_cuit_cuil(number: str) -> str:
    normalized = _strip(number)
    if not re.match(r"^\d{11}$", normalized):
        raise ValueError(
            f"CUIT/CUIL inválido: debe tener 11 dígitos (recibido: '{number}')"
        )

    digits = [int(d) for d in normalized]
    total = sum(d * m for d, m in zip(digits[:10], _CUIT_MULTIPLIERS))
    remainder = total % 11

    if remainder == 0:
        expected = 0
    elif remainder == 1:
        expected = 9  # special case: Argentina uses 9 for remainder=1
    else:
        expected = 11 - remainder

    if digits[10] != expected:
        raise ValueError(
            f"CUIT/CUIL inválido: dígito verificador incorrecto "
            f"(esperado {expected}, recibido {digits[10]})"
        )

    return normalized


def normalize_passport(number: str) -> str:
    normalized = re.sub(r"\s", "", number).upper()
    if not normalized:
        raise ValueError("Pasaporte inválido: número vacío")
    if not re.match(r"^[A-Z0-9]+$", normalized):
        raise ValueError(
            f"Pasaporte inválido: solo se permiten letras y números (recibido: '{number}')"
        )
    return normalized


def normalize_doc(doc_type: DocType, doc_number: str) -> str:
    """Validate and normalize a document number. Raises ValueError on failure."""
    if doc_type == "DNI":
        return normalize_dni(doc_number)
    if doc_type in ("CUIL", "CUIT"):
        return normalize_cuit_cuil(doc_number)
    if doc_type == "PASSPORT":
        return normalize_passport(doc_number)
    raise ValueError(f"Tipo de documento desconocido: {doc_type}")

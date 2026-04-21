"""
WhatsApp Data Pipeline — Motor de Ingenieria de Datos

Procesa el Google Sheet de WhatsApp Business API y carga al CRM.

El Sheet tiene 5 columnas: Telefono | Nombre | Mensaje | Fecha | Estado
Pero la columna "Telefono" contiene el PAYLOAD COMPLETO del webhook de WA Business API,
con TODA la info: telefono, message ID, tipo de mensaje, texto, audios, documentos,
campanas publicitarias, etc.

Uso:
  python pipeline.py --file leads.csv                # Importar
  python pipeline.py --file leads.xlsx               # Excel tambien
  python pipeline.py --file leads.csv --dry-run      # Preview sin tocar la DB
  python pipeline.py --file chat_export.txt           # Export manual de WA
"""
import argparse
import sys
import os
from datetime import datetime

import pandas as pd
import psycopg2

from config import DATABASE_URL
from parsers import (
    parse_telefono_field,
    parse_whatsapp_export_txt,
    detect_campaign_label,
    normalize_phone,
    classify_archivo_tipo,
)


class WhatsAppPipeline:
    """Motor ETL para datos de WhatsApp Business."""

    def __init__(self, db_url: str = None, dry_run: bool = False):
        self.db_url = db_url or DATABASE_URL
        self.dry_run = dry_run
        self.conn = None
        self.stats = {
            "rows_processed": 0,
            "contacts_created": 0,
            "contacts_updated": 0,
            "messages_imported": 0,
            "files_imported": 0,
            "errors_skipped": 0,
            "duplicates_skipped": 0,
            "errors": [],
            "campaigns_detected": {},
            "message_types": {},
        }

    def connect(self):
        self.conn = psycopg2.connect(self.db_url)
        self.conn.autocommit = False
        print(f"[OK] Conectado a la base de datos")

    def close(self):
        if self.conn:
            self.conn.close()

    # ══════════════════════════════════════════════════════════════════════════
    # EXTRACT
    # ══════════════════════════════════════════════════════════════════════════

    def extract_from_file(self, filepath: str) -> pd.DataFrame:
        ext = os.path.splitext(filepath)[1].lower()
        print(f"\n[EXTRACT] Leyendo: {filepath}")

        if ext == ".txt":
            return self._extract_txt(filepath)
        elif ext == ".csv":
            return self._extract_csv(filepath)
        elif ext in (".xlsx", ".xls"):
            return self._extract_excel(filepath)
        else:
            raise ValueError(f"Formato no soportado: {ext}")

    def _extract_csv(self, filepath: str) -> pd.DataFrame:
        for encoding in ["utf-8", "utf-8-sig", "latin-1", "cp1252"]:
            for sep in [",", ";", "\t"]:
                try:
                    df = pd.read_csv(filepath, encoding=encoding, sep=sep)
                    if len(df.columns) >= 3:
                        print(f"  Encoding: {encoding}, Sep: {repr(sep)}, Columnas: {list(df.columns)}, Filas: {len(df)}")
                        return df
                except Exception:
                    continue
        raise ValueError("No se pudo leer el CSV")

    def _extract_excel(self, filepath: str) -> pd.DataFrame:
        df = pd.read_excel(filepath, engine="openpyxl")
        print(f"  Columnas: {list(df.columns)}, Filas: {len(df)}")
        return df

    def _extract_txt(self, filepath: str) -> pd.DataFrame:
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()
        messages = parse_whatsapp_export_txt(content)
        print(f"  Mensajes del .txt: {len(messages)}")
        return pd.DataFrame(messages)

    # ══════════════════════════════════════════════════════════════════════════
    # TRANSFORM
    # ══════════════════════════════════════════════════════════════════════════

    def transform(self, df: pd.DataFrame) -> list[dict]:
        print(f"\n[TRANSFORM] Procesando {len(df)} filas...")

        df.columns = [c.strip().lower() for c in df.columns]
        col_map = self._detect_columns(df)
        print(f"  Columnas mapeadas: {col_map}")

        records = []
        for idx, row in df.iterrows():
            try:
                record = self._transform_row(row, col_map, idx)
                if record:
                    records.append(record)
                    self.stats["rows_processed"] += 1
            except Exception as e:
                self.stats["errors"].append({"row": idx, "error": str(e)})

        # Stats
        for r in records:
            camp = r.get("campana_label", "Sin campana")
            self.stats["campaigns_detected"][camp] = self.stats["campaigns_detected"].get(camp, 0) + 1
            mt = r.get("tipo_mensaje", "unknown")
            self.stats["message_types"][mt] = self.stats["message_types"].get(mt, 0) + 1

        print(f"  Registros validos: {len(records)}")
        print(f"  Tipos de mensaje:")
        for mt, count in sorted(self.stats["message_types"].items(), key=lambda x: -x[1]):
            print(f"    {mt}: {count}")
        if self.stats["campaigns_detected"]:
            print(f"  Campanas detectadas:")
            for camp, count in sorted(self.stats["campaigns_detected"].items(), key=lambda x: -x[1]):
                print(f"    {camp}: {count}")

        return records

    def _detect_columns(self, df: pd.DataFrame) -> dict:
        cols = list(df.columns)
        mapping = {"telefono": None, "nombre": None, "mensaje": None, "fecha": None, "estado": None}

        for c in cols:
            cl = c.lower().replace("é", "e").replace("á", "a")
            if any(k in cl for k in ["telef", "phone", "from", "numero"]):
                mapping["telefono"] = c; break
        if not mapping["telefono"] and cols:
            mapping["telefono"] = cols[0]

        for c in cols:
            cl = c.lower()
            if any(k in cl for k in ["nombre", "name", "contacto"]):
                mapping["nombre"] = c; break

        for c in cols:
            cl = c.lower()
            if any(k in cl for k in ["mensaje", "message", "body", "texto"]):
                mapping["mensaje"] = c; break

        for c in cols:
            cl = c.lower()
            if any(k in cl for k in ["fecha", "date", "timestamp"]):
                mapping["fecha"] = c; break

        for c in cols:
            cl = c.lower()
            if any(k in cl for k in ["estado", "status"]):
                mapping["estado"] = c; break

        return mapping

    def _transform_row(self, row, col_map: dict, idx: int) -> dict | None:
        # ── Parsear el payload completo del webhook desde columna Telefono ──
        raw_phone = str(row.get(col_map["telefono"], "")) if col_map["telefono"] else ""
        if not raw_phone or raw_phone == "nan":
            return None

        parsed = parse_telefono_field(raw_phone)
        telefono = parsed["telefono"]
        if not telefono:
            return None

        # Si el parser extrajo contenido del payload, usarlo.
        # Si no, usar la columna Mensaje del Sheet como fallback.
        contenido = parsed["contenido"] or ""
        if not contenido and col_map["mensaje"]:
            fallback_msg = str(row.get(col_map["mensaje"], ""))
            if fallback_msg != "nan":
                contenido = fallback_msg.strip()

        # Nombre: del Sheet, ya que el payload no siempre lo tiene
        nombre = ""
        if col_map["nombre"]:
            n = str(row.get(col_map["nombre"], ""))
            if n != "nan":
                nombre = n.strip()

        # Fecha: preferir timestamp del payload (mas preciso), fallback a columna Fecha
        fecha = None
        if parsed["timestamp"]:
            try:
                fecha = pd.to_datetime(parsed["timestamp"]).to_pydatetime()
            except Exception:
                pass
        if not fecha and col_map["fecha"]:
            raw_f = row.get(col_map["fecha"])
            if pd.notna(raw_f):
                try:
                    fecha = pd.to_datetime(raw_f).to_pydatetime()
                except Exception:
                    pass
        if not fecha:
            fecha = datetime.now()

        # Estado del Sheet
        estado_sheet = ""
        if col_map["estado"]:
            e = str(row.get(col_map["estado"], ""))
            if e != "nan":
                estado_sheet = e.strip()

        campana_label = detect_campaign_label(parsed)
        destino = self._extract_destino(contenido, parsed.get("referral_body", ""))

        # Determinar si es saliente (mensajes que nosotros mandamos)
        # Heuristica: si tiene document con nombre tipo "PROPUESTA", es saliente
        es_saliente = False
        if parsed["tipo_mensaje"] == "document" and parsed["archivo_nombre"]:
            fname = (parsed["archivo_nombre"] or "").upper()
            if any(k in fname for k in ["PROPUESTA", "COTIZACION", "FACTURA", "PRESUPUESTO"]):
                es_saliente = True

        return {
            "telefono": telefono,
            "nombre": nombre,
            "contenido": contenido,
            "fecha": fecha,
            "estado_sheet": estado_sheet,
            "tipo_mensaje": parsed["tipo_mensaje"],
            "wa_message_id": parsed["wa_message_id"],
            "archivo_nombre": parsed["archivo_nombre"],
            "archivo_mime_type": parsed["archivo_mime_type"],
            "archivo_sha256": parsed["archivo_sha256"],
            "es_error": parsed["es_error"],
            "error_detalle": parsed.get("error_detalle"),
            "referral_source_url": parsed["referral_source_url"],
            "referral_source_id": parsed["referral_source_id"],
            "campana_tipo": parsed["campana_tipo"],
            "campana_label": campana_label,
            "referral_body": parsed.get("referral_body", ""),
            "forwarded": parsed["forwarded"],
            "destino_interes": destino,
            "es_saliente": es_saliente,
            "tipo_conversacion": "saliente" if es_saliente else "entrante",
        }

    def _extract_destino(self, mensaje: str, referral_body: str) -> str:
        text = f"{mensaje} {referral_body}".lower()
        destinos = [
            "cancun", "caribe", "jamaica", "brasil", "bariloche", "mendoza",
            "miami", "orlando", "europa", "paris", "roma", "londres",
            "punta cana", "cartagena", "colombia", "peru", "cusco",
            "machu picchu", "rio de janeiro", "buzios", "florianopolis",
            "san andres", "mexico", "playa del carmen", "riviera maya",
            "praia do forte", "maldivas", "tailandia", "dubai",
            "iguazu", "salta", "jujuy", "ushuaia", "el calafate",
            "mar del plata", "pinamar", "villa carlos paz",
            "chile", "santiago", "uruguay", "colonia",
        ]
        found = [d for d in destinos if d in text]
        return ", ".join(found).title() if found else ""

    # ══════════════════════════════════════════════════════════════════════════
    # LOAD
    # ══════════════════════════════════════════════════════════════════════════

    def load(self, records: list[dict]):
        print(f"\n[LOAD] Cargando {len(records)} registros...")

        if self.dry_run:
            print("  [DRY RUN] Sin cambios en la DB")
            self._print_preview(records)
            return

        cur = self.conn.cursor()

        for record in records:
            try:
                self._upsert_contact_and_message(cur, record)
            except Exception as e:
                self.stats["errors"].append({"telefono": record["telefono"], "error": str(e)})
                self.conn.rollback()

        # Log
        cur.execute(
            """INSERT INTO whatsapp_sync_log
               (source, registros_procesados, contactos_creados, mensajes_importados, errores)
               VALUES (%s, %s, %s, %s, %s)""",
            ["python_pipeline", self.stats["rows_processed"], self.stats["contacts_created"],
             self.stats["messages_imported"], len(self.stats["errors"])],
        )
        self.conn.commit()
        cur.close()
        print(f"  [OK] Carga completada")

    def _upsert_contact_and_message(self, cur, record: dict):
        telefono = record["telefono"]

        # ── Buscar o crear contacto ──
        cur.execute("SELECT id, nombre FROM contactos WHERE telefono = %s LIMIT 1", [telefono])
        existing = cur.fetchone()

        if existing:
            contacto_id = existing[0]
            self.stats["contacts_updated"] += 1

            # Actualizar campos de campana si hay y no tenia
            updates = ["fecha_ultima_interaccion = NOW()", "updated_at = NOW()"]
            params = []
            if record["campana_label"] and record["campana_tipo"] != "direct":
                updates.append("campana_publicitaria = COALESCE(campana_publicitaria, %s)")
                params.append(record["campana_label"])
                updates.append("campana_source_url = COALESCE(campana_source_url, %s)")
                params.append(record["referral_source_url"])
                updates.append("campana_source_id = COALESCE(campana_source_id, %s)")
                params.append(record["referral_source_id"])
                updates.append("campana_tipo = COALESCE(campana_tipo, %s)")
                params.append(record["campana_tipo"])
            if record["destino_interes"]:
                updates.append("destino_interes = COALESCE(destino_interes, %s)")
                params.append(record["destino_interes"])
            if record["nombre"] and not existing[1]:
                updates.append("nombre = %s")
                params.append(record["nombre"])

            params.append(contacto_id)
            cur.execute(f"UPDATE contactos SET {', '.join(updates)} WHERE id = %s", params)
            self.conn.commit()
        else:
            cur.execute(
                """INSERT INTO contactos
                   (nombre, telefono, origen, estado, canal_preferido, consentimiento_whatsapp,
                    campana_publicitaria, campana_source_url, campana_source_id, campana_tipo,
                    wa_message_id, wa_first_message, wa_forwarded, destino_interes,
                    fecha_ultima_interaccion)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW()) RETURNING id""",
                [
                    record["nombre"] or f"WhatsApp {telefono}",
                    telefono, "whatsapp", "nuevo", "whatsapp", True,
                    record["campana_label"] if record["campana_tipo"] != "direct" else None,
                    record["referral_source_url"], record["referral_source_id"],
                    record["campana_tipo"], record["wa_message_id"],
                    record["contenido"][:500] if record["contenido"] else None,
                    record["forwarded"], record["destino_interes"] or None,
                ],
            )
            contacto_id = cur.fetchone()[0]
            self.stats["contacts_created"] += 1
            self.conn.commit()

            cur.execute(
                "INSERT INTO audit_log (tabla, registro_id, accion, usuario) VALUES ('contactos', %s, 'INSERT', 'wa-pipeline')",
                [contacto_id],
            )
            self.conn.commit()

        # ── Dedup por wa_message_id ──
        if record["wa_message_id"]:
            cur.execute(
                "SELECT id FROM conversaciones WHERE contacto_id = %s AND contenido LIKE %s LIMIT 1",
                [contacto_id, f"%{record['wa_message_id'][:30]}%"],
            )
            if cur.fetchone():
                self.stats["duplicates_skipped"] += 1
                return

        # ── Insertar mensaje/conversacion ──
        if record["contenido"]:
            cur.execute(
                """INSERT INTO conversaciones
                   (contacto_id, canal, tipo, contenido, usuario_responsable, estado_conversacion, created_at)
                   VALUES (%s, 'whatsapp', %s, %s, 'wa-pipeline', 'abierta', %s)
                   RETURNING id""",
                [contacto_id, record["tipo_conversacion"], record["contenido"], record["fecha"]],
            )
            conv_id = cur.fetchone()[0]
            self.stats["messages_imported"] += 1
            self.conn.commit()

            # ── Insertar archivo adjunto si hay ──
            if record["archivo_nombre"] and record["tipo_mensaje"] in ("audio", "document", "image", "video", "sticker"):
                archivo_tipo = classify_archivo_tipo(record["archivo_mime_type"], record["tipo_mensaje"])
                cur.execute(
                    """INSERT INTO conversacion_archivos
                       (conversacion_id, contacto_id, nombre_archivo, tipo_archivo, created_at)
                       VALUES (%s, %s, %s, %s, %s)""",
                    [conv_id, contacto_id, record["archivo_nombre"], archivo_tipo, record["fecha"]],
                )
                self.stats["files_imported"] += 1
                self.conn.commit()

    def _print_preview(self, records: list[dict]):
        print(f"\n  Preview (primeros 8 de {len(records)}):")
        print(f"  {'='*90}")
        for r in records[:8]:
            tipo_icon = {"text": "TXT", "audio": "AUD", "document": "DOC", "image": "IMG", "video": "VID", "error": "ERR"}.get(r["tipo_mensaje"], "???")
            direction = "SALIENTE" if r["es_saliente"] else "ENTRANTE"
            print(f"  [{tipo_icon}] [{direction}] {r['telefono']} — {r['nombre'] or 'Sin nombre'}")
            print(f"       {r['contenido'][:100]}")
            print(f"       Fecha: {r['fecha']}  |  Campana: {r['campana_label']}")
            if r["archivo_nombre"]:
                print(f"       Archivo: {r['archivo_nombre']} ({r['archivo_mime_type']})")
            if r["destino_interes"]:
                print(f"       Destino: {r['destino_interes']}")
            print(f"  {'-'*90}")

    # ══════════════════════════════════════════════════════════════════════════
    # RUN
    # ══════════════════════════════════════════════════════════════════════════

    def run(self, filepath: str):
        print("=" * 60)
        print("  WhatsApp Data Pipeline — Arman Travel CRM")
        print("=" * 60)

        try:
            df = self.extract_from_file(filepath)
            if df.empty:
                print("\n[WARN] Archivo vacio")
                return self.stats

            records = self.transform(df)
            if not records:
                print("\n[WARN] Sin registros validos")
                return self.stats

            if not self.dry_run:
                self.connect()
            self.load(records)
        except Exception as e:
            print(f"\n[ERROR] {e}")
            self.stats["errors"].append({"error": str(e)})
            raise
        finally:
            self.close()

        self._print_summary()
        return self.stats

    def _print_summary(self):
        s = self.stats
        print(f"\n{'='*60}")
        print(f"  RESUMEN DEL PIPELINE")
        print(f"{'='*60}")
        print(f"  Filas procesadas:     {s['rows_processed']}")
        print(f"  Contactos creados:    {s['contacts_created']}")
        print(f"  Contactos existentes: {s['contacts_updated']}")
        print(f"  Mensajes importados:  {s['messages_imported']}")
        print(f"  Archivos importados:  {s['files_imported']}")
        print(f"  Duplicados saltados:  {s['duplicates_skipped']}")
        print(f"  Errores:              {len(s['errors'])}")
        if s["message_types"]:
            print(f"\n  Tipos de mensaje:")
            for mt, count in sorted(s["message_types"].items(), key=lambda x: -x[1]):
                icon = {"text": "Texto", "audio": "Audio", "document": "Documento", "image": "Imagen", "video": "Video", "error": "Error/No soportado"}.get(mt, mt)
                print(f"    {icon}: {count}")
        if s["campaigns_detected"]:
            print(f"\n  Campanas detectadas:")
            for camp, count in sorted(s["campaigns_detected"].items(), key=lambda x: -x[1]):
                print(f"    {camp}: {count}")
        if s["errors"]:
            print(f"\n  Errores detalle (primeros 10):")
            for e in s["errors"][:10]:
                print(f"    - {e}")
        print(f"{'='*60}\n")


def main():
    parser = argparse.ArgumentParser(description="WhatsApp Data Pipeline — Arman Travel CRM")
    parser.add_argument("--file", "-f", required=True, help="Archivo CSV, XLSX, o TXT")
    parser.add_argument("--dry-run", "-d", action="store_true", help="Preview sin tocar la DB")
    parser.add_argument("--db-url", help="PostgreSQL URL (override)")
    args = parser.parse_args()

    if not os.path.exists(args.file):
        print(f"[ERROR] Archivo no encontrado: {args.file}")
        sys.exit(1)

    pipeline = WhatsAppPipeline(db_url=args.db_url, dry_run=args.dry_run)
    stats = pipeline.run(args.file)
    sys.exit(1 if stats["errors"] and not stats["messages_imported"] else 0)


if __name__ == "__main__":
    main()

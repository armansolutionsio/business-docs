"""
Configuration for WhatsApp Data Pipeline
"""
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://arman:arman123@localhost:5435/arman")

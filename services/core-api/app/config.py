from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://arman:arman@db:5432/arman_core"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()

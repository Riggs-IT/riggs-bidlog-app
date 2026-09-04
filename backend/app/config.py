from functools import lru_cache
import os
from typing import Literal
from uuid import UUID

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Riggs Bid Log"
    app_version: str = "0.1.0"
    app_env: Literal["development", "production"] = "development"

    auth_mode: Literal["entra", "dev"] = "entra"

    entra_tenant_id: str = ""
    entra_client_id: str = ""
    entra_client_secret: str = ""
    entra_redirect_uri: str = ""

    session_secret: str = ""
    session_cookie_secure: bool = True
    session_max_age_seconds: int = 28800
    session_idle_timeout_seconds: int = 1200

    dev_auth_entra_object_id: str = ""

    data_api_base_url: str = "https://api.riggsdata.net"
    data_api_client_token: str = ""

    data_api_cf_access_client_id: str = ""
    data_api_cf_access_client_secret: str = ""

    data_api_connect_timeout_seconds: float = 3.0
    data_api_read_timeout_seconds: float = 5.0

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    @property
    def is_production_runtime(self) -> bool:
        return (
            self.app_env == "production"
            or bool(os.getenv("K_SERVICE"))
        )

    @property
    def entra_metadata_url(self) -> str:
        return (
            "https://login.microsoftonline.com/"
            f"{self.entra_tenant_id}"
            "/v2.0/.well-known/openid-configuration"
        )

    @property
    def entra_configured(self) -> bool:
        values = (
            self.entra_tenant_id,
            self.entra_client_id,
            self.entra_client_secret,
            self.entra_redirect_uri,
            self.session_secret,
        )

        return (
            all(
                value
                and value != "CHANGE_ME"
                for value in values
            )
            and len(self.session_secret) >= 32
        )

    @property
    def data_api_base_configured(self) -> bool:
        value = self.data_api_base_url.strip()

        if value.startswith("https://"):
            return True

        return (
            self.app_env == "development"
            and value.startswith("http://")
        )

    @property
    def data_api_cf_access_configured(self) -> bool:
        return bool(
            self.data_api_cf_access_client_id.strip()
            and self.data_api_cf_access_client_secret.strip()
        )

    @property
    def data_api_bid_log_configured(self) -> bool:
        return bool(
            self.data_api_base_configured
            and self.data_api_client_token.strip()
            and self.data_api_cf_access_configured
        )

    @model_validator(mode="after")
    def validate_security_configuration(self):
        cf_id = self.data_api_cf_access_client_id.strip()
        cf_secret = (
            self.data_api_cf_access_client_secret.strip()
        )

        if bool(cf_id) != bool(cf_secret):
            raise ValueError(
                "DATA_API_CF_ACCESS_CLIENT_ID and "
                "DATA_API_CF_ACCESS_CLIENT_SECRET must either "
                "both be configured or both be blank."
            )

        if self.data_api_connect_timeout_seconds <= 0:
            raise ValueError(
                "DATA_API_CONNECT_TIMEOUT_SECONDS must be "
                "greater than zero."
            )

        if self.data_api_read_timeout_seconds <= 0:
            raise ValueError(
                "DATA_API_READ_TIMEOUT_SECONDS must be "
                "greater than zero."
            )

        if self.session_max_age_seconds <= 0:
            raise ValueError(
                "SESSION_MAX_AGE_SECONDS must be greater than zero."
            )

        if self.session_idle_timeout_seconds <= 0:
            raise ValueError(
                "SESSION_IDLE_TIMEOUT_SECONDS must be "
                "greater than zero."
            )

        if (
            self.session_idle_timeout_seconds
            > self.session_max_age_seconds
        ):
            raise ValueError(
                "SESSION_IDLE_TIMEOUT_SECONDS cannot exceed "
                "SESSION_MAX_AGE_SECONDS."
            )

        if self.auth_mode == "dev":
            if self.is_production_runtime:
                raise ValueError(
                    "AUTH_MODE=dev is only allowed for local "
                    "development and is blocked on Cloud Run."
                )

            object_id = (
                self.dev_auth_entra_object_id.strip()
            )

            if not object_id:
                raise ValueError(
                    "DEV_AUTH_ENTRA_OBJECT_ID is required "
                    "when AUTH_MODE=dev."
                )

            try:
                UUID(object_id)
            except (
                ValueError,
                TypeError,
                AttributeError,
            ) as exc:
                raise ValueError(
                    "DEV_AUTH_ENTRA_OBJECT_ID must be a valid GUID."
                ) from exc

            if not self.data_api_bid_log_configured:
                raise ValueError(
                    "Bid Log Data API and Cloudflare credentials "
                    "must be configured when AUTH_MODE=dev."
                )

        if self.is_production_runtime:
            if self.auth_mode != "entra":
                raise ValueError(
                    "Production Bid Log authentication must "
                    "use AUTH_MODE=entra."
                )

            if not self.session_cookie_secure:
                raise ValueError(
                    "SESSION_COOKIE_SECURE must be true "
                    "in production."
                )

            if not self.entra_configured:
                raise ValueError(
                    "Microsoft Entra ID and SESSION_SECRET "
                    "must be configured in production."
                )

            if not self.data_api_bid_log_configured:
                raise ValueError(
                    "The Bid Log Riggs Data API client and "
                    "Cloudflare credentials must be configured "
                    "in production."
                )

        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()

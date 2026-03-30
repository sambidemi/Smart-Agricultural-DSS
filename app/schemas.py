from typing import Optional

from pydantic import BaseModel, Field, field_validator

# Input schema for ML crop recommendation.
class cropfeatures (BaseModel):
    nitrogen: float = Field(..., example = 50.0)
    phosphorus: float = Field(..., example = 30.0)
    potassium: float = Field(..., example = 20.0)
    temperature: float = Field(..., example = 25.0)
    humidity: float = Field(..., example = 80.0)
    ph: float = Field(..., example = 6.5)
    rainfall: float = Field(..., example = 200.0)

class ProfileUpdate(BaseModel):
    # User profile fields
    name: Optional[str] = None
    location: Optional[str] = None
    phone_number: Optional[str] = Field(default=None, max_length=15)
    profile_picture: Optional[str] = Field(default=None, max_length=255)

    # Farm profile fields
    farm_type: Optional[str] = None
    farm_size: Optional[float] = None
    soil_type: Optional[str] = None
    water_source: Optional[str] = None

    # Enforce Nigerian international phone format: +234XXXXXXXXXX
    @field_validator("phone_number")
    @classmethod
    def validate_phone_number(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value

        normalized = value.strip()
        if not normalized:
            return normalized

        if not normalized.startswith("+234"):
            raise ValueError("phone_number must start with +234")

        if len(normalized) != 14 or not normalized[1:].isdigit():
            raise ValueError("phone_number must be in format +234XXXXXXXXXX")

        return normalized

class pricefeatures (BaseModel):
    state: str = Field(..., example = "Lagos")
    LGA: str = Field(..., example = "Ikeja")
    market: str = Field(..., example = "Oshodi")
    pricetype: str = Field(..., example = "Retail")
    category: str = Field(..., example = "Grains")
    commodity: str = Field(..., example = "Maize")
    quantity: float = Field(..., example = 100.0)
    unit: str = Field(..., example = "kg")
    year: int = Field (..., example = '2025')
    month: str = Field (..., example = 'April')
    day:int = Field(..., example = 15)


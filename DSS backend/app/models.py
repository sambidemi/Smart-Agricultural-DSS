from datetime import datetime

from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime
from .database import Base

# User table stores account details and profile settings.
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    email = Column(String, unique=True)
    password = Column(String)
    location = Column(String)
    profile_picture = Column(String(255), nullable=True)
    phone_number = Column(String(15), nullable=False)


# FarmInfo table stores farm-specific profile data for each user.
class FarmInfo(Base):
    __tablename__ = "farm_info"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    farm_type = Column(String)
    farm_size = Column(Float)
    soil_type = Column(String)
    water_source = Column(String)


# CropInput records the features submitted for crop recommendation.
class CropInput(Base):
    __tablename__ = "crop_inputs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    nitrogen = Column(Float)
    phosphorus = Column(Float)
    potassium = Column(Float)
    temperature = Column(Float)
    humidity = Column(Float)
    ph = Column(Float)
    rainfall = Column(Float)
    agro_environmental_zone = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=True)


# RecommendedCrop stores the AI result associated with a CropInput.
class RecommendedCrop(Base):
    __tablename__ = "recommended_crops"

    id = Column(Integer, primary_key=True, index=True)
    crop_input_id = Column(Integer, ForeignKey("crop_inputs.id"))
    crop_name = Column(String)

# PriceInput stores market request details submitted by a user.
class PriceInput(Base):
    __tablename__ = "price_inputs"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    state = Column(String)
    # Use lowercase DB column name to avoid case-sensitive identifier issues.
    lga = Column("lga", String)
    market = Column(String)
    pricetype = Column(String)
    category = Column(String)
    commodity = Column(String)
    quantity = Column(Float)
    unit = Column(String)
    year = Column(Integer)
    month = Column(Integer)
    day = Column(Integer)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=True)

# PricePrediction stores the predicted price result for a PriceInput.
class PricePrediction(Base):
    __tablename__ = "predicted_prices"
    id = Column(Integer, primary_key=True, index=True)
    price_input_id = Column(Integer, ForeignKey("price_inputs.id"))
    predicted_price = Column(Float)

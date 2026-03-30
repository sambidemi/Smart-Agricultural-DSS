from pathlib import Path
import re
from uuid import uuid4
from datetime import datetime

import joblib
import pandas as pd
from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from .auth import hash_password, verify_password
from .database import get_db
from .models import CropInput, FarmInfo, RecommendedCrop, User, PriceInput, PricePrediction
from .schemas import ProfileUpdate, cropfeatures, pricefeatures
from .token import create_access_token, get_current_user


app = FastAPI()
BASE_DIR = Path(__file__).resolve().parent
UPLOADS_DIR = BASE_DIR / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)

# CORS allows browser-based frontend apps (different origin) to call this API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5500",
        "http://localhost:5500",
        "http://127.0.0.1:3000",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Expose uploaded profile images as static files under /uploads/*
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")


@app.post("/signup")
def signup(
    name: str,
    email: str,
    password: str,
    location: str,
    farm_type: str,
    farm_size: float,
    soil_type: str,
    water_source: str,
    db: Session = Depends(get_db),
):
    # Creates user + farm record in one DB transaction.
    try:
        existing_user = db.query(User).filter(User.email == email).first()
        if existing_user:
            raise HTTPException(status_code=400, detail="Email already exists")

        hashed_password = hash_password(password)

        new_user = User(
            name=name,
            email=email,
            password=hashed_password,
            location=location,
            phone_number="+2340000000000",
            profile_picture=None,
        )

        db.add(new_user)
        # Flush writes pending INSERT so new_user.id is available
        # before final commit.
        db.flush()

        farm = FarmInfo(
            user_id=new_user.id,
            farm_type=farm_type,
            farm_size=farm_size,
            soil_type=soil_type,
            water_source=water_source,
        )
        db.add(farm)

        db.commit()
        return {"message": "Signup successful"}
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/login")
def login(email: str, password: str, db: Session = Depends(get_db)):
    # Verifies credentials and returns a JWT for protected endpoints.
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=400, detail="User not found")

    if not verify_password(password, user.password):
        raise HTTPException(status_code=400, detail="Invalid password")

    access_token = create_access_token(data={"user_id": user.id})
    return {
        "message": "Login successful",
        "access_token": access_token,
        "token_type": "bearer",
    }


@app.get("/dashboard")
def get_user_details(
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Returns combined user + farm profile payload used by frontend dashboard.
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    farm = db.query(FarmInfo).filter(FarmInfo.user_id == user_id).first()

    return {
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "location": user.location,
            "phone_number": user.phone_number,
            "profile_picture": user.profile_picture,
        },
        "farm_info": {
            "farm_type": farm.farm_type if farm else None,
            "farm_size": farm.farm_size if farm else None,
            "soil_type": farm.soil_type if farm else None,
            "water_source": farm.water_source if farm else None,
        },
    }


# Load ML artifacts once at startup for faster inference requests.

#crop models
agro_zone_encoder = joblib.load(BASE_DIR / "models" / "agro_zone_encoder.pkl")
agro_zone_model = joblib.load(BASE_DIR / "models" / "agro_zone_model.pkl")
crop_encoder = joblib.load(BASE_DIR / "models" / "crop_encoder.pkl")
crop_model = joblib.load(BASE_DIR / "models" / "crop_model.pkl")

#price models
category_encoder = joblib.load (BASE_DIR / "models"/  "category_encoder.pkl")
commodity_encoder = joblib.load (BASE_DIR / "models"/"commodity_encoder.pkl")
LGA_encoder = joblib.load (BASE_DIR / "models"/"LGA_encoder.pkl")
market_encoder = joblib.load (BASE_DIR / "models"/"market_encoder.pkl")
month_encoder = joblib.load (BASE_DIR / "models"/ "month_encoder.pkl")
pricetype_encoder = joblib.load (BASE_DIR / "models"/ "pricetype_encoder.pkl")
state_encoder = joblib.load (BASE_DIR / "models"/ "state_encoder.pkl")
unit_encoder = joblib.load (BASE_DIR / "models"/ "unit_encoder.pkl")
price_model = joblib.load (BASE_DIR / "models"/"decision_tree_regressor.pkl")
market_locations_df = pd.read_csv(BASE_DIR / "data" / "market_locations.csv")



# Crop Recommendation Endpoint

@app.post("/recommend-crop")
async def recommend_crop(
    features: cropfeatures,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user),
):
    # Predict agro zone + recommended crop, then persist request/output history.
    try:
        features_dict = {
            "nitrogen": features.nitrogen,
            "phosphorus": features.phosphorus,
            "pottasium": features.potassium,
            "temperature": features.temperature,
            "humidity": features.humidity,
            "ph": features.ph,
            "rainfall": features.rainfall,
        }
        input_df = pd.DataFrame([features_dict])

        # Predict agro-environmental zone first, then use that as an additional feature for crop prediction.
        agro_zone_encoded = agro_zone_model.predict(input_df)[0]
        agro_zone_display = agro_zone_encoder.inverse_transform([agro_zone_encoded])[0]

        input_df["agro_environmental_zone"] = agro_zone_encoded

        # predict recommended crop and decode to display label
        crop_encoded = crop_model.predict(input_df)[0]
        crop_prediction_display = crop_encoder.inverse_transform([crop_encoded])[0]

        crop_input = CropInput(
            user_id=user_id,
            nitrogen=features.nitrogen,
            phosphorus=features.phosphorus,
            potassium=features.potassium,
            temperature=features.temperature,
            humidity=features.humidity,
            ph=features.ph,
            rainfall=features.rainfall,
            agro_environmental_zone=agro_zone_display,
        )
        db.add(crop_input)
        db.flush()

        recommendation = RecommendedCrop(
            crop_input_id=crop_input.id,
            crop_name=crop_prediction_display,
        )
        db.add(recommendation)
        db.commit()

        return {
            "agro_zone": agro_zone_display,
            "recommended_crop": crop_prediction_display,
        }
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/recommend-crop/latest-session")
def get_latest_recommendations(
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Returns only the latest recommendation record for the logged-in user.
    # This keeps Crop Recommendation page focused on the most recent session.
    try:
        row = (
            db.query(CropInput, RecommendedCrop)
            .join(RecommendedCrop, RecommendedCrop.crop_input_id == CropInput.id)
            .filter(CropInput.user_id == user_id)
            .order_by(CropInput.id.desc())
            .first()
        )

        if not row:
            return {"latest_recommendation": None}

        crop_input, recommendation = row
        return {
            "latest_recommendation": {
                "crop_input_id": crop_input.id,
                "features": {
                    "nitrogen": crop_input.nitrogen,
                    "phosphorus": crop_input.phosphorus,
                    "potassium": crop_input.potassium,
                    "temperature": crop_input.temperature,
                    "humidity": crop_input.humidity,
                    "ph": crop_input.ph,
                    "rainfall": crop_input.rainfall,
                },
                "agro_zone": crop_input.agro_environmental_zone,
                "recommended_crop": recommendation.crop_name,
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/update-profile")
async def update_profile(
    payload: ProfileUpdate,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Updates both user profile and farm profile in one endpoint.
    # Fields are optional; only provided fields are updated.
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        updates = payload.model_dump(exclude_unset=True)

        if "phone_number" in updates and not updates["phone_number"]:
            raise HTTPException(status_code=400, detail="phone_number cannot be empty")

        user_fields = {"name", "location", "phone_number", "profile_picture"}
        farm_fields = {"farm_type", "farm_size", "soil_type", "water_source"}

        for field_name, field_value in updates.items():
            if field_name in user_fields:
                setattr(user, field_name, field_value)

        farm = db.query(FarmInfo).filter(FarmInfo.user_id == user_id).first()
        if not farm and any(field in updates for field in farm_fields):
            # Create farm record if missing and client sends farm updates.
            farm = FarmInfo(user_id=user_id)
            db.add(farm)

        if farm:
            for field_name, field_value in updates.items():
                if field_name in farm_fields:
                    setattr(farm, field_name, field_value)

        if "farm_size" in updates and updates["farm_size"] is not None and updates["farm_size"] <= 0:
            raise HTTPException(status_code=400, detail="farm_size must be greater than 0")

        db.commit()
        db.refresh(user)
        if farm:
            db.refresh(farm)

        return {
            "message": "Profile updated successfully",
            "user": {
                "id": user.id,
                "name": user.name,
                "email": user.email,
                "location": user.location,
                "phone_number": user.phone_number,
                "profile_picture": user.profile_picture,
            },
            "farm_info": {
                "farm_type": farm.farm_type if farm else None,
                "farm_size": farm.farm_size if farm else None,
                "soil_type": farm.soil_type if farm else None,
                "water_source": farm.water_source if farm else None,
            },
        }
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/upload-profile-picture")
async def upload_profile_picture(
    profile_picture: UploadFile = File(...),
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Handles profile image upload, stores file locally, saves public path on user.
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        if not profile_picture.content_type or not profile_picture.content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail="Only image uploads are allowed")

        file_bytes = await profile_picture.read()
        if len(file_bytes) > 5 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="Image size must not exceed 5MB")

        suffix = Path(profile_picture.filename or "").suffix.lower() or ".jpg"
        filename = f"user_{user_id}_{uuid4().hex}{suffix}"
        save_path = UPLOADS_DIR / filename
        save_path.write_bytes(file_bytes)

        public_path = f"/uploads/{filename}"
        user.profile_picture = public_path
        db.commit()
        db.refresh(user)

        return {
            "message": "Profile picture uploaded successfully",
            "profile_picture": user.profile_picture,
        }
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/predict-price")
async def predict_price(
    features: pricefeatures,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user),
):
    # Predict crop market price from categorical + geo + calendar features.
    try:
        # Resolve latitude/longitude from market_locations.csv by market value.
        market_matches = market_locations_df[
            market_locations_df["market"].astype(str).str.strip().str.lower()
            == str(features.market).strip().lower()
        ]
        if market_matches.empty:
            raise HTTPException(
                status_code=400,
                detail=f"Market '{features.market}' not found in market_locations.csv",
            )

        latitude = float(market_matches.iloc[0]["latitude"])
        longitude = float(market_matches.iloc[0]["longitude"])

        try:
            # Map UI-friendly unit values to the exact labels used in model training.
            unit_mapping = {
                "millilitres": "ML",
                "liters": "L",
                "grams": "G",
                "kilograms": "KG",
                "ml": "ML",
                "l": "L",
                "g": "G",
                "kg": "KG",
            }
            normalized_unit = unit_mapping.get(str(features.unit).strip().lower(), str(features.unit).strip())

            features_dict = {
                "state": int(state_encoder.transform([features.state])[0]),
                "LGA": int(LGA_encoder.transform([features.LGA])[0]),
                "market": int(market_encoder.transform([features.market])[0]),
                "latitude": latitude,
                "longitude": longitude,
                "pricetype": int(pricetype_encoder.transform([features.pricetype])[0]),
                "category": int(category_encoder.transform([features.category])[0]),
                "commodity": int(commodity_encoder.transform([features.commodity])[0]),
                "quantity": features.quantity,
                "unit": int(unit_encoder.transform([normalized_unit])[0]),
                "year": features.year,
                "month": int(month_encoder.transform([features.month])[0]),
            }
        except Exception as e:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid categorical value supplied: {str(e)}",
            )

        # Keep strict training order:
        # [state, LGA, market, latitude, longitude, pricetype, category, commodity, quantity, unit, year, month]
        feature_order = [
            "state",
            "LGA",
            "market",
            "latitude",
            "longitude",
            "pricetype",
            "category",
            "commodity",
            "quantity",
            "unit",
            "year",
            "month",
        ]
        input_df = pd.DataFrame([features_dict], columns=feature_order)
        predicted_price_raw = float(price_model.predict(input_df)[0])
        # Approximate prediction to the nearest ten for cleaner pricing output.
        predicted_price = float(round(predicted_price_raw / 10) * 10)

        price_input = PriceInput(
            user_id=user_id,
            state=features.state,
            lga=features.LGA,
            market=features.market,
            pricetype=features.pricetype,
            category=features.category,
            commodity=features.commodity,
            quantity=features.quantity,
            unit= features.unit,
            year=features.year,
            month=int(features_dict["month"]),
            day=features.day,
        )
        db.add(price_input)
        db.flush()

        prediction = PricePrediction(
            price_input_id=price_input.id,
            predicted_price=predicted_price,
        )
        db.add(prediction)
        db.commit()

        return {
            "predicted_price": predicted_price,
            "market": features.market,
            "latitude": latitude,
            "longitude": longitude,
        }
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/predict-price/latest-session")
def get_latest_price_prediction(
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Returns only the latest saved price prediction for the logged-in user.
    try:
        row = (
            db.query(PriceInput, PricePrediction)
            .join(PricePrediction, PricePrediction.price_input_id == PriceInput.id)
            .filter(PriceInput.user_id == user_id)
            .order_by(PriceInput.id.desc())
            .first()
        )

        if not row:
            return {"latest_prediction": None}

        price_input, prediction = row

        month_to_num = {
            "january": 1,
            "february": 2,
            "march": 3,
            "april": 4,
            "may": 5,
            "june": 6,
            "july": 7,
            "august": 8,
            "september": 9,
            "october": 10,
            "november": 11,
            "december": 12,
        }

        # Reconstruct month robustly for both legacy and current records.
        month_label = None
        month_num = None
        stored_month = price_input.month

        # Case 1: month already stored as calendar month number (1-12).
        if isinstance(stored_month, int) and 1 <= stored_month <= 12:
            month_num = stored_month
            month_label = datetime(2000, month_num, 1).strftime("%B")
        else:
            # Case 2: month stored as encoder index.
            try:
                decoded_month = month_encoder.inverse_transform([stored_month])[0]
                month_label = str(decoded_month)
                month_num = month_to_num.get(month_label.strip().lower())
            except Exception:
                # Case 3: fallback to parseable numeric/string month values.
                try:
                    maybe_month_num = int(stored_month)
                    if 1 <= maybe_month_num <= 12:
                        month_num = maybe_month_num
                        month_label = datetime(2000, month_num, 1).strftime("%B")
                except Exception:
                    month_label = str(stored_month)
                    month_num = month_to_num.get(month_label.strip().lower())

        date_value = None
        if month_num and price_input.day and price_input.year:
            try:
                date_value = datetime(price_input.year, month_num, price_input.day).strftime("%Y-%m-%d")
            except Exception:
                date_value = None

        return {
            "latest_prediction": {
                "price_input_id": price_input.id,
                "features": {
                    "state": price_input.state,
                    "LGA": price_input.lga,
                    "market": price_input.market,
                    "pricetype": price_input.pricetype,
                    "category": price_input.category,
                    "commodity": price_input.commodity,
                    "quantity": price_input.quantity,
                    "unit": price_input.unit,
                    "year": price_input.year,
                    "month": month_label,
                    "day": price_input.day,
                    "date": date_value,
                },
                "predicted_price": prediction.predicted_price,
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

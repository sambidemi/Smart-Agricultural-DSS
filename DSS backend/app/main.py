from pathlib import Path
import json
import math
import os
import urllib.parse
import urllib.request
from uuid import uuid4
from datetime import datetime

import joblib
import pandas as pd
from dotenv import load_dotenv
from fastapi import Body, Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.orm import Session
from jose import jwt

from .auth import hash_password, verify_password
from .database import get_db, engine, init_db
from .models import CropInput, FarmInfo, RecommendedCrop, User, PriceInput, PricePrediction
from .schemas import ProfileUpdate, cropfeatures, pricefeatures, marketanalysisfeatures
from .token_utils import create_access_token, get_current_user

# Load environment variables from .env file if it exists
load_dotenv()

# Create FastAPI application instance and configure uploads directory.
# UPLOADS_DIR stores user-uploaded profile images for later delivery through /uploads.
app = FastAPI()
BASE_DIR = Path(__file__).resolve().parent
UPLOADS_DIR = Path(os.getenv("UPLOADS_DIR", BASE_DIR / "uploads"))
UPLOADS_DIR.mkdir(exist_ok=True)

# CORS allows browser-based frontend apps (different origin) to call this API.
app.add_middleware(
    CORSMiddleware,
    # Local development mode: allow any origin so the frontend can reach the backend
    # regardless of whether the page is opened from a server or direct filesystem.
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# OAuth provider configuration. Set these in environment variables for real provider integration.
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "").strip()
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "").strip()
APPLE_CLIENT_ID = os.getenv("APPLE_CLIENT_ID", "").strip()
APPLE_TEAM_ID = os.getenv("APPLE_TEAM_ID", "").strip()
APPLE_KEY_ID = os.getenv("APPLE_KEY_ID", "").strip()
APPLE_PRIVATE_KEY = os.getenv("APPLE_PRIVATE_KEY", "").strip()
FRONTEND_OAUTH_REDIRECT = os.getenv("FRONTEND_OAUTH_REDIRECT", "https://agrosense-smart-agricultural-dss.vercel.app/oauth-callback.html").strip()


@app.get("/")
def health_check():
    return {
        "message": "AgroSense backend API is running",
        "status": "ok",
        "docs": "/docs",
    }


def _urlencode(data: dict) -> bytes:
    # Prepare form-encoded body for OAuth token exchanges.
    return urllib.parse.urlencode(data).encode()


def _http_request(url: str, data: bytes = None, headers: dict = None, method: str = "GET") -> dict:
    # Perform a basic HTTP request and parse a JSON response.
    # Used for communicating with external OAuth providers.
    request = urllib.request.Request(url, data=data, headers=headers or {}, method=method)
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return json.loads(response.read().decode())
    except urllib.error.HTTPError as exc:
        try:
            body = exc.read().decode()
            return json.loads(body)
        except Exception:
            raise HTTPException(status_code=502, detail=f"OAuth provider error: {exc.reason}")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"OAuth request failed: {exc}")


def _create_social_redirect(user: User, db: Session, provider: str) -> RedirectResponse:
    # Generate a JWT token for the authenticated user and redirect back to frontend.
    access_token = create_access_token(data={"user_id": user.id})
    redirect_url = f"{FRONTEND_OAUTH_REDIRECT}?token={urllib.parse.quote(access_token)}&provider={provider}"
    return RedirectResponse(url=redirect_url)


def _create_or_get_user(email: str, name: str, provider: str, db: Session, profile_picture: str = None) -> User:
    # Find an existing user by email or create a new account from social login details.
    # This lets the backend reuse accounts if a social email already exists.
    if not email:
        raise HTTPException(status_code=400, detail="Social provider did not return an email address")

    user = db.query(User).filter(User.email == email).first()
    if user:
        return user

    user = User(
        name=name or email.split("@")[0],
        email=email,
        password=hash_password(str(uuid4())),
        location="Unknown",
        phone_number="+2340000000000",
        profile_picture=profile_picture,
    )
    db.add(user)
    db.flush()

    farm = FarmInfo(
        user_id=user.id,
        farm_type="Unknown",
        farm_size=0.0,
        soil_type="Unknown",
        water_source="Unknown",
    )
    db.add(farm)
    db.commit()
    return user


def _create_apple_client_secret() -> str:
    # Build a JWT client secret for Apple Sign-In.
    if not APPLE_CLIENT_ID or not APPLE_TEAM_ID or not APPLE_KEY_ID or not APPLE_PRIVATE_KEY:
        raise HTTPException(status_code=500, detail="Apple OAuth credentials are not configured")

    private_key = APPLE_PRIVATE_KEY.replace("\\n", "\n")
    now = int(datetime.utcnow().timestamp())
    claims = {
        "iss": APPLE_TEAM_ID,
        "iat": now,
        "exp": now + 15777000,  # six months in seconds
        "aud": "https://appleid.apple.com",
        "sub": APPLE_CLIENT_ID,
    }
    return jwt.encode(claims, private_key, algorithm="ES256", headers={"kid": APPLE_KEY_ID})


def _decode_apple_id_token(id_token: str) -> dict:
    # Decode Apple ID token payload without verifying signature in this basic implementation.
    # Note: this is not secure enough for production because signature verification is skipped.
    return jwt.decode(id_token, key="", algorithms=["RS256"], options={"verify_signature": False})

# Expose uploaded profile images as static files under /uploads/*
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")


@app.on_event("startup")
def create_database_tables():
    init_db()


@app.on_event("startup")
def ensure_history_timestamp_columns():
    # Keeps legacy databases compatible with history table rendering.
    with engine.begin() as connection:
        connection.execute(
            text("ALTER TABLE crop_inputs ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP")
        )
        connection.execute(
            text("ALTER TABLE price_inputs ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP")
        )


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
    # Create a new user account and farm profile entry in a single transaction.
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
    # Verify user credentials and return a signed JWT access token.
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


@app.post("/social-login")
def social_login(provider: str = Body(...), db: Session = Depends(get_db)):
    # Creates or reuses a placeholder account for social sign-in.
    # Useful for testing OAuth button behavior without full provider setup.
    # This supports local development and allows the frontend buttons to work.
    provider_name = provider.strip().lower()
    if provider_name not in {"google", "apple"}:
        raise HTTPException(status_code=400, detail="Invalid social provider")

    if provider_name == "google":
        email = "google-user@agrosense.local"
        name = "Google User"
    else:
        email = "apple-user@agrosense.local"
        name = "Apple User"

    user = db.query(User).filter(User.email == email).first()
    if not user:
        user = User(
            name=name,
            email=email,
            password=hash_password(str(uuid4())),
            location="Unknown",
            phone_number="+2340000000000",
            profile_picture=None,
        )
        db.add(user)
        db.flush()

        farm = FarmInfo(
            user_id=user.id,
            farm_type="Unknown",
            farm_size=0.0,
            soil_type="Unknown",
            water_source="Unknown",
        )
        db.add(farm)
        db.commit()

    access_token = create_access_token(data={"user_id": user.id})
    return {
        "message": "Social login successful",
        "access_token": access_token,
        "token_type": "bearer",
    }


@app.get("/auth/google")
def google_auth(request: Request):
    # Initiates Google OAuth flow by redirecting to Google's authorization endpoint.
    # The user will be sent to Google, then redirected back to /auth/google/callback.
    if not GOOGLE_CLIENT_ID or GOOGLE_CLIENT_ID.strip() == "":
        raise HTTPException(
            status_code=500,
            detail="Google OAuth is not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your .env file. Get credentials from https://console.developers.google.com/"
        )

    # Use the backend callback URL as the redirect URI so Google will send
    # the authorization code to this server endpoint for secure token exchange.
    redirect_uri = str(request.url_for("google_auth_callback"))
    redirect_uri = redirect_uri.replace("http://", "https://", 1)

    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "prompt": "consent",
    }
    auth_url = f"https://accounts.google.com/o/oauth2/v2/auth?{urllib.parse.urlencode(params)}"
    return RedirectResponse(url=auth_url)


@app.get("/auth/google/debug")
def google_auth_debug(request: Request):
    """Return the Google authorization URL as JSON for debugging.

    Open this in your browser and inspect the `redirect_uri` query
    parameter to confirm it matches what's registered in Google Cloud Console.
    """
    redirect_uri = str(request.url_for('google_auth_callback'))
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "prompt": "consent",
    }
    auth_url = f"https://accounts.google.com/o/oauth2/v2/auth?{urllib.parse.urlencode(params)}"
    return {"auth_url": auth_url, "redirect_uri": redirect_uri}


@app.get("/auth/google/callback")
def google_auth_callback(code: str, request: Request, db: Session = Depends(get_db)):
    # Handles the OAuth callback from Google, exchanges the authorization code for access tokens,
    # retrieves Google user info, and creates or updates the corresponding local user record.
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET or GOOGLE_CLIENT_ID.strip() == "" or GOOGLE_CLIENT_SECRET.strip() == "":
        raise HTTPException(
            status_code=500,
            detail="Google OAuth is not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your .env file."
        )

    # Exchange authorization code for access token
    # Use the same redirect_uri value that was sent to Google when initiating
    # the flow (the backend callback URL).
    redirect_uri = str(request.url_for("google_auth_callback"))
    redirect_uri = redirect_uri.replace("http://", "https://", 1)

    token_data = _http_request(
        "https://oauth2.googleapis.com/token",
        data=_urlencode({
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": redirect_uri,
        }),
        method="POST",
    )

    if "error" in token_data:
        raise HTTPException(status_code=400, detail=f"Google OAuth error: {token_data['error']}")

    # Get user info from Google
    user_info = _http_request(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        headers={"Authorization": f"Bearer {token_data['access_token']}"},
    )

    # Create or get user account
    user = _create_or_get_user(
        email=user_info.get("email"),
        name=user_info.get("name"),
        provider="google",
        db=db,
        profile_picture=user_info.get("picture"),
    )

    return _create_social_redirect(user, db, "google")


@app.get("/auth/apple")
def apple_auth():
    # Initiates Apple Sign-In flow by redirecting to Apple's authorization endpoint.
    # The backend constructs the Apple authorization URL and sends the browser to it.
    if not APPLE_CLIENT_ID or APPLE_CLIENT_ID.strip() == "":
        raise HTTPException(
            status_code=500,
            detail="Apple OAuth is not configured. Please set APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID, and APPLE_PRIVATE_KEY in your .env file. Get credentials from https://developer.apple.com/account/"
        )

    params = {
        "client_id": APPLE_CLIENT_ID,
        "redirect_uri": f"{FRONTEND_OAUTH_REDIRECT}/apple",
        "response_type": "code id_token",
        "scope": "name email",
        "response_mode": "form_post",
    }
    auth_url = f"https://appleid.apple.com/auth/authorize?{urllib.parse.urlencode(params)}"
    return RedirectResponse(url=auth_url)


@app.post("/auth/apple/callback")
def apple_auth_callback(
    code: str = Form(...),
    id_token: str = Form(...),
    user: str = Form(None),
    db: Session = Depends(get_db),
):
    # Handles the OAuth callback from Apple, validates the ID token, and creates/updates user.
    if not APPLE_CLIENT_ID or not APPLE_TEAM_ID or APPLE_CLIENT_ID.strip() == "" or APPLE_TEAM_ID.strip() == "":
        raise HTTPException(
            status_code=500,
            detail="Apple OAuth is not configured. Please set APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID, and APPLE_PRIVATE_KEY in your .env file."
        )

    # Decode the ID token to get user info
    try:
        decoded_token = _decode_apple_id_token(id_token)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid Apple ID token: {e}")

    # Extract user info from ID token
    email = decoded_token.get("email")
    name = decoded_token.get("name") or decoded_token.get("preferred_username")

    # If user info is in the form data (first-time sign-in), parse it
    if user:
        try:
            user_data = json.loads(user)
            if user_data.get("name"):
                name = f"{user_data['name'].get('firstName', '')} {user_data['name'].get('lastName', '')}".strip()
        except Exception:
            pass  # Ignore parsing errors

    # Create or get user account
    user_obj = _create_or_get_user(
        email=email,
        name=name,
        provider="apple",
        db=db,
    )

    return _create_social_redirect(user_obj, db, "apple")


@app.get("/dashboard")
def get_user_details(
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Return the authenticated user's profile details and farm information.
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
def round_up_to_tens(value: float) -> float:
    return float(math.ceil(float(value) / 10) * 10)


def normalize_text(value: str) -> str:
    return str(value).strip().lower()


def normalize_market_unit(value: str) -> str:
    unit_mapping = {
        "millilitres": "ml",
        "milliliters": "ml",
        "ml": "ml",
        "liters": "l",
        "litres": "l",
        "l": "l",
        "grams": "g",
        "gram": "g",
        "g": "g",
        "kilograms": "kg",
        "kilogram": "kg",
        "kg": "kg",
    }
    return unit_mapping.get(normalize_text(value), normalize_text(value))


# Crop Recommendation Endpoint

@app.post("/recommend-crop")
async def recommend_crop(
    features: cropfeatures,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user),
):
    # Predict agro zone and recommended crop from the submitted environmental features.
    # This endpoint also saves the input and the recommendation to the database.
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
                "created_at": crop_input.created_at.isoformat() if crop_input.created_at else None,
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/recommend-crop/history")
def get_recommendation_history(
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Returns full recommendation history for the logged-in user.
    try:
        rows = (
            db.query(CropInput, RecommendedCrop)
            .join(RecommendedCrop, RecommendedCrop.crop_input_id == CropInput.id)
            .filter(CropInput.user_id == user_id)
            .order_by(CropInput.id.desc())
            .all()
        )

        history = []
        for crop_input, recommendation in rows:
            history.append(
                {
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
                    "created_at": crop_input.created_at.isoformat() if crop_input.created_at else None,
                }
            )

        return {"history": history}
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
    # Predict crop market price from categorical, location, and date features.
    # It also saves the request parameters and predicted price as history.
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

        # Case 1: month already stored as a calendar month number (1-12).
        if isinstance(stored_month, int) and 1 <= stored_month <= 12:
            month_num = stored_month
            month_label = datetime(2000, month_num, 1).strftime("%B")
        elif isinstance(stored_month, int) and 0 <= stored_month <= 11:
            # Case 2: month stored as a 0-based encoder index.
            month_num = stored_month + 1
            month_label = datetime(2000, month_num, 1).strftime("%B")
        else:
            # Case 3: month stored as encoder index or a string label.
            try:
                decoded_month = month_encoder.inverse_transform([stored_month])[0]
                month_label = str(decoded_month)
                month_num = month_to_num.get(month_label.strip().lower())
            except Exception:
                # Case 4: fallback to parseable numeric/string month values.
                try:
                    maybe_month_num = int(stored_month)
                    if 1 <= maybe_month_num <= 12:
                        month_num = maybe_month_num
                        month_label = datetime(2000, month_num, 1).strftime("%B")
                    elif 0 <= maybe_month_num <= 11:
                        month_num = maybe_month_num + 1
                        month_label = datetime(2000, month_num, 1).strftime("%B")
                except Exception:
                    month_label = str(stored_month)
                    month_num = month_to_num.get(month_label.strip().lower())

        date_value = None
        if month_num is not None and price_input.day is not None and price_input.year is not None:
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
                "created_at": price_input.created_at.isoformat() if price_input.created_at else None,
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/predict-price/history")
def get_price_prediction_history(
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Returns full price prediction history for the logged-in user.
    try:
        rows = (
            db.query(PriceInput, PricePrediction)
            .join(PricePrediction, PricePrediction.price_input_id == PriceInput.id)
            .filter(PriceInput.user_id == user_id)
            .order_by(PriceInput.id.desc())
            .all()
        )

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

        history = []
        for price_input, prediction in rows:
            month_label = None
            month_num = None
            stored_month = price_input.month

            if isinstance(stored_month, int) and 1 <= stored_month <= 12:
                month_num = stored_month
                month_label = datetime(2000, month_num, 1).strftime("%B")
            elif isinstance(stored_month, int) and 0 <= stored_month <= 11:
                month_num = stored_month + 1
                month_label = datetime(2000, month_num, 1).strftime("%B")
            else:
                try:
                    decoded_month = month_encoder.inverse_transform([stored_month])[0]
                    month_label = str(decoded_month)
                    month_num = month_to_num.get(month_label.strip().lower())
                except Exception:
                    try:
                        maybe_month_num = int(stored_month)
                        if 1 <= maybe_month_num <= 12:
                            month_num = maybe_month_num
                            month_label = datetime(2000, month_num, 1).strftime("%B")
                        elif 0 <= maybe_month_num <= 11:
                            month_num = maybe_month_num + 1
                            month_label = datetime(2000, month_num, 1).strftime("%B")
                    except Exception:
                        month_label = str(stored_month)
                        month_num = month_to_num.get(month_label.strip().lower())

            date_value = None
            if month_num is not None and price_input.day is not None and price_input.year is not None:
                try:
                    date_value = datetime(price_input.year, month_num, price_input.day).strftime("%Y-%m-%d")
                except Exception:
                    date_value = None

            history.append(
                {
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
                    "created_at": price_input.created_at.isoformat() if price_input.created_at else None,
                }
            )

        return {"history": history}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
  

@app.post("/market-analysis")
async def market_analysis(
    features: marketanalysisfeatures,
):
    # Aggregate historical market data for a selected commodity/year/pricetype/quantity/unit.
    try:
        normalized_unit = normalize_market_unit(features.unit)
        normalized_quantity = round(float(features.quantity), 10)
        market_analysis_df = pd.read_csv(BASE_DIR / "data" / "filtered_crop.csv")
        filtered_df = market_analysis_df.copy()
        price_column = "price (NGN)"

        if price_column not in filtered_df.columns:
            raise HTTPException(status_code=500, detail="Price column not found in market analysis dataset")

        filtered_df["commodity_normalized"] = filtered_df["commodity"].astype(str).map(normalize_text)
        filtered_df["pricetype_normalized"] = filtered_df["pricetype"].astype(str).map(normalize_text)
        filtered_df["unit_normalized"] = filtered_df["unit"].astype(str).map(normalize_market_unit)
        filtered_df["quantity"] = pd.to_numeric(filtered_df["quantity"], errors="coerce")
        filtered_df["month"] = filtered_df["month"].astype(str).str.strip()
        filtered_df["year"] = pd.to_numeric(filtered_df["year"], errors="coerce")
        filtered_df[price_column] = pd.to_numeric(filtered_df[price_column], errors="coerce")

        filtered_df = filtered_df.dropna(subset=["year", price_column, "quantity"])
        filtered_df["quantity"] = filtered_df["quantity"].round(10)
        filtered_df["year"] = filtered_df["year"].astype(int)

        filtered_df = filtered_df[
            (filtered_df["commodity_normalized"] == normalize_text(features.commodity))
            & (filtered_df["pricetype_normalized"] == normalize_text(features.pricetype))
            & (filtered_df["year"] == features.year)
            & (filtered_df["quantity"] == normalized_quantity)
            & (filtered_df["unit_normalized"] == normalized_unit)
        ]

        if filtered_df.empty:
            raise HTTPException(
                status_code=404,
                detail="No market analysis data found for the selected commodity, pricetype, year, quantity, and unit",
            )

        month_order = [
            "January",
            "February",
            "March",
            "April",
            "May",
            "June",
            "July",
            "August",
            "September",
            "October",
            "November",
            "December",
        ]

        average_price_per_month = []
        monthly_averages = filtered_df.groupby("month", as_index=False)[price_column].mean()
        monthly_averages["month"] = pd.Categorical(
            monthly_averages["month"],
            categories=month_order,
            ordered=True,
        )
        monthly_averages = monthly_averages.sort_values("month")
        for row in monthly_averages.itertuples(index=False):
            average_price_per_month.append(
                {
                    "month": row.month,
                    "average_price": round_up_to_tens(row[1]),
                }
            )

        average_price_across_states = []
        state_averages = (
            filtered_df.groupby("state", as_index=False)[price_column]
            .mean()
            .sort_values("state")
        )
        for row in state_averages.itertuples(index=False):
            average_price_across_states.append(
                {
                    "state": row.state,
                    "average_price": round_up_to_tens(row[1]),
                }
            )

        average_price_across_markets = []
        market_averages = (
            filtered_df.groupby(["state", "market"], as_index=False)[price_column]
            .mean()
            .sort_values(["state", "market"])
        )
        for row in market_averages.itertuples(index=False):
            average_price_across_markets.append(
                {
                    "state": row.state,
                    "market": row.market,
                    "average_price": round_up_to_tens(row[2]),
                }
            )

        total_markets = int(filtered_df["market"].nunique())

        return {
            "commodity": features.commodity,
            "pricetype": features.pricetype,
            "year": features.year,
            "quantity": normalized_quantity,
            "unit": features.unit,
            "total_markets": total_markets,
            "average_price_per_month": average_price_per_month,
            "average_price_across_states": average_price_across_states,
            "average_price_across_markets": average_price_across_markets,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


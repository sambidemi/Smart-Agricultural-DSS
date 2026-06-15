# AgroSense Backend

A FastAPI backend for the AgroSense agricultural decision support system, featuring crop recommendations, price forecasting, and social authentication.

## Features

- **Crop Recommendation Engine**: ML-powered crop suggestions based on soil, environmental, and weather data
- **Price Forecasting**: Market price predictions using historical data
- **User Authentication**: JWT-based auth with social login (Google & Apple)
- **Farm Profile Management**: Store and manage farm details
- **Historical Tracking**: Keep records of recommendations and predictions

## Setup

### Prerequisites

- Python 3.8+
- PostgreSQL database
- Google OAuth credentials (optional)
- Apple Sign-In credentials (optional)

### Installation

1. Clone the repository and navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Create a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Set up the database:
   - Create a PostgreSQL database
   - Update `app/database.py` with your database URL

5. Run database migrations:
   ```bash
   alembic upgrade head
   ```

### OAuth Setup (Optional)

To enable Google and Apple Sign-In:

1. Copy the environment template:
   ```bash
   cp .env.example .env
   ```

2. **Google OAuth Setup**:
   - Go to [Google Cloud Console](https://console.developers.google.com/)
   - Create a new project or select existing one
   - Enable the Google+ API
   - Create OAuth 2.0 credentials
   - Add your domain to authorized origins
   - Set redirect URI to: `http://127.0.0.1:5500/oauth-callback.html/google`
   - Update `.env` with your `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`

3. **Apple Sign-In Setup**:
   - Go to [Apple Developer Account](https://developer.apple.com/account/)
   - Create an App ID with Sign In with Apple capability
   - Create a Services ID for web authentication
   - Generate a private key
   - Set redirect URI to: `http://127.0.0.1:5500/oauth-callback.html/apple`
   - Update `.env` with your Apple credentials:
     - `APPLE_CLIENT_ID`: Your Services ID
     - `APPLE_TEAM_ID`: Your Apple Developer Team ID
     - `APPLE_KEY_ID`: Your private key ID
     - `APPLE_PRIVATE_KEY`: Your private key content (with \\n for line breaks)

4. **Frontend Redirect URL**:
   - Update `FRONTEND_OAUTH_REDIRECT` in `.env` to match your frontend URL
   - For local development: `http://127.0.0.1:5500/oauth-callback.html`

### Running the Server

Start the development server:
```bash
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

The API will be available at `http://127.0.0.1:8000`

### API Documentation

Once running, visit `http://127.0.0.1:8000/docs` for interactive API documentation.

## API Endpoints

### Authentication
- `POST /signup` - User registration
- `POST /login` - User login
- `POST /social-login` - Placeholder social login (for testing)
- `GET /auth/google` - Initiate Google OAuth
- `GET /auth/google/callback` - Google OAuth callback
- `GET /auth/apple` - Initiate Apple Sign-In
- `POST /auth/apple/callback` - Apple Sign-In callback

### Protected Endpoints
- `GET /dashboard` - Get user profile and farm info
- `POST /recommend-crop` - Get crop recommendations
- `POST /forecast-price` - Get price predictions

## Project Structure

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py          # FastAPI app and routes
│   ├── auth.py          # Password hashing utilities
│   ├── database.py      # Database configuration
│   ├── models.py        # SQLAlchemy models
│   ├── schemas.py       # Pydantic schemas
│   └── token.py         # JWT utilities
├── my project/          # Frontend files
├── models/              # ML model files
├── data/                # Dataset files
├── uploads/             # User uploaded files
├── requirements.txt     # Python dependencies
└── .env.example         # Environment variables template
```

## Development

### Running Tests

```bash
pytest
```

### Code Formatting

```bash
black .
isort .
```

### Database Migrations

```bash
alembic revision --autogenerate -m "migration message"
alembic upgrade head
```

## Deployment

### Environment Variables

For production deployment, set these environment variables:

- `DATABASE_URL`: PostgreSQL connection string
- `SECRET_KEY`: JWT signing key (generate a secure random string)
- OAuth credentials as described in OAuth Setup section
- `FRONTEND_OAUTH_REDIRECT`: Your production frontend URL

### Docker Deployment

```dockerfile
FROM python:3.9-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .
EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License.
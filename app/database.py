from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
import os

# NOTE:
# This URL is currently hardcoded for local development.
# For production, load it from environment variables instead.
DATABASE_URL= "postgresql://postgres:bidemi23@localhost:5432/smart_agriculture_db"

# SQLAlchemy engine and session factory used across the app.
engine = create_engine(DATABASE_URL)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

Base = declarative_base()


def get_db():
    # FastAPI dependency:
    # yields a DB session per request and always closes it after use.
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

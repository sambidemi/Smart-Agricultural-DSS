from passlib.context import CryptContext

# Password hashing helper using bcrypt. This is the safest way to store passwords.
# The backend never saves plain text passwords, only hashed values.
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password: str):
    # Convert plain text password into a secure hash before saving it.
    return pwd_context.hash(password)

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)
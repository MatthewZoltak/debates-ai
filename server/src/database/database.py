from sqlalchemy import Column, Integer, String, ForeignKey, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, declarative_base
import os
import dotenv

dotenv.load_dotenv()  # Load environment variables from .env file
DATABASE_HOST = os.environ.get("DATABASE_HOST", "localhost")
DATABASE_PORT = os.environ.get("DATABASE_PORT", "5432")
DATABASE_USER = os.environ.get("DATABASE_USER", "user")
DATABASE_PASSWORD = os.environ.get("DATABASE_PASSWORD", "password")
DATABASE_NAME = os.environ.get("DATABASE_NAME", "dbname")
# This is your ASYNCHRONOUS database URL
DATABASE_URL = f"postgresql+asyncpg://{DATABASE_USER}:{DATABASE_PASSWORD}@{DATABASE_HOST}:{DATABASE_PORT}/{DATABASE_NAME}"

engine = create_async_engine(DATABASE_URL, echo=True)

# This is your asynchronous session factory
async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

# This is your declarative base
Base = declarative_base()


class User(Base):
    __tablename__ = "user"

    id = Column(Integer, primary_key=True)
    name = Column(String)
    debates = relationship("Debate", back_populates="user")


class Debate(Base):
    __tablename__ = "debate"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("user.id"))
    user = relationship("User", back_populates="debates")

    topic = Column(String, nullable=False)
    questions = Column(JSON, default=list)  # Default to an empty list

    current_turn = Column(String, nullable=False, default="pro")  # Default turn
    logs = Column(JSON, default=list)  # Default to an empty list for logs

    winner = Column(String, nullable=True)  # Winner can be null initially


async def create_all_tables():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await engine.dispose()  # Dispose engine after creation

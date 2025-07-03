from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker, selectinload
from sqlalchemy.exc import SQLAlchemyError

from src.database.models import Base
import logging
import os
import dotenv

logger = logging.getLogger(__name__)

dotenv.load_dotenv()
DATABASE_HOST = os.environ.get("DATABASE_HOST", "localhost")
DATABASE_PORT = os.environ.get("DATABASE_PORT", "5432")
DATABASE_USER = os.environ.get("DATABASE_USER", "user")
DATABASE_PASSWORD = os.environ.get("DATABASE_PASSWORD", "password")
DATABASE_NAME = os.environ.get("DATABASE_NAME", "dbname")
DATABASE_URL = f"postgresql+asyncpg://{DATABASE_USER}:{DATABASE_PASSWORD}@{DATABASE_HOST}:{DATABASE_PORT}/{DATABASE_NAME}"

engine = create_async_engine(DATABASE_URL, echo=True)
async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db_session() -> AsyncSession:
    async with async_session() as session:
        yield session


async def create_item(session: AsyncSession, item_data: dict, model_class):
    try:
        db_item = model_class(**item_data)
        session.add(db_item)
        await session.commit()
        await session.refresh(db_item)
        return db_item
    except SQLAlchemyError as e:
        await session.rollback()
        logger.error(f"Error creating {model_class.__name__}: {e}")
        return None
    except Exception as e:  # Catch other potential errors
        await session.rollback()
        logger.error(f"Unexpected error creating {model_class.__name__}: {e}")
        return None


async def get_item_by_id(
    session: AsyncSession,
    item_id: int,
    model_class,
    load_relationships: list[str] = None,
):
    try:
        stmt = select(model_class)
        if load_relationships:
            options = [
                selectinload(getattr(model_class, rel))
                for rel in load_relationships
                if hasattr(model_class, rel)
            ]
            stmt = stmt.options(*options)
        stmt = stmt.where(model_class.id == item_id)
        result = await session.execute(stmt)
        return result.scalar_one_or_none()
    except SQLAlchemyError as e:
        logger.error(f"Error getting {model_class.__name__} by ID {item_id}: {e}")
        return None


async def get_all_items(
    session: AsyncSession,
    model_class,
    skip: int = 0,
    limit: int = 100,
    load_relationships: list[str] = None,
) -> list:
    try:
        stmt = select(model_class).offset(skip).limit(limit)
        if load_relationships:
            options = [
                selectinload(getattr(model_class, rel))
                for rel in load_relationships
                if hasattr(model_class, rel)
            ]
            stmt = stmt.options(*options)
        result = await session.execute(stmt)
        return result.scalars().all()
    except SQLAlchemyError as e:
        logger.error(f"Error getting all {model_class.__name__}s: {e}")
        return []


async def get_items_by_filters(
    session: AsyncSession,
    model_class,
    skip: int = 0,
    limit: int = 100,
    load_relationships: list[str] = None,
    **filters,
) -> list:
    try:
        stmt = select(model_class)
        for column_name, value in filters.items():
            if hasattr(model_class, column_name):
                stmt = stmt.where(getattr(model_class, column_name) == value)
            else:
                logger.warning(
                    f"Filter key '{column_name}' not found in model {model_class.__name__}"
                )

        if load_relationships:
            options = [
                selectinload(getattr(model_class, rel))
                for rel in load_relationships
                if hasattr(model_class, rel)
            ]
            stmt = stmt.options(*options)

        stmt = stmt.offset(skip).limit(limit)
        result = await session.execute(stmt)
        return result.scalars().all()
    except SQLAlchemyError as e:
        logger.error(f"Error getting {model_class.__name__} by filters: {e}")
        return []


async def update_item(
    session: AsyncSession, item_id: int, update_data: dict, model_class
):
    try:
        db_item = await get_item_by_id(session, item_id, model_class)
        if db_item is None:
            return None

        for key, value in update_data.items():
            if hasattr(db_item, key):
                setattr(db_item, key, value)
            else:
                logger.warning(
                    f"Attribute '{key}' not found in model {model_class.__name__} during update."
                )

        await session.commit()
        await session.refresh(db_item)
        return db_item
    except SQLAlchemyError as e:
        await session.rollback()
        logger.error(f"Error updating {model_class.__name__} with ID {item_id}: {e}")
        return None
    except Exception as e:
        await session.rollback()
        logger.error(
            f"Unexpected error updating {model_class.__name__} with ID {item_id}: {e}"
        )
        return None


async def create_all_tables():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await engine.dispose()

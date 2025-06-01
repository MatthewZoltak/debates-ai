from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker, selectinload
from sqlalchemy.exc import SQLAlchemyError

from src.database.models import Base
import logging
import os
import dotenv

logger = logging.getLogger(__name__)

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


async def get_db_session() -> AsyncSession:
    """Dependency to get a DB session."""
    async with async_session() as session:
        yield session


async def create_item(session: AsyncSession, item_data: dict, model_class):
    """
    Creates a new item in the database.
    :param session: The AsyncSession instance.
    :param item_data: Dictionary containing the data for the new item.
    :param model_class: The SQLAlchemy model class (e.g., User, Debate).
    :return: The created item instance, or None if creation failed.
    """
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
    """
    Retrieves an item by its ID.
    :param session: The AsyncSession instance.
    :param item_id: The ID of the item to retrieve.
    :param model_class: The SQLAlchemy model class.
    :param load_relationships: Optional list of relationship names to eagerly load.
    :return: The item instance if found, otherwise None.
    """
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
    """
    Retrieves all items of a given model class with pagination.
    :param session: The AsyncSession instance.
    :param model_class: The SQLAlchemy model class.
    :param skip: Number of items to skip (for pagination).
    :param limit: Maximum number of items to return (for pagination).
    :param load_relationships: Optional list of relationship names to eagerly load.
    :return: A list of item instances.
    """
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
    """
    Retrieves items based on specified filter criteria with pagination.
    :param session: The AsyncSession instance.
    :param model_class: The SQLAlchemy model class.
    :param skip: Number of items to skip.
    :param limit: Maximum number of items to return.
    :param load_relationships: Optional list of relationship names to eagerly load.
    :param filters: Keyword arguments where keys are attribute names and values are the filter values.
    :return: A list of item instances matching the filters.
    """
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
    """
    Updates an existing item in the database.
    :param session: The AsyncSession instance.
    :param item_id: The ID of the item to update.
    :param update_data: Dictionary containing the fields to update and their new values.
    :param model_class: The SQLAlchemy model class.
    :return: The updated item instance, or None if not found or update failed.
    """
    try:
        # First, retrieve the item
        db_item = await get_item_by_id(session, item_id, model_class)
        if db_item is None:
            return None

        # Update the item's attributes
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
    await engine.dispose()  # Dispose engine after creation

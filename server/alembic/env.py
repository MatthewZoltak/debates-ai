import asyncio
from logging.config import fileConfig
import dotenv
# Import your Base and the ASYNC DATABASE_URL from your database module
from src.database.database import Base, DATABASE_URL as ASYNC_DATABASE_URL

from sqlalchemy.ext.asyncio import create_async_engine # For creating async engine
from sqlalchemy import pool

from alembic import context
dotenv.load_dotenv() 


# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# add your model's MetaData object here
# for 'autogenerate' support
target_metadata = Base.metadata

# other values from the config, defined by the needs of env.py,
# can be acquired:
# my_important_option = config.get_main_option("my_important_option")
# ... etc.

def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    # Use the ASYNC_DATABASE_URL imported from your database module
    # Or, if you prefer to keep it in alembic.ini, ensure it's the asyncpg one:
    # url = config.get_main_option("sqlalchemy.url")
    # For consistency and to ensure the correct URL is used:
    url = ASYNC_DATABASE_URL
    context.configure(
        url=url, # Ensure this URL is for asyncpg if read from config
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        # include_schemas=True, # Uncomment if you use multiple schemas
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection):
    """
    Helper synchronous function to run migrations.
    This is passed to connection.run_sync().
    """
    context.configure(
        connection=connection,
        target_metadata=target_metadata
        # include_schemas=True, # Uncomment if you use multiple schemas
        # compare_type=True, # To detect column type changes
    )

    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.

    """
    # Get the sqlalchemy.url from alembic.ini, ensuring it's the async one
    # If not set or incorrect in alembic.ini, it will default to ASYNC_DATABASE_URL
    connectable_url = ASYNC_DATABASE_URL
    if not connectable_url.startswith("postgresql+asyncpg"):
        raise ValueError(
            f"Configuration error: sqlalchemy.url in alembic.ini ('{connectable_url}') "
            "must be an asyncpg DSN (e.g., 'postgresql+asyncpg://user:pass@host/db'). "
            "Please update your alembic.ini."
        )

    connectable = create_async_engine(
        connectable_url,
        poolclass=pool.NullPool, # Recommended for Alembic
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    # Dispose of the engine once migrations are done
    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())

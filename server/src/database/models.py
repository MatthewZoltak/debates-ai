from sqlalchemy import Column, Integer, String, ForeignKey, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.orm import declarative_base


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

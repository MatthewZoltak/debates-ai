from sqlalchemy import Column, Integer, String, ForeignKey, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.orm import declarative_base

Base = declarative_base()


class User(Base):
    __tablename__ = "user"

    id = Column(Integer, primary_key=True)
    auth_id = Column(String, unique=True, nullable=False)
    name = Column(String)
    debates = relationship("Debate", back_populates="user")


class Debate(Base):
    __tablename__ = "debate"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("user.id"))
    user = relationship("User", back_populates="debates")

    topic = Column(String, nullable=False)
    questions = Column(JSON, default=list)

    current_turn = Column(String, nullable=False, default="pro")
    logs = Column(JSON, default=list)

    pro_chat_history = Column(JSON, default=list)
    con_chat_history = Column(JSON, default=list)

    winner = Column(String, nullable=True)

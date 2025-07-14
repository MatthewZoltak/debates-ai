from sqlalchemy import Column, Integer, String, ForeignKey, JSON, DateTime, func, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.orm import declarative_base

Base = declarative_base()


class User(Base):
    __tablename__ = "user"

    id = Column(Integer, primary_key=True)
    auth_id = Column(String, unique=True, nullable=False)
    name = Column(String)
    debates = relationship("Debate", back_populates="user")
    api_keys = relationship("UserAPIKey", back_populates="user", cascade="all, delete-orphan")
    likes = relationship("UserLike", back_populates="user", cascade="all, delete-orphan")


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
    
    # New fields for public debates
    is_public = Column(Boolean, default=Falsegit )
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now(), server_default=func.now())
    
    # Relationship for likes
    likes = relationship("UserLike", back_populates="debate", cascade="all, delete-orphan")


class UserAPIKey(Base):
    __tablename__ = 'user_api_keys'
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('user.id'), nullable=False)
    provider = Column(String(32), nullable=False, default='gemini')
    nickname = Column(String(100), nullable=False)  # Added nickname field
    api_key_encrypted = Column(String, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now(), server_default=func.now())

    user = relationship('User', back_populates='api_keys')


class UserLike(Base):
    __tablename__ = 'user_likes'
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('user.id'), nullable=False)
    debate_id = Column(Integer, ForeignKey('debate.id'), nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    
    user = relationship('User', back_populates='likes')
    debate = relationship('Debate', back_populates='likes')

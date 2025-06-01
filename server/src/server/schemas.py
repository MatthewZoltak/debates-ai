from marshmallow import Schema, fields
from enum import Enum


# add enum for speaker types
class SpeakerType(Enum):
    PRO = "pro"
    CON = "con"
    MODERATOR = "moderator"


class ResponseType(Enum):
    OPENING_STATEMENT = "opening_statement"
    REBUTTAL = "rebuttal"
    INITIAL_QUESTION_RESPONSE = "intitial_question_response"
    CLOSING_ARGUMENT = "closing_argument"
    JUDGMENT = "judgment"
    NARRATION = "narration"


class DebateLog(Schema):
    speaker = fields.String(
        required=True,
        validate=lambda x: x
        in [
            SpeakerType.PRO,
            SpeakerType.CON,
            SpeakerType.MODERATOR,
        ],
    )
    response_type = fields.String(
        required=True,
        validate=lambda x: x
        in [
            ResponseType.OPENING_STATEMENT,
            ResponseType.REBUTTAL,
            ResponseType.INITIAL_QUESTION_RESPONSE,
            ResponseType.CLOSING_ARGUMENT,
            ResponseType.JUDGMENT,
        ],
    )
    text = fields.String(required=True)


class StartDebateRequest(Schema):
    user_id = fields.Integer()
    topic = fields.String(required=True)


class StartDebateResponse(Schema):
    message = fields.String(required=True)
    debate_id = fields.Integer(required=True)
    topic = fields.String(required=True)
    pro_initial = fields.String(required=True)
    con_initial = fields.String(required=True)
    logs = fields.List(fields.Nested(DebateLog), required=True)


class ProcessTurnRequest(Schema):
    debate_id = fields.Integer(required=True)
    question = fields.String(required=True)


class ProcessTurnResponse(Schema):
    message = fields.String(required=True)
    question = fields.String(required=True)
    pro_side_response = fields.String(required=True)
    con_side_response = fields.String(required=True)
    pro_side_rebuttal = fields.String(required=True)
    con_side_rebuttal = fields.String(required=True)
    logs = fields.List(fields.Nested(DebateLog), required=True)
    questions = fields.List(fields.String, required=True)


class ClosingArgmentRequest(Schema):
    debate_id = fields.Integer(required=True)


class ClosingArgmentResponse(Schema):
    message = fields.String(required=True)
    pro_closing = fields.String(required=True)
    con_closing = fields.String(required=True)
    logs = fields.List(fields.Nested(DebateLog), required=True)
    questions = fields.List(fields.String, required=True)


class JudgeDebateRequest(Schema):
    debate_id = fields.Integer(required=True)


class JudgeDebateResponse(Schema):
    message = fields.String(required=True)
    judgment = fields.String(required=True)
    logs = fields.List(fields.Nested(DebateLog), required=True)
    questions = fields.List(fields.String, required=True)


class GetDebateRequest(Schema):
    debate_id = fields.Integer(required=True)


class GetDebateResponse(Schema):
    id = fields.Integer(required=True)
    user_id = fields.Integer(required=True)
    topic = fields.String(required=True)
    questions = fields.List(fields.String)
    logs = fields.List(fields.Nested(DebateLog))
    winner = fields.String(required=False, allow_none=True)

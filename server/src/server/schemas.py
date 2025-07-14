from marshmallow import Schema, fields
from enum import Enum


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
    model = fields.String(required=True)
    api_key_id = fields.Integer(required=True)


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
    winner = fields.String(required=True, allow_none=True)


class GetDebateRequest(Schema):
    debate_id = fields.Integer(required=True)


class GetDebateResponse(Schema):
    id = fields.Integer(required=True)
    user_id = fields.Integer(required=True)
    topic = fields.String(required=True)
    questions = fields.List(fields.String)
    logs = fields.List(fields.Nested(DebateLog))
    winner = fields.String(required=False, allow_none=True)
    is_public = fields.Boolean(required=True)
    created_at = fields.DateTime()
    updated_at = fields.DateTime()
    like_count = fields.Integer(required=True)
    is_liked_by_user = fields.Boolean(required=True)
    creator_name = fields.String(required=True)


class GetUserDebatesResponse(Schema):
    debates = fields.List(fields.Nested(GetDebateResponse), required=True)


class GetUserDebatesRequest(Schema):
    user_id = fields.Integer(required=False, allow_none=True, missing=None)


class GetPublicDebatesRequest(Schema):
    page = fields.Integer(required=False, missing=1)
    per_page = fields.Integer(required=False, missing=10)
    sort_by = fields.String(required=False, missing="created_at")  # created_at, likes, topic


class GetPublicDebatesResponse(Schema):
    debates = fields.List(fields.Nested(GetDebateResponse), required=True)
    total_count = fields.Integer(required=True)
    page = fields.Integer(required=True)
    per_page = fields.Integer(required=True)
    total_pages = fields.Integer(required=True)


class ToggleDebateVisibilityRequest(Schema):
    debate_id = fields.Integer(required=True)
    is_public = fields.Boolean(required=True)


class ToggleDebateVisibilityResponse(Schema):
    message = fields.String(required=True)
    is_public = fields.Boolean(required=True)


class ToggleLikeRequest(Schema):
    debate_id = fields.Integer(required=True)


class ToggleLikeResponse(Schema):
    message = fields.String(required=True)
    is_liked = fields.Boolean(required=True)
    like_count = fields.Integer(required=True)


class SignupRequest(Schema):
    id = fields.String(required=True)

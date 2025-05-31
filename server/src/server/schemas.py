from marshmallow import Schema, fields


class StartDebateRequest(Schema):
    user_id = fields.Integer()
    topic = fields.String(required=True)


class StartDebateResponse(Schema):
    message = fields.String(required=True)
    topic = fields.String(required=True)
    pro_initial = fields.String(required=True)
    con_initial = fields.String(required=True)


class ProcessTurnRequest(Schema):
    question = fields.String(required=True)


class ProcessTurnResponse(Schema):
    message = fields.String(required=True)
    question = fields.String(required=True)
    pro_side_response = fields.String(required=True)
    con_side_response = fields.String(required=True)
    pro_side_rebuttal = fields.String(required=True)
    con_side_rebuttal = fields.String(required=True)


class ClosingArgmentRequest(Schema):
    pass


class ClosingArgmentResponse(Schema):
    message = fields.String(required=True)
    pro_closing = fields.String(required=True)
    con_closing = fields.String(required=True)


class JudgeDebateRequest(Schema):
    pass


class JudgeDebateResponse(Schema):
    message = fields.String(required=True)
    judgment = fields.String(required=True)

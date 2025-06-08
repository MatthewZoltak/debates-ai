from .views import (
    process_turn_view,
    start_debate_view,
    closing_arguments_view,
    judge_debate_view,
    get_debate,
    get_user_debates,
)


def setup_routes(app):
    app.router.add_get("/get_debate", get_debate)
    app.router.add_get("/get_user_debates", get_user_debates)
    app.router.add_post("/start_debate", start_debate_view)
    app.router.add_post("/process_turn", process_turn_view)
    app.router.add_post("/closing_arguments", closing_arguments_view)
    app.router.add_post("/judge_debate", judge_debate_view)

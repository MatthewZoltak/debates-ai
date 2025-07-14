from .views import (
    process_turn_view,
    start_debate_view,
    closing_arguments_view,
    judge_debate_view,
    get_debate,
    get_user_debates,
    get_public_debates,
    toggle_debate_visibility_view,
    toggle_like_view,
    set_user_api_key_view,
    get_user_api_key_view,
    list_user_api_keys_view,
    get_user_api_key_value_view,
    update_user_api_key_view,
    delete_user_api_key_view,
)


def setup_routes(app):
    app.router.add_get("/get_debate", get_debate)
    app.router.add_get("/get_user_debates", get_user_debates)
    app.router.add_get("/get_public_debates", get_public_debates)
    app.router.add_post("/start_debate", start_debate_view)
    app.router.add_post("/process_turn", process_turn_view)
    app.router.add_post("/closing_arguments", closing_arguments_view)
    app.router.add_post("/judge_debate", judge_debate_view)
    app.router.add_post("/toggle_debate_visibility", toggle_debate_visibility_view)
    app.router.add_post("/toggle_like", toggle_like_view)
    app.router.add_post("/api/user/api-key", set_user_api_key_view)
    app.router.add_get("/api/user/api-key", get_user_api_key_view)
    app.router.add_get("/api/user/api-keys", list_user_api_keys_view)
    app.router.add_get("/api/user/api-key/{id}", get_user_api_key_value_view)
    app.router.add_patch("/api/user/api-key/{id}", update_user_api_key_view)
    app.router.add_delete("/api/user/api-key/{id}", delete_user_api_key_view)

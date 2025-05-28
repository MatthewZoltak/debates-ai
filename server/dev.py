import requests

res = requests.post("http://127.0.0.1:5000/judge_debate")
breakpoint()
print(res.json())
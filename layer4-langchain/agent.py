"""Tương đương thuần LangChain của New Flow.json (Chat Input -> Agent -> Chat Output).

Giữ đúng nguyên tắc trong docs/ARCHITECTURE.md: Tầng 4 chỉ gọi vào LiteLLM
(Tầng 3) qua API OpenAI-compatible bằng logical_model, không import SDK
vendor trực tiếp và không biết vendor_model_id thật đứng sau.
"""

import ast
import operator
import os
from datetime import datetime, timezone

from langchain.agents import create_agent
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI

LITELLM_BASE_URL = os.environ.get("LITELLM_BASE_URL", "http://localhost:4000")
LITELLM_MASTER_KEY = os.environ["LITELLM_MASTER_KEY"]
LOGICAL_MODEL = os.environ.get("LOGICAL_MODEL", "fp-analysis-default")
SYSTEM_PROMPT = "tôi là chuyên gia tư vấn AI"

_CALC_OPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.Pow: operator.pow,
    ast.USub: operator.neg,
}


@tool
def current_date() -> str:
    """Trả về ngày giờ hiện tại (UTC)."""
    return datetime.now(tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")


@tool
def calculator(expression: str) -> str:
    """Tính một biểu thức số học (+, -, *, /, **)."""

    def _eval(node):
        if isinstance(node, ast.Constant):
            return node.value
        if isinstance(node, ast.BinOp) and type(node.op) in _CALC_OPS:
            return _CALC_OPS[type(node.op)](_eval(node.left), _eval(node.right))
        if isinstance(node, ast.UnaryOp) and type(node.op) in _CALC_OPS:
            return _CALC_OPS[type(node.op)](_eval(node.operand))
        raise ValueError(f"Biểu thức không hỗ trợ: {expression}")

    return str(_eval(ast.parse(expression, mode="eval").body))


def build_agent():
    llm = ChatOpenAI(base_url=LITELLM_BASE_URL, api_key=LITELLM_MASTER_KEY, model=LOGICAL_MODEL)
    return create_agent(model=llm, tools=[current_date, calculator], system_prompt=SYSTEM_PROMPT)


def main():
    agent = build_agent()
    print(f"Agent sẵn sàng (model={LOGICAL_MODEL} qua {LITELLM_BASE_URL}). Gõ 'exit' để thoát.")
    while True:
        try:
            text = input("Bạn: ").strip()
        except EOFError:
            break
        if not text or text.lower() in {"exit", "quit"}:
            break
        result = agent.invoke({"messages": [{"role": "user", "content": text}]})
        print(f"Agent: {result['messages'][-1].content}")


if __name__ == "__main__":
    main()

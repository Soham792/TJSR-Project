def escape_markdown(text: str) -> str:
    """Escapes markdown special characters."""
    if not text:
        return ""
    # Characters that must be escaped in MarkdownV2 (except inside code blocks or URL parts)
    special = r"\_*[]()~`>#+-=|{}.!"
    for ch in special:
        text = text.replace(ch, f"\\{ch}")
    return text

def test_template(question, response, url):
    text = (
        f"🤖 *AI Assistant Response*\n\n"
        f"❓ *You asked:*\n_{escape_markdown(question)}_\n\n"
        f"✨ *Answer:*\n{escape_markdown(response)}\n\n"
        f"[Open Chat Dashboard]({url}/dashboard)"
    )
    return text

print("--- Test 1 ---")
print(test_template("Hello?", "I'm fine. Thanks!", "http://localhost:3000"))
print("--- Test 2 ---")
print(test_template("What is 1+1?", "It is 2. (Simple!)", "http://tjsr-app.com"))

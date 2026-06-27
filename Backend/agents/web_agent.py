import re
import requests
from bs4 import BeautifulSoup
from duckduckgo_search import DDGS
from llm_client import get_llm_client, LLM_MODEL

def extract_urls(text: str) -> list[str]:
    """Extracts all URLs from the user's query."""
    url_pattern = re.compile(r'(https?://[^\s]+)')
    return url_pattern.findall(text)

def scrape_url(url: str) -> str:
    """Scrapes the text content of a single URL."""
    try:
        response = requests.get(url, timeout=10, headers={'User-Agent': 'Mozilla/5.0'})
        response.raise_for_status()
        soup = BeautifulSoup(response.text, 'html.parser')
        # Extract text from paragraphs
        paragraphs = soup.find_all('p')
        text = "\n".join([p.get_text(strip=True) for p in paragraphs if p.get_text(strip=True)])
        return text[:5000] # Limit to 5000 chars to avoid token explosion
    except Exception as e:
        print(f"Error scraping {url}: {e}")
        return ""

def search_duckduckgo(query: str, max_results: int = 3) -> list[dict]:
    """Searches DuckDuckGo and returns the results."""
    try:
        results = DDGS().text(query, max_results=max_results)
        return results if results else []
    except Exception as e:
        print(f"DuckDuckGo search error: {e}")
        return []

def stream_web_agent(query: str):
    """
    Main entry point for Web Search. 
    1. Checks for direct URLs.
    2. If no URL, searches DuckDuckGo.
    3. Yields citations list.
    4. Streams token chunks from the LLM.
    """
    urls_in_query = extract_urls(query)
    context_text = ""
    citations = []

    # 1. Direct URL Scraping Mode
    if urls_in_query:
        print("Web Agent: Direct URLs detected. Scraping them directly...")
        for url in urls_in_query:
            scraped_text = scrape_url(url)
            if scraped_text:
                context_text += f"\n\nSource: {url}\n{scraped_text}"
                citations.append(url)
    
    # 2. Web Search Mode
    else:
        print("Web Agent: Searching DuckDuckGo...")
        search_results = search_duckduckgo(query)
        for res in search_results:
            title = res.get('title', '')
            snippet = res.get('body', '')
            link = res.get('href', '')
            
            context_text += f"\n\nSource: {link}\nTitle: {title}\nSnippet: {snippet}"
            if link:
                citations.append(link)

    yield citations

    # 3. Handle No Results
    if not context_text.strip():
        yield "I'm sorry, I couldn't find any relevant information on the web for your query."
        return

    # 4. LLM Synthesis
    system_prompt = (
        "You are an expert Web Research AI Agent. Your task is to answer the user's question "
        "using ONLY the web search results provided below. Do not hallucinate or use prior knowledge.\n\n"
        f"WEB CONTEXT:\n{context_text}"
    )

    try:
        client = get_llm_client()
        response = client.chat.completions.create(
            model=LLM_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": query}
            ],
            temperature=0.2,
            max_tokens=1500,
            stream=True
        )
        for chunk in response:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content
    except Exception as e:
        print(f"LLM Synthesis error: {e}")
        yield "An error occurred while synthesizing the web results."

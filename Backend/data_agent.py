import io
import re
from typing import Any

from fastapi import HTTPException
from llm_client import get_llm_client, LLM_MODEL

def extract_python_code(llm_response: str) -> str:
    """Extracts python code from markdown block."""
    match = re.search(r"```python\s*(.*?)\s*```", llm_response, re.DOTALL)
    if match:
        return match.group(1).strip()
    return llm_response.strip()

def analyze_data_file(file_content: bytes, filename: str, query: str) -> dict[str, Any]:
    """
    Given a CSV/Excel file in bytes and a user query, this function uses OpenAI to write 
    a python Pandas script, executes it in a restricted namespace, and returns the result.
    """
    try:
        import pandas as pd
    except ImportError:
        raise HTTPException(status_code=500, detail="Pandas is required for Data Analysis mode. Run: pip install pandas")

    # Load data into DataFrame based on file type
    try:
        if filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(file_content))
        elif filename.endswith((".xls", ".xlsx")):
            df = pd.read_excel(io.BytesIO(file_content))
        else:
            raise HTTPException(status_code=400, detail="Data Agent only supports CSV and Excel files.")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse data file: {e}")

    # Limit df columns to first 5 rows to provide schema context to the LLM
    df_head = df.head(5).to_csv(index=False)
    columns = list(df.columns)

    system_prompt = f"""
You are an expert Data Scientist agent.
You have been provided with a Pandas DataFrame named `df`.
The DataFrame has the following columns: {columns}
Here are the first 5 rows for context:
{df_head}

The user will ask a question about this data.
You must write a completely self-contained Python script to answer their question using Pandas.
The script MUST store the final result (a string, number, or short summary) in a variable named `final_answer`.
Do NOT use matplotlib, do NOT plot charts, do NOT make network requests, do NOT read from the file system.
Output ONLY the raw python code wrapped in a ```python block.
"""
    
    try:
        response = get_llm_client().chat.completions.create(
            model=LLM_MODEL,
            temperature=0.1,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": query}
            ]
        )
        llm_response = response.choices[0].message.content
        code = extract_python_code(llm_response)
        
        # Execute code in a heavily restricted environment
        local_vars = {"df": df, "pd": pd}
        # Disable dangerous built-ins
        safe_globals = {
            "__builtins__": {
                "print": print, "len": len, "range": range, "sum": sum, 
                "min": min, "max": max, "abs": abs, "round": round, "str": str, 
                "int": int, "float": float, "list": list, "dict": dict, "set": set, "bool": bool
            }
        }
        
        try:
            exec(code, safe_globals, local_vars)
            final_answer = local_vars.get("final_answer", "Error: Script did not produce a 'final_answer' variable.")
            return {"answer": str(final_answer), "generated_code": code}
        except Exception as exec_err:
            return {"answer": f"Data Agent encountered an execution error: {exec_err}", "generated_code": code}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Data Agent failed: {e}")

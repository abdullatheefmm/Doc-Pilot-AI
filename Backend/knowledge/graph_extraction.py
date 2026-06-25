import re
import json
from pathlib import Path
from collections import Counter
try:
    from sklearn.feature_extraction.text import TfidfVectorizer
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False

DATA_DIR = Path("data/fastapi_docs/data")
GRAPH_STORE = Path("data/fastapi_docs/graph_db.json")

# Simple stop words to avoid common terms in graph
STOP_WORDS = set([
    "the", "and", "to", "of", "a", "in", "is", "for", "that", "it", "on", "with", "as", 
    "this", "was", "be", "are", "by", "or", "an", "at", "from", "can", "which", "not",
    "will", "has", "but", "have", "all", "we", "its", "they", "your", "their", "use",
    "more", "about", "what", "how", "when", "where", "who", "why", "there", "some",
    "if", "do", "you", "so", "up", "out", "our", "no", "also", "then", "into", "only",
    "any", "other", "such", "than", "could", "should", "would", "may", "might", "must",
    "very", "even", "much", "well", "many", "most", "been", "these", "those"
])

def ensure_graph_store():
    if not GRAPH_STORE.parent.exists():
        GRAPH_STORE.parent.mkdir(parents=True, exist_ok=True)
    if not GRAPH_STORE.exists():
        GRAPH_STORE.write_text(json.dumps({}), encoding="utf-8")

def get_graph_data():
    ensure_graph_store()
    try:
        return json.loads(GRAPH_STORE.read_text(encoding="utf-8"))
    except:
        return {}

def save_graph_data(data):
    ensure_graph_store()
    GRAPH_STORE.write_text(json.dumps(data, indent=2), encoding="utf-8")

def extract_keywords(text: str, top_n: int = 4) -> list:
    """
    Extracts top keywords from text to represent Knowledge Graph nodes.
    Uses TF-IDF if sklearn is available, otherwise falls back to frequency counting.
    """
    if not text or len(text.strip()) < 10:
        return []
        
    if SKLEARN_AVAILABLE:
        try:
            vectorizer = TfidfVectorizer(stop_words=list(STOP_WORDS), max_features=top_n)
            X = vectorizer.fit_transform([text])
            return vectorizer.get_feature_names_out().tolist()
        except Exception as e:
            print(f"TF-IDF failed, falling back: {e}")

    # Fallback to simple frequency counting
    words = re.findall(r'\b[a-zA-Z]{3,15}\b', text.lower())
    filtered_words = [w for w in words if w not in STOP_WORDS]
    counter = Counter(filtered_words)
    return [word for word, count in counter.most_common(top_n)]

def format_user_name(user_id_or_email: str) -> str:
    """Return raw user ID / email as requested"""
    if not user_id_or_email:
        return "Unknown"
    return user_id_or_email

def process_document_for_graph(filename: str, text: str, domain: str, user_email: str):
    """
    Called upon document upload. Extracts concepts and updates the dynamic graph store.
    """
    keywords = extract_keywords(text, top_n=3)
    
    graph_data = get_graph_data()
    
    # Store the mapping for this document
    graph_data[filename] = {
        "domain": domain,
        "uploaded_by": format_user_name(user_email),
        "concepts": keywords
    }
    
    save_graph_data(graph_data)
    print(f"Knowledge Graph Updated: {filename} -> Concepts: {keywords}")

def remove_document_from_graph(filename: str):
    """
    Called upon document deletion. Removes document and its concepts from the dynamic graph store.
    """
    graph_data = get_graph_data()
    if filename in graph_data:
        del graph_data[filename]
        save_graph_data(graph_data)
        print(f"Knowledge Graph Updated: Removed {filename}")

def get_dynamic_graph_for_user(user_domain: str, is_super_admin: bool, user_email: str = "", view_type: str = ""):
    """
    Constructs the nodes and links for the Knowledge Graph frontend.
    Applies RBAC (Role-Based Access Control) to filter domains.
    """
    graph_data = get_graph_data()
    
    if not graph_data:
        return {"nodes": [], "links": []}
    
    nodes = []
    links = []
    
    # Track unique IDs to avoid duplicates
    node_ids = set()
    
    def add_node(id_val, group_val, type_val):
        if id_val not in node_ids:
            nodes.append({"id": id_val, "group": group_val, "type": type_val})
            node_ids.add(id_val)
            
    def add_link(source, target, label="", value=1):
        if source in node_ids and target in node_ids:
            links.append({"source": source, "target": target, "value": value, "label": label})

    # Add central "Enterprise" node for Super Admins to tie domains together
    if is_super_admin:
        add_node("Enterprise", 0, "root")

    modified = False
    for doc_filename, info in list(graph_data.items()):
        # Self-healing: if the physical parsed file no longer exists, it was deleted
        # Either before the fix or manually. Clean it up.
        from pathlib import Path
        if not (Path("data/fastapi_docs") / doc_filename).exists():
            del graph_data[doc_filename]
            modified = True
            continue

        doc_domain = info.get("domain", "general")
        doc_uploaded_by = info.get("uploaded_by", "Unknown")
        
        # RBAC Filtering!
        if not is_super_admin and user_domain != "all" and doc_domain != user_domain:
            continue # Skip documents outside user's permitted domain
            
        # View Filtering!
        if view_type == "me" and doc_uploaded_by != user_email:
            continue
            
        # Add Domain Node
        add_node(doc_domain, 1, "domain")
        if is_super_admin:
            add_link("Enterprise", doc_domain, "Manages")
            
        # Add User Node
        user_name = format_user_name(info.get("uploaded_by", "Unknown"))
        add_node(user_name, 2, "user")
        add_link(user_name, doc_domain, "Belongs To") # User operates in domain
        
        # Add Document Node
        add_node(doc_filename, 3, "document")
        add_link(doc_domain, doc_filename, "Stores Data") # Document belongs to domain
        add_link(user_name, doc_filename, "Uploaded") # User uploaded document
        
        # Add Concept Nodes
        for concept in info.get("concepts", []):
            concept_name = concept.capitalize()
            add_node(concept_name, 4, "concept")
            add_link(doc_filename, concept_name, "Contains") # Document contains concept
            
    if modified:
        save_graph_data(graph_data)
        
    # If after cleanup we have no nodes, return empty explicitly
    if not nodes:
        return {"nodes": [], "links": []}
            
    return {"nodes": nodes, "links": links}

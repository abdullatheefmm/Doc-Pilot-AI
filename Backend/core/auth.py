from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from supabase_client import supabase

security = HTTPBearer()

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if not supabase:
        # Fallback for local testing without Supabase fully configured
        return {"id": "local-test-uuid", "role": "super_admin", "email": "admin@local.test"}
    
    token = credentials.credentials
    try:
        user_response = supabase.auth.get_user(token)
        if not user_response.user:
            raise HTTPException(status_code=401, detail="Invalid token")
            
        user_id = user_response.user.id
        
        profile_res = supabase.table("user_profiles").select("role, status, full_name").eq("user_id", user_id).execute()
        if not profile_res.data:
            role = "general"
            status = "pending"
            full_name = None
        else:
            role = profile_res.data[0].get("role", "general")
            status = profile_res.data[0].get("status", "pending")
            full_name = profile_res.data[0].get("full_name")
            
        return {"id": user_id, "role": role, "status": status, "email": user_response.user.email, "full_name": full_name}
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Auth failed: {str(e)}")

def require_admin(user = Depends(get_current_user)):
    if user["role"] != "super_admin":
        raise HTTPException(status_code=403, detail="Super Admin privileges required")
    return user

def require_active_user(user = Depends(get_current_user)):
    if user.get("status") in ["pending", "revoked"]:
        raise HTTPException(status_code=403, detail="Account pending admin approval or revoked")
    return user

def verify_user_password(email: str, password: str):
    if not supabase:
        return True
    try:
        res = supabase.auth.sign_in_with_password({"email": email, "password": password})
        if not res.user:
            raise HTTPException(status_code=403, detail="Invalid password")
    except Exception:
        raise HTTPException(status_code=403, detail="Invalid password")

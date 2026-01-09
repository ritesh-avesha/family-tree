"""
Family Tree Application - FastAPI Entry Point
"""
import logging
import uuid
from pathlib import Path
from copy import deepcopy
from typing import Dict
import time

from fastapi import FastAPI, Request, Response
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from models import FamilyTree

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Session configuration
SESSION_COOKIE_NAME = "family_tree_session"
SESSION_MAX_AGE = 86400 * 7  # 7 days
MAX_SESSIONS = 100  # Maximum concurrent sessions (memory protection)
SESSION_CLEANUP_INTERVAL = 3600  # Cleanup old sessions every hour


class TreeState:
    """Manages the family tree state with undo/redo support."""
    
    MAX_HISTORY = 50

    def __init__(self):
        self.tree = FamilyTree()
        self.undo_stack = []
        self.redo_stack = []
        self.last_accessed = time.time()

    def touch(self):
        """Update last accessed time."""
        self.last_accessed = time.time()

    def save_state(self, action: str):
        """Save current state for undo."""
        state = deepcopy(self.tree)
        self.undo_stack.append((action, state))
        
        # Limit history size
        if len(self.undo_stack) > self.MAX_HISTORY:
            self.undo_stack.pop(0)
        
        # Clear redo stack on new action
        self.redo_stack.clear()
        self.touch()
    
    def force_save(self):
        """Mark as accessed (no disk save in stateless mode)."""
        self.touch()

    def undo(self) -> bool:
        """Undo the last action."""
        if not self.undo_stack:
            return False
        
        action, state = self.undo_stack.pop()
        self.redo_stack.append((action, deepcopy(self.tree)))
        self.tree = state
        self.touch()
        logger.info("Undid action: %s", action)
        return True
    
    def redo(self) -> bool:
        """Redo the last undone action."""
        if not self.redo_stack:
            return False
        
        action, state = self.redo_stack.pop()
        self.undo_stack.append((action, deepcopy(self.tree)))
        self.tree = state
        self.touch()
        logger.info("Redid action: %s", action)
        return True
    
    def can_undo(self) -> bool:
        return len(self.undo_stack) > 0
    
    def can_redo(self) -> bool:
        return len(self.redo_stack) > 0


class SessionManager:
    """Manages per-user sessions with memory protection."""
    
    def __init__(self):
        self.sessions: Dict[str, TreeState] = {}
        self.last_cleanup = time.time()
    
    def get_or_create_session(self, session_id: str = None) -> tuple[str, TreeState]:
        """Get existing session or create new one."""
        self._cleanup_old_sessions()
        
        if session_id and session_id in self.sessions:
            state = self.sessions[session_id]
            state.touch()
            return session_id, state
        
        # Create new session
        new_id = str(uuid.uuid4())
        
        # Memory protection: remove oldest session if at limit
        if len(self.sessions) >= MAX_SESSIONS:
            oldest_id = min(self.sessions.keys(), 
                          key=lambda k: self.sessions[k].last_accessed)
            del self.sessions[oldest_id]
            logger.info("Removed oldest session %s to make room", oldest_id[:8])
        
        self.sessions[new_id] = TreeState()
        logger.info("Created new session: %s", new_id[:8])
        return new_id, self.sessions[new_id]
    
    def get_session(self, session_id: str) -> TreeState | None:
        """Get session by ID, returns None if not found."""
        if session_id in self.sessions:
            self.sessions[session_id].touch()
            return self.sessions[session_id]
        return None
    
    def _cleanup_old_sessions(self):
        """Remove sessions that haven't been accessed in a while."""
        now = time.time()
        if now - self.last_cleanup < SESSION_CLEANUP_INTERVAL:
            return
        
        self.last_cleanup = now
        expired = [
            sid for sid, state in self.sessions.items()
            if now - state.last_accessed > SESSION_MAX_AGE
        ]
        for sid in expired:
            del self.sessions[sid]
            logger.info("Cleaned up expired session: %s", sid[:8])


# Initialize app and session manager
app = FastAPI(
    title="Family Tree Builder",
    description="A web-based family tree creation and visualization tool",
    version="1.0.0"
)

session_manager = SessionManager()


def get_session_from_request(request: Request) -> tuple[str, TreeState]:
    """Get or create session from request cookies."""
    session_id = request.cookies.get(SESSION_COOKIE_NAME)
    return session_manager.get_or_create_session(session_id)


def set_session_cookie(response: Response, session_id: str):
    """Set session cookie on response."""
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=session_id,
        max_age=SESSION_MAX_AGE,
        httponly=True,
        samesite="lax"
    )


# Import routers - they will use get_session_from_request
from api import persons, relationships, tree

# Pass session manager to routers
persons.set_session_manager(session_manager, get_session_from_request, set_session_cookie)
relationships.set_session_manager(session_manager, get_session_from_request, set_session_cookie)
tree.set_session_manager(session_manager, get_session_from_request, set_session_cookie)

app.include_router(persons.router)
app.include_router(relationships.router)
app.include_router(tree.router)


# Ensure directories exist
Path("static").mkdir(exist_ok=True)
Path("uploads").mkdir(exist_ok=True)
Path("exports").mkdir(exist_ok=True)

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")


@app.get("/")
async def root():
    """Serve the main application page."""
    return FileResponse("static/index.html")


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "active_sessions": len(session_manager.sessions)
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

"""
Family Tree Application - FastAPI Entry Point
"""
import logging
from pathlib import Path
from copy import deepcopy

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from models import FamilyTree

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


class TreeState:
    """Manages the family tree state with undo/redo support."""
    
    MAX_HISTORY = 50
    
    AUTOSAVE_FILE = Path("data/autosave.json")

    def __init__(self):
        self.tree = FamilyTree()
        self.undo_stack = []
        self.redo_stack = []
        self._load_from_disk()

    def _load_from_disk(self):
        """Load state from autosave file if exists."""
        try:
            if self.AUTOSAVE_FILE.exists():
                with open(self.AUTOSAVE_FILE, "r") as f:
                    json_data = f.read()
                    if json_data.strip():  # Check if not empty
                        self.tree = FamilyTree.model_validate_json(json_data)
                        logger.info("Loaded autosave from %s", self.AUTOSAVE_FILE)
        except Exception as e:
            logger.warning("Could not load autosave (running stateless): %s", e)

    def _save_to_disk(self):
        """Save current state to disk (skipped if filesystem is read-only)."""
        try:
            self.AUTOSAVE_FILE.parent.mkdir(parents=True, exist_ok=True)
            with open(self.AUTOSAVE_FILE, "w") as f:
                f.write(self.tree.model_dump_json(indent=2))
        except Exception as e:
            logger.debug("Disk save skipped (stateless mode): %s", e)

    def save_state(self, action: str):
        """Save current state for undo and persist to disk."""
        state = deepcopy(self.tree)
        self.undo_stack.append((action, state))
        
        # Limit history size
        if len(self.undo_stack) > self.MAX_HISTORY:
            self.undo_stack.pop(0)
        
        # Clear redo stack on new action
        self.redo_stack.clear()
        
        # Persist to disk
        self._save_to_disk()
    
    def force_save(self):
        """Force save to disk without adding to undo history (e.g. for positions)."""
        self._save_to_disk()

    def undo(self) -> bool:
        """Undo the last action."""
        if not self.undo_stack:
            return False
        
        action, state = self.undo_stack.pop()
        self.redo_stack.append((action, deepcopy(self.tree)))
        self.tree = state
        self._save_to_disk()  # Persist the undo
        logger.info("Undid action: %s", action)
        return True
    
    def redo(self) -> bool:
        """Redo the last undone action."""
        if not self.redo_stack:
            return False
        
        action, state = self.redo_stack.pop()
        self.undo_stack.append((action, deepcopy(self.tree)))
        self.tree = state
        self._save_to_disk()  # Persist the redo
        logger.info("Redid action: %s", action)
        return True
    
    def can_undo(self) -> bool:
        return len(self.undo_stack) > 0
    
    def can_redo(self) -> bool:
        return len(self.redo_stack) > 0


# Initialize app and state
app = FastAPI(
    title="Family Tree Builder",
    description="A web-based family tree creation and visualization tool",
    version="1.0.0"
)

tree_state = TreeState()


# Import and configure routers
from api import persons, relationships, tree

persons.set_tree_state(tree_state)
relationships.set_tree_state(tree_state)
tree.set_tree_state(tree_state)

app.include_router(persons.router)
app.include_router(relationships.router)
app.include_router(tree.router)


# Ensure directories exist
Path("static").mkdir(exist_ok=True)
Path("data").mkdir(exist_ok=True)
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
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

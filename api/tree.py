"""
Tree operations API endpoints (save/load, undo/redo, export, layout).
"""
import json
import logging
import os
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import FileResponse

from models import FamilyTree, ExportOptions, LayoutOptions

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/tree", tags=["tree"])

DATA_DIR = Path("data")
UPLOADS_DIR = Path("uploads")

# In-memory storage - will be managed by tree_state
tree_state = None


def set_tree_state(state):
    """Set the shared tree state."""
    global tree_state
    tree_state = state


@router.get("")
async def get_tree():
    """Get the entire family tree."""
    if tree_state is None:
        raise HTTPException(status_code=500, detail="Tree state not initialized")
    
    return {
        "tree": tree_state.tree.model_dump(),
        "can_undo": tree_state.can_undo(),
        "can_redo": tree_state.can_redo()
    }


@router.post("/save")
async def save_tree(filename: Optional[str] = None):
    """Save the tree to a JSON file."""
    if tree_state is None:
        raise HTTPException(status_code=500, detail="Tree state not initialized")
    
    DATA_DIR.mkdir(exist_ok=True)
    
    if not filename:
        filename = f"family_tree_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    
    if not filename.endswith(".json"):
        filename += ".json"
    
    filepath = DATA_DIR / filename
    
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(tree_state.tree.model_dump(), f, indent=2, ensure_ascii=False)
    
    logger.info("Saved tree to: %s", filepath)
    return {"status": "saved", "filename": filename, "path": str(filepath)}


@router.post("/load")
async def load_tree(filename: str):
    """Load a tree from a JSON file."""
    if tree_state is None:
        raise HTTPException(status_code=500, detail="Tree state not initialized")
    
    filepath = DATA_DIR / filename
    
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)
        
        tree_state.save_state("load_tree")
        tree_state.tree = FamilyTree(**data)
        logger.info("Loaded tree from: %s", filepath)
        return {"status": "loaded", "filename": filename}
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail=f"Invalid JSON: {e}")


@router.get("/files")
async def list_saved_files():
    """List all saved tree files."""
    DATA_DIR.mkdir(exist_ok=True)
    files = []
    
    for f in DATA_DIR.glob("*.json"):
        stat = f.stat()
        files.append({
            "filename": f.name,
            "size": stat.st_size,
            "modified": datetime.fromtimestamp(stat.st_mtime).isoformat()
        })
    
    return sorted(files, key=lambda x: x["modified"], reverse=True)


@router.post("/new")
async def new_tree():
    """Create a new empty tree."""
    if tree_state is None:
        raise HTTPException(status_code=500, detail="Tree state not initialized")
    
    tree_state.save_state("new_tree")
    tree_state.tree = FamilyTree()
    logger.info("Created new tree")
    return {"status": "created"}


@router.post("/undo")
async def undo():
    """Undo the last action."""
    if tree_state is None:
        raise HTTPException(status_code=500, detail="Tree state not initialized")
    
    if not tree_state.undo():
        raise HTTPException(status_code=400, detail="Nothing to undo")
    
    return {
        "status": "undone",
        "can_undo": tree_state.can_undo(),
        "can_redo": tree_state.can_redo()
    }


@router.post("/redo")
async def redo():
    """Redo the last undone action."""
    if tree_state is None:
        raise HTTPException(status_code=500, detail="Tree state not initialized")
    
    if not tree_state.redo():
        raise HTTPException(status_code=400, detail="Nothing to redo")
    
    return {
        "status": "redone",
        "can_undo": tree_state.can_undo(),
        "can_redo": tree_state.can_redo()
    }


@router.post("/export")
async def export_tree(options: ExportOptions):
    """Export the tree as an image or PDF."""
    if tree_state is None:
        raise HTTPException(status_code=500, detail="Tree state not initialized")
    
    from services.export_service import export_tree as do_export
    
    try:
        filepath = do_export(tree_state.tree, options)
        return FileResponse(
            filepath,
            media_type="application/octet-stream",
            filename=os.path.basename(filepath)
        )
    except Exception as e:
        logger.exception("Export failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/layout")
async def auto_layout(options: LayoutOptions):
    """Auto-arrange the tree with the specified layout."""
    if tree_state is None:
        raise HTTPException(status_code=500, detail="Tree state not initialized")
    
    if options.root_person_id not in tree_state.tree.persons:
        raise HTTPException(status_code=404, detail="Root person not found")
    
    from services.layout_service import calculate_layout
    
    tree_state.save_state("auto_layout")
    
    positions = calculate_layout(tree_state.tree, options)
    
    for person_id, pos in positions.items():
        if person_id in tree_state.tree.persons:
            tree_state.tree.persons[person_id].x = pos["x"]
            tree_state.tree.persons[person_id].y = pos["y"]
    
    logger.info("Applied auto-layout with root: %s", options.root_person_id)
    return {"status": "layout_applied", "positions": positions}


@router.post("/upload-photo")
async def upload_photo(file: UploadFile = File(...)):
    """Upload a photo file."""
    UPLOADS_DIR.mkdir(exist_ok=True)
    
    # Generate unique filename
    ext = os.path.splitext(file.filename)[1] if file.filename else ".jpg"
    filename = f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{file.filename}"
    filepath = UPLOADS_DIR / filename
    
    with open(filepath, "wb") as f:
        content = await file.read()
        f.write(content)
    
    logger.info("Uploaded photo: %s", filepath)
    return {"status": "uploaded", "path": str(filepath), "filename": filename}

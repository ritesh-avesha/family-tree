"""
Tree operations API endpoints (save/load, undo/redo, export, layout).
"""
import json
import logging
import os
import base64
from datetime import datetime
from pathlib import Path
from typing import Optional
from copy import deepcopy

from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import FileResponse, JSONResponse

from models import FamilyTree, ExportOptions, LayoutOptions, Person

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


@router.get("/export-json")
async def export_json():
    """Export tree as JSON with embedded base64 photos for client download."""
    if tree_state is None:
        raise HTTPException(status_code=500, detail="Tree state not initialized")
    
    # Create a deep copy to embed photos
    export_data = deepcopy(tree_state.tree.model_dump())
    
    # Embed photos as base64
    for person_id, person in export_data["persons"].items():
        if person.get("photo_path"):
            photo_path = UPLOADS_DIR / os.path.basename(person["photo_path"])
            if photo_path.exists():
                try:
                    with open(photo_path, "rb") as f:
                        photo_data = f.read()
                    # Detect mime type from extension
                    ext = photo_path.suffix.lower()
                    mime_types = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp"}
                    mime = mime_types.get(ext, "image/jpeg")
                    person["photo_base64"] = f"data:{mime};base64,{base64.b64encode(photo_data).decode('utf-8')}"
                except Exception as e:
                    logger.warning("Failed to embed photo %s: %s", photo_path, e)
    
    return JSONResponse(content=export_data)


@router.post("/import-json")
async def import_json(tree_data: FamilyTree):
    """Import tree from client-uploaded JSON, restoring base64 photos."""
    if tree_state is None:
        raise HTTPException(status_code=500, detail="Tree state not initialized")
    
    UPLOADS_DIR.mkdir(exist_ok=True)
    
    # Process base64 photos - save to disk and update photo_path
    for person_id, person in tree_data.persons.items():
        if person.photo_base64:
            try:
                # Parse data URL: data:image/jpeg;base64,/9j/4AAQ...
                if person.photo_base64.startswith("data:"):
                    header, data = person.photo_base64.split(",", 1)
                    # Extract extension from mime type
                    mime = header.split(";")[0].split(":")[1]
                    ext_map = {"image/jpeg": ".jpg", "image/png": ".png", "image/gif": ".gif", "image/webp": ".webp"}
                    ext = ext_map.get(mime, ".jpg")
                else:
                    data = person.photo_base64
                    ext = ".jpg"
                
                # Decode and save
                photo_bytes = base64.b64decode(data)
                filename = f"{person_id}{ext}"
                filepath = UPLOADS_DIR / filename
                with open(filepath, "wb") as f:
                    f.write(photo_bytes)
                
                person.photo_path = f"uploads/{filename}"
                person.photo_base64 = None  # Clear base64 after saving
                logger.info("Restored photo for %s: %s", person.name, filepath)
            except Exception as e:
                logger.warning("Failed to restore photo for %s: %s", person.name, e)
                person.photo_path = None
                person.photo_base64 = None
    
    tree_state.save_state("import_json")
    tree_state.tree = tree_data
    
    logger.info("Imported tree with %d persons", len(tree_data.persons))
    return {"status": "imported", "persons": len(tree_data.persons)}

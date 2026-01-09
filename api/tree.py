"""
Tree operations API endpoints (undo/redo, export, layout, JSON import/export).
"""
import json
import logging
import os
import base64
from datetime import datetime
from pathlib import Path
from typing import Optional
from copy import deepcopy

from fastapi import APIRouter, HTTPException, UploadFile, File, Request, Response
from fastapi.responses import FileResponse, JSONResponse

from models import FamilyTree, ExportOptions, LayoutOptions, Person

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/tree", tags=["tree"])

UPLOADS_DIR = Path("uploads")

# Session management functions (set by main.py)
session_manager = None
get_session_from_request = None
set_session_cookie = None


def set_session_manager(manager, get_session_func, set_cookie_func):
    """Set the session manager and helper functions."""
    global session_manager, get_session_from_request, set_session_cookie
    session_manager = manager
    get_session_from_request = get_session_func
    set_session_cookie = set_cookie_func


def get_tree_state(request: Request, response: Response):
    """Get tree state for current session."""
    session_id, tree_state = get_session_from_request(request)
    set_session_cookie(response, session_id)
    return tree_state


@router.get("")
async def get_tree(request: Request, response: Response):
    """Get the entire family tree."""
    tree_state = get_tree_state(request, response)
    
    return {
        "tree": tree_state.tree.model_dump(),
        "can_undo": tree_state.can_undo(),
        "can_redo": tree_state.can_redo()
    }


@router.post("/new")
async def new_tree(request: Request, response: Response):
    """Create a new empty tree."""
    tree_state = get_tree_state(request, response)
    
    tree_state.save_state("new_tree")
    tree_state.tree = FamilyTree()
    logger.info("Created new tree")
    return {"status": "created"}


@router.post("/undo")
async def undo(request: Request, response: Response):
    """Undo the last action."""
    tree_state = get_tree_state(request, response)
    
    if not tree_state.undo():
        raise HTTPException(status_code=400, detail="Nothing to undo")
    
    return {
        "status": "undone",
        "can_undo": tree_state.can_undo(),
        "can_redo": tree_state.can_redo()
    }


@router.post("/redo")
async def redo(request: Request, response: Response):
    """Redo the last undone action."""
    tree_state = get_tree_state(request, response)
    
    if not tree_state.redo():
        raise HTTPException(status_code=400, detail="Nothing to redo")
    
    return {
        "status": "redone",
        "can_undo": tree_state.can_undo(),
        "can_redo": tree_state.can_redo()
    }


@router.post("/export")
async def export_tree(options: ExportOptions, request: Request, response: Response):
    """Export the tree as an image or PDF."""
    tree_state = get_tree_state(request, response)
    
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
async def auto_layout(options: LayoutOptions, request: Request, response: Response):
    """Auto-arrange the tree with the specified layout."""
    tree_state = get_tree_state(request, response)
    
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
async def upload_photo(request: Request, response: Response, file: UploadFile = File(...)):
    """Upload a photo file."""
    # Get session to ensure cookie is set
    get_tree_state(request, response)
    
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
async def export_json(request: Request, response: Response):
    """Export tree as JSON with embedded base64 photos for client download."""
    tree_state = get_tree_state(request, response)
    
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
async def import_json(tree_data: FamilyTree, request: Request, response: Response):
    """Import tree from client-uploaded JSON, restoring base64 photos."""
    tree_state = get_tree_state(request, response)
    
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

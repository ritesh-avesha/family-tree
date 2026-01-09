"""
Relationship API endpoints (marriages and parent-child).
"""
import logging
from fastapi import APIRouter, HTTPException, Request, Response

from models import Marriage, MarriageCreate, ParentChild, ParentChildCreate

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["relationships"])

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


@router.post("/marriages", response_model=Marriage)
async def create_marriage(marriage_data: MarriageCreate, request: Request, response: Response):
    """Create a new marriage between two persons."""
    tree_state = get_tree_state(request, response)
    
    # Validate persons exist
    if marriage_data.spouse1_id not in tree_state.tree.persons:
        raise HTTPException(status_code=404, detail="Spouse 1 not found")
    if marriage_data.spouse2_id not in tree_state.tree.persons:
        raise HTTPException(status_code=404, detail="Spouse 2 not found")
    
    # Calculate order for this marriage
    existing_marriages = [
        m for m in tree_state.tree.marriages.values()
        if m.spouse1_id in [marriage_data.spouse1_id, marriage_data.spouse2_id]
        or m.spouse2_id in [marriage_data.spouse1_id, marriage_data.spouse2_id]
    ]
    order = len(existing_marriages) + 1
    
    tree_state.save_state("create_marriage")
    
    marriage = Marriage(
        spouse1_id=marriage_data.spouse1_id,
        spouse2_id=marriage_data.spouse2_id,
        marriage_date=marriage_data.marriage_date,
        order=order
    )
    tree_state.tree.marriages[marriage.id] = marriage
    logger.info("Created marriage: %s", marriage.id)
    return marriage


@router.get("/marriages", response_model=list[Marriage])
async def list_marriages(request: Request, response: Response):
    """List all marriages."""
    tree_state = get_tree_state(request, response)
    return list(tree_state.tree.marriages.values())


@router.put("/marriages/{marriage_id}", response_model=Marriage)
async def update_marriage(marriage_id: str, data: dict, request: Request, response: Response):
    """Update marriage details."""
    tree_state = get_tree_state(request, response)
    
    if marriage_id not in tree_state.tree.marriages:
        raise HTTPException(status_code=404, detail="Marriage not found")
    
    tree_state.save_state("update_marriage")
    
    marriage = tree_state.tree.marriages[marriage_id]
    
    # Update allowed fields
    if "marriage_date" in data:
        marriage.marriage_date = data["marriage_date"]
    
    logger.info("Updated marriage: %s", marriage_id)
    return marriage


@router.delete("/marriages/{marriage_id}")
async def delete_marriage(marriage_id: str, request: Request, response: Response):
    """Delete a marriage."""
    tree_state = get_tree_state(request, response)
    
    if marriage_id not in tree_state.tree.marriages:
        raise HTTPException(status_code=404, detail="Marriage not found")
    
    tree_state.save_state("delete_marriage")
    
    # Remove marriage
    del tree_state.tree.marriages[marriage_id]
    
    # Remove parent-child relationships linked to this marriage
    tree_state.tree.parent_child = [
        pc for pc in tree_state.tree.parent_child
        if pc.marriage_id != marriage_id
    ]
    
    logger.info("Deleted marriage: %s", marriage_id)
    return {"status": "deleted", "id": marriage_id}


@router.post("/children", response_model=ParentChild)
async def add_child(relation: ParentChildCreate, request: Request, response: Response):
    """Add a child to a parent (optionally linked to a marriage)."""
    tree_state = get_tree_state(request, response)
    
    # Validate persons exist
    if relation.parent_id not in tree_state.tree.persons:
        raise HTTPException(status_code=404, detail="Parent not found")
    if relation.child_id not in tree_state.tree.persons:
        raise HTTPException(status_code=404, detail="Child not found")
    if relation.marriage_id and relation.marriage_id not in tree_state.tree.marriages:
        raise HTTPException(status_code=404, detail="Marriage not found")
    
    # Check for existing relationship
    existing = [
        pc for pc in tree_state.tree.parent_child
        if pc.parent_id == relation.parent_id and pc.child_id == relation.child_id
    ]
    if existing:
        raise HTTPException(status_code=400, detail="Relationship already exists")
    
    tree_state.save_state("add_child")
    
    parent_child = ParentChild(
        parent_id=relation.parent_id,
        child_id=relation.child_id,
        marriage_id=relation.marriage_id
    )
    tree_state.tree.parent_child.append(parent_child)
    logger.info("Added child relation: %s -> %s", relation.parent_id, relation.child_id)
    return parent_child


@router.get("/children", response_model=list[ParentChild])
async def list_parent_child(request: Request, response: Response):
    """List all parent-child relationships."""
    tree_state = get_tree_state(request, response)
    return tree_state.tree.parent_child


@router.delete("/children/{parent_id}/{child_id}")
async def remove_child(parent_id: str, child_id: str, request: Request, response: Response):
    """Remove a parent-child relationship."""
    tree_state = get_tree_state(request, response)
    
    original_len = len(tree_state.tree.parent_child)
    
    tree_state.save_state("remove_child")
    
    tree_state.tree.parent_child = [
        pc for pc in tree_state.tree.parent_child
        if not (pc.parent_id == parent_id and pc.child_id == child_id)
    ]
    
    if len(tree_state.tree.parent_child) == original_len:
        raise HTTPException(status_code=404, detail="Relationship not found")
    
    logger.info("Removed child relation: %s -> %s", parent_id, child_id)
    return {"status": "deleted", "parent_id": parent_id, "child_id": child_id}

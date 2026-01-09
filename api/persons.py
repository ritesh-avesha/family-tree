"""
Person CRUD API endpoints.
"""
import logging
from fastapi import APIRouter, HTTPException, Request, Response

from models import Person, PersonCreate, PersonUpdate, PositionUpdate

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/persons", tags=["persons"])

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


@router.post("", response_model=Person)
async def create_person(person_data: PersonCreate, request: Request, response: Response):
    """Create a new person."""
    tree_state = get_tree_state(request, response)
    
    person = Person(**person_data.model_dump())
    tree_state.save_state("create_person")
    tree_state.tree.persons[person.id] = person
    logger.info("Created person: %s", person.id)
    return person


@router.get("/{person_id}", response_model=Person)
async def get_person(person_id: str, request: Request, response: Response):
    """Get a person by ID."""
    tree_state = get_tree_state(request, response)
    
    if person_id not in tree_state.tree.persons:
        raise HTTPException(status_code=404, detail="Person not found")
    
    return tree_state.tree.persons[person_id]


@router.get("", response_model=list[Person])
async def list_persons(request: Request, response: Response):
    """List all persons."""
    tree_state = get_tree_state(request, response)
    return list(tree_state.tree.persons.values())


@router.put("/{person_id}", response_model=Person)
async def update_person(person_id: str, person_data: PersonUpdate, request: Request, response: Response):
    """Update a person."""
    tree_state = get_tree_state(request, response)
    
    if person_id not in tree_state.tree.persons:
        raise HTTPException(status_code=404, detail="Person not found")
    
    tree_state.save_state("update_person")
    person = tree_state.tree.persons[person_id]
    update_data = person_data.model_dump(exclude_unset=True)
    
    for field, value in update_data.items():
        setattr(person, field, value)
    
    tree_state.tree.persons[person_id] = person
    logger.info("Updated person: %s", person_id)
    return person


@router.patch("/{person_id}/position", response_model=Person)
async def update_position(person_id: str, position: PositionUpdate, request: Request, response: Response):
    """Update just the position of a person."""
    tree_state = get_tree_state(request, response)
    
    if person_id not in tree_state.tree.persons:
        raise HTTPException(status_code=404, detail="Person not found")
    
    # Don't save state for position updates (would be too many)
    person = tree_state.tree.persons[person_id]
    person.x = position.x
    person.y = position.y
    tree_state.tree.persons[person_id] = person
    
    tree_state.force_save()
    
    return person


@router.patch("/positions", response_model=dict)
async def update_positions(positions: list[dict], request: Request, response: Response):
    """Update positions for multiple persons."""
    tree_state = get_tree_state(request, response)
    
    count = 0
    for pos in positions:
        person_id = pos.get('id')
        if person_id in tree_state.tree.persons:
            person = tree_state.tree.persons[person_id]
            person.x = pos.get('x')
            person.y = pos.get('y')
            count += 1
            
    if count > 0:
        tree_state.force_save()
            
    return {"status": "success", "updated_count": count}


@router.delete("/{person_id}")
async def delete_person(person_id: str, request: Request, response: Response):
    """Delete a person and all their relationships."""
    tree_state = get_tree_state(request, response)
    
    if person_id not in tree_state.tree.persons:
        raise HTTPException(status_code=404, detail="Person not found")
    
    tree_state.save_state("delete_person")
    
    # Remove person
    del tree_state.tree.persons[person_id]
    
    # Remove marriages involving this person
    marriages_to_remove = [
        m_id for m_id, m in tree_state.tree.marriages.items()
        if m.spouse1_id == person_id or m.spouse2_id == person_id
    ]
    for m_id in marriages_to_remove:
        del tree_state.tree.marriages[m_id]
    
    # Remove parent-child relationships
    tree_state.tree.parent_child = [
        pc for pc in tree_state.tree.parent_child
        if pc.parent_id != person_id and pc.child_id != person_id
    ]
    
    logger.info("Deleted person: %s", person_id)
    return {"status": "deleted", "id": person_id}

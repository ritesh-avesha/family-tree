"""
Person CRUD API endpoints.
"""
import logging
from fastapi import APIRouter, HTTPException

from models import Person, PersonCreate, PersonUpdate, PositionUpdate

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/persons", tags=["persons"])

# In-memory storage - will be managed by tree_state
tree_state = None


def set_tree_state(state):
    """Set the shared tree state."""
    global tree_state
    tree_state = state


@router.post("", response_model=Person)
async def create_person(person_data: PersonCreate):
    """Create a new person."""
    if tree_state is None:
        raise HTTPException(status_code=500, detail="Tree state not initialized")
    
    person = Person(**person_data.model_dump())
    tree_state.save_state("create_person")
    tree_state.tree.persons[person.id] = person
    logger.info("Created person: %s", person.id)
    return person


@router.get("/{person_id}", response_model=Person)
async def get_person(person_id: str):
    """Get a person by ID."""
    if tree_state is None:
        raise HTTPException(status_code=500, detail="Tree state not initialized")
    
    if person_id not in tree_state.tree.persons:
        raise HTTPException(status_code=404, detail="Person not found")
    
    return tree_state.tree.persons[person_id]


@router.get("", response_model=list[Person])
async def list_persons():
    """List all persons."""
    if tree_state is None:
        raise HTTPException(status_code=500, detail="Tree state not initialized")
    
    return list(tree_state.tree.persons.values())


@router.put("/{person_id}", response_model=Person)
async def update_person(person_id: str, person_data: PersonUpdate):
    """Update a person."""
    if tree_state is None:
        raise HTTPException(status_code=500, detail="Tree state not initialized")
    
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
async def update_position(person_id: str, position: PositionUpdate):
    """Update just the position of a person."""
    if tree_state is None:
        raise HTTPException(status_code=500, detail="Tree state not initialized")
    
    if person_id not in tree_state.tree.persons:
        raise HTTPException(status_code=404, detail="Person not found")
    
    # Don't save state for position updates (would be too many)
    person = tree_state.tree.persons[person_id]
    person.x = position.x
    person.y = position.y
    tree_state.tree.persons[person_id] = person
    
    # Persist to disk
    tree_state.force_save()
    
    return person


@router.patch("/positions", response_model=dict)
async def update_positions(positions: list[dict]):
    """Update positions for multiple persons."""
    if tree_state is None:
        raise HTTPException(status_code=500, detail="Tree state not initialized")
    
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
async def delete_person(person_id: str):
    """Delete a person and all their relationships."""
    if tree_state is None:
        raise HTTPException(status_code=500, detail="Tree state not initialized")
    
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

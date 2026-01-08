"""
Layout service for auto-arranging the family tree.
"""
import logging
from typing import Dict, Any

from models import FamilyTree, LayoutOptions

logger = logging.getLogger(__name__)


def calculate_layout(tree: FamilyTree, options: LayoutOptions) -> Dict[str, Dict[str, float]]:
    """
    Calculate positions for all persons in the tree starting from root.
    
    Uses a hierarchical layout algorithm that:
    1. Places the root person and their spouses
    2. Places children below (or to the right) of their parents
    3. Recursively processes descendants
    """
    positions = {}
    visited = set()
    
    if not tree.persons:
        return positions
    
    root_id = options.root_person_id
    if root_id not in tree.persons:
        logger.warning("Root person not found: %s", root_id)
        return positions
    
    spacing_x = options.spacing_x
    spacing_y = options.spacing_y
    is_horizontal = options.direction == "left-right"
    
    # Build relationship indices
    marriages_by_person = {}
    children_by_marriage = {}
    children_by_parent = {}
    
    for marriage in tree.marriages.values():
        marriages_by_person.setdefault(marriage.spouse1_id, []).append(marriage)
        marriages_by_person.setdefault(marriage.spouse2_id, []).append(marriage)
        children_by_marriage[marriage.id] = []
    
    for pc in tree.parent_child:
        children_by_parent.setdefault(pc.parent_id, []).append(pc.child_id)
        if pc.marriage_id and pc.marriage_id in children_by_marriage:
            if pc.child_id not in children_by_marriage[pc.marriage_id]:
                children_by_marriage[pc.marriage_id].append(pc.child_id)
    
    # Track current position for each level
    level_positions = {}
    
    def get_next_position(level: int) -> float:
        """Get next available position at a level."""
        if level not in level_positions:
            level_positions[level] = 0
        pos = level_positions[level]
        level_positions[level] += spacing_x
        return pos
    
    def place_family_unit(person_id: str, level: int, base_x: float) -> float:
        """Place a person and their family, return the width used."""
        if person_id in visited:
            return 0
        
        visited.add(person_id)
        
        # Get marriages for this person
        person_marriages = marriages_by_person.get(person_id, [])
        
        # Collect all children from all marriages
        all_children = []
        spouses = []
        
        for marriage in sorted(person_marriages, key=lambda m: m.order):
            spouse_id = marriage.spouse2_id if marriage.spouse1_id == person_id else marriage.spouse1_id
            if spouse_id not in visited:
                spouses.append(spouse_id)
                visited.add(spouse_id)
            
            children = children_by_marriage.get(marriage.id, [])
            all_children.extend(children)
        
        # Also get children without marriage link
        direct_children = children_by_parent.get(person_id, [])
        for child_id in direct_children:
            if child_id not in all_children:
                all_children.append(child_id)
        
        # Remove duplicates while preserving order
        seen = set()
        unique_children = []
        for c in all_children:
            if c not in seen:
                seen.add(c)
                unique_children.append(c)
        all_children = unique_children
        
        # Calculate width needed for children
        children_width = 0
        child_positions = []
        
        for child_id in all_children:
            child_x = base_x + children_width
            child_width = place_family_unit(child_id, level + 1, child_x)
            if child_width > 0:
                child_positions.append((child_id, child_x, child_width))
                children_width += child_width
        
        if not child_positions:
            children_width = spacing_x * (1 + len(spouses))
        
        # Calculate center position for this family unit
        family_x = base_x + children_width / 2 - (spacing_x * (1 + len(spouses))) / 2
        
        # Position main person
        if is_horizontal:
            positions[person_id] = {"x": level * spacing_y, "y": family_x}
        else:
            positions[person_id] = {"x": family_x, "y": level * spacing_y}
        
        # Position spouses
        for i, spouse_id in enumerate(spouses):
            spouse_offset = spacing_x * (i + 1)
            if is_horizontal:
                positions[spouse_id] = {"x": level * spacing_y, "y": family_x + spouse_offset}
            else:
                positions[spouse_id] = {"x": family_x + spouse_offset, "y": level * spacing_y}
        
        return max(children_width, spacing_x * (1 + len(spouses)))
    
    # Start layout from root
    place_family_unit(root_id, 0, 0)
    
    # Handle any unvisited persons (disconnected parts)
    unvisited = [p_id for p_id in tree.persons if p_id not in visited]
    if unvisited:
        max_y = max((p["y"] for p in positions.values()), default=0) if not is_horizontal else 0
        max_x = max((p["x"] for p in positions.values()), default=0) if is_horizontal else 0
        
        for i, person_id in enumerate(unvisited):
            if is_horizontal:
                positions[person_id] = {"x": max_x + spacing_y, "y": i * spacing_x}
            else:
                positions[person_id] = {"x": i * spacing_x, "y": max_y + spacing_y}
    
    logger.info("Calculated layout for %d persons", len(positions))
    return positions

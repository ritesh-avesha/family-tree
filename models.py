"""
Pydantic models for the Family Tree application.
"""
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime
import uuid


def generate_id() -> str:
    """Generate a unique ID."""
    return str(uuid.uuid4())


class Person(BaseModel):
    """Model representing a person in the family tree."""
    id: str = Field(default_factory=generate_id)
    name: str
    gender: str = "unknown"  # male, female, unknown
    date_of_birth: Optional[str] = None
    date_of_death: Optional[str] = None
    photo_path: Optional[str] = None
    notes: Optional[str] = None
    x: float = 0.0
    y: float = 0.0


class PersonCreate(BaseModel):
    """Model for creating a new person."""
    name: str
    gender: str = "unknown"
    date_of_birth: Optional[str] = None
    date_of_death: Optional[str] = None
    photo_path: Optional[str] = None
    notes: Optional[str] = None
    x: float = 0.0
    y: float = 0.0


class PersonUpdate(BaseModel):
    """Model for updating a person."""
    name: Optional[str] = None
    gender: Optional[str] = None
    date_of_birth: Optional[str] = None
    date_of_death: Optional[str] = None
    photo_path: Optional[str] = None
    notes: Optional[str] = None
    x: Optional[float] = None
    y: Optional[float] = None


class PositionUpdate(BaseModel):
    """Model for updating just the position."""
    x: float
    y: float


class Marriage(BaseModel):
    """Model representing a marriage between two persons."""
    id: str = Field(default_factory=generate_id)
    spouse1_id: str
    spouse2_id: str
    marriage_date: Optional[str] = None
    order: int = 1  # Order of this marriage for the spouses


class MarriageCreate(BaseModel):
    """Model for creating a marriage."""
    spouse1_id: str
    spouse2_id: str
    marriage_date: Optional[str] = None


class ParentChild(BaseModel):
    """Model representing a parent-child relationship."""
    parent_id: str
    child_id: str
    marriage_id: Optional[str] = None  # Which marriage this child belongs to


class ParentChildCreate(BaseModel):
    """Model for creating a parent-child relationship."""
    parent_id: str
    child_id: str
    marriage_id: Optional[str] = None


class FamilyTree(BaseModel):
    """Model representing the entire family tree."""
    persons: Dict[str, Person] = Field(default_factory=dict)
    marriages: Dict[str, Marriage] = Field(default_factory=dict)
    parent_child: List[ParentChild] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class HistoryState(BaseModel):
    """Model for storing undo/redo state."""
    tree: FamilyTree
    action: str
    timestamp: str = Field(default_factory=lambda: datetime.now().isoformat())


class ExportOptions(BaseModel):
    """Model for export configuration."""
    format: str = "png"  # png, jpg, pdf
    width: int = 1920
    height: int = 1080
    quality: int = 90  # For JPG
    page_size: str = "A4"  # For PDF: A4, Letter, Legal, A3
    orientation: str = "landscape"  # portrait, landscape


class LayoutOptions(BaseModel):
    """Model for layout configuration."""
    direction: str = "top-down"  # top-down, left-right
    root_person_id: str
    spacing_x: float = 200.0
    spacing_y: float = 150.0

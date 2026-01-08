"""
Export service for generating PDF and image outputs.
"""
import io
import logging
import os
import tempfile
from datetime import datetime
from pathlib import Path

from models import FamilyTree, ExportOptions

logger = logging.getLogger(__name__)

EXPORTS_DIR = Path("exports")


def export_tree(tree: FamilyTree, options: ExportOptions) -> str:
    """
    Export the family tree as an image or PDF.
    Returns the path to the generated file.
    """
    EXPORTS_DIR.mkdir(exist_ok=True)
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    if options.format == "pdf":
        return export_pdf(tree, options, timestamp)
    else:
        return export_image(tree, options, timestamp)


def export_pdf(tree: FamilyTree, options: ExportOptions, timestamp: str) -> str:
    """Export tree as PDF."""
    from reportlab.lib.pagesizes import A4, A3, A2, A1, A0, B0, LETTER, LEGAL, TABLOID, landscape, portrait
    from reportlab.pdfgen import canvas
    from reportlab.lib.units import mm, inch
    
    # Standard page sizes plus large format
    page_sizes = {
        "A4": A4,
        "A3": A3,
        "A2": A2,
        "A1": A1,
        "A0": A0,
        "B0": B0,
        "Letter": LETTER,
        "Legal": LEGAL,
        "Tabloid": TABLOID,
        "Arch-E": (36 * inch, 48 * inch),  # Architectural E size
        "Custom-Large": (1200 * mm, 900 * mm),  # Custom large format
    }
    
    page_size = page_sizes.get(options.page_size, A4)
    if options.orientation == "landscape":
        page_size = landscape(page_size)
    else:
        page_size = portrait(page_size)
    
    filename = f"family_tree_{timestamp}.pdf"
    filepath = EXPORTS_DIR / filename
    
    c = canvas.Canvas(str(filepath), pagesize=page_size)
    width, height = page_size
    
    if not tree.persons:
        c.drawString(50, height - 50, "Empty Family Tree")
        c.save()
        return str(filepath)
    
    # Calculate bounds
    min_x = min(p.x for p in tree.persons.values())
    max_x = max(p.x for p in tree.persons.values())
    min_y = min(p.y for p in tree.persons.values())
    max_y = max(p.y for p in tree.persons.values())
    
    tree_width = max_x - min_x + 200
    tree_height = max_y - min_y + 200
    
    # Calculate scale
    margin = 50
    available_width = width - 2 * margin
    available_height = height - 2 * margin
    
    scale_x = available_width / tree_width if tree_width > 0 else 1
    scale_y = available_height / tree_height if tree_height > 0 else 1
    scale = min(scale_x, scale_y, 1)
    
    def transform_x(x):
        return margin + (x - min_x + 100) * scale
    
    def transform_y(y):
        return height - margin - (y - min_y + 100) * scale
    
    # Draw connections first
    c.setStrokeColorRGB(0.3, 0.3, 0.3)
    c.setLineWidth(1)
    
    # Draw marriage lines
    for marriage in tree.marriages.values():
        if marriage.spouse1_id in tree.persons and marriage.spouse2_id in tree.persons:
            p1 = tree.persons[marriage.spouse1_id]
            p2 = tree.persons[marriage.spouse2_id]
            
            x1, y1 = transform_x(p1.x), transform_y(p1.y)
            x2, y2 = transform_x(p2.x), transform_y(p2.y)
            
            c.line(x1, y1, x2, y2)
    
    # Draw parent-child lines
    for pc in tree.parent_child:
        if pc.parent_id in tree.persons and pc.child_id in tree.persons:
            parent = tree.persons[pc.parent_id]
            child = tree.persons[pc.child_id]
            
            px, py = transform_x(parent.x), transform_y(parent.y)
            cx, cy = transform_x(child.x), transform_y(child.y)
            
            # Draw line from parent to child
            mid_y = (py + cy) / 2
            
            p = c.beginPath()
            p.moveTo(px, py)
            # Bezier C px,mid_y cx,mid_y cx,cy
            p.curveTo(px, mid_y, cx, mid_y, cx, cy)
            c.drawPath(p, stroke=1, fill=0)
    
    # Draw person nodes
    # Frontend uses approx 1.6 aspect ratio
    node_width = 80 * scale
    node_height = 50 * scale
    corner_radius = 5 * scale
    
    for person in tree.persons.values():
        x, y = transform_x(person.x), transform_y(person.y)
        
        # Determine color
        if person.gender == "male":
            fill_color = (0.816, 0.91, 1)  # #d0e8ff
            pil_fill = "#d0e8ff"
        elif person.gender == "female":
            fill_color = (1, 0.816, 0.91)  # #ffd0e8
            pil_fill = "#ffd0e8"
        else:
            fill_color = (0.91, 0.91, 0.91)  # #e8e8e8
            pil_fill = "#e8e8e8"
            
        c.setFillColorRGB(*fill_color)
        c.setStrokeColorRGB(0, 0, 0)
        c.setLineWidth(1)
        
        # Draw rounded rect centered at x, y
        c.roundRect(x - node_width/2, y - node_height/2, node_width, node_height, corner_radius, stroke=1, fill=1)
        
        # Draw name
        c.setFillColorRGB(0, 0, 0)
        c.setFont("Helvetica-Bold", 8 * scale)
        
        name_parts = person.name.split()
        if len(name_parts) > 2:
            c.drawCentredString(x, y + 4, " ".join(name_parts[:2]))
            c.drawCentredString(x, y - 8, " ".join(name_parts[2:]))
        else:
            c.drawCentredString(x, y, person.name)
        
        # Draw dates below node
        c.setFont("Helvetica", 6 * scale)
        dates = []
        if person.date_of_birth:
            dates.append(f"b. {person.date_of_birth}")
        if person.date_of_death:
            dates.append(f"d. {person.date_of_death}")
        
        if dates:
            c.drawCentredString(x, y - node_height/2 - 10, " | ".join(dates))
    
    c.save()
    logger.info("Exported PDF: %s", filepath)
    return str(filepath)


def export_image(tree: FamilyTree, options: ExportOptions, timestamp: str) -> str:
    """Export tree as PNG or JPG image."""
    from PIL import Image, ImageDraw, ImageFont
    
    width = options.width
    height = options.height
    
    # Create image
    img = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(img)
    
    if not tree.persons:
        draw.text((50, 50), "Empty Family Tree", fill="black")
    else:
        # Calculate bounds
        min_x = min(p.x for p in tree.persons.values())
        max_x = max(p.x for p in tree.persons.values())
        min_y = min(p.y for p in tree.persons.values())
        max_y = max(p.y for p in tree.persons.values())
        
        tree_width = max_x - min_x + 200
        tree_height = max_y - min_y + 200
        
        # Calculate scale
        margin = 50
        available_width = width - 2 * margin
        available_height = height - 2 * margin
        
        scale_x = available_width / tree_width if tree_width > 0 else 1
        scale_y = available_height / tree_height if tree_height > 0 else 1
        scale = min(scale_x, scale_y, 1)
        
        def transform_x(x):
            return margin + (x - min_x + 100) * scale
        
        def transform_y(y):
            return margin + (y - min_y + 100) * scale

        def draw_bezier(p0, p1, p2, p3, steps=20, fill="gray", width=1):
            points = []
            for i in range(steps + 1):
                t = i / steps
                # Cubic Bezier
                x = (1-t)**3 * p0[0] + 3*(1-t)**2 * t * p1[0] + 3*(1-t) * t**2 * p2[0] + t**3 * p3[0]
                y = (1-t)**3 * p0[1] + 3*(1-t)**2 * t * p1[1] + 3*(1-t) * t**2 * p2[1] + t**3 * p3[1]
                points.append((x, y))
            draw.line(points, fill=fill, width=width)
        
        # Draw marriage lines
        for marriage in tree.marriages.values():
            if marriage.spouse1_id in tree.persons and marriage.spouse2_id in tree.persons:
                p1 = tree.persons[marriage.spouse1_id]
                p2 = tree.persons[marriage.spouse2_id]
                
                x1, y1 = transform_x(p1.x), transform_y(p1.y)
                x2, y2 = transform_x(p2.x), transform_y(p2.y)
                
                draw.line([(x1, y1), (x2, y2)], fill="gray", width=2)
        
        # Draw parent-child lines
        for pc in tree.parent_child:
            if pc.parent_id in tree.persons and pc.child_id in tree.persons:
                parent = tree.persons[pc.parent_id]
                child = tree.persons[pc.child_id]
                
                px, py = transform_x(parent.x), transform_y(parent.y)
                cx, cy = transform_x(child.x), transform_y(child.y)
                
                mid_y = (py + cy) / 2
                
                # Bezier segments
                p0 = (px, py)
                p1 = (px, mid_y)
                p2 = (cx, mid_y)
                p3 = (cx, cy)
                
                draw_bezier(p0, p1, p2, p3, fill="gray", width=1)
        
        # Draw person nodes
        node_width = 80 * scale
        node_height = 50 * scale
        
        try:
            font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", int(10 * scale))
            small_font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", int(8 * scale))
        except OSError:
            font = ImageFont.load_default()
            small_font = font
        
        for person in tree.persons.values():
            x, y = int(transform_x(person.x)), int(transform_y(person.y))
            
            # Determine color
            if person.gender == "male":
                pil_fill = "#d0e8ff"
            elif person.gender == "female":
                pil_fill = "#ffd0e8"
            else:
                pil_fill = "#e8e8e8"
            
            # Draw rounded rectangle
            x0, y0 = x - node_width/2, y - node_height/2
            x1, y1 = x + node_width/2, y + node_height/2
            draw.rounded_rectangle([x0, y0, x1, y1], radius=5, fill=pil_fill, outline="black", width=1)
            
            # Draw name
            bbox = draw.textbbox((0, 0), person.name, font=font)
            text_width = bbox[2] - bbox[0]
            draw.text((x - text_width // 2, y - 6), person.name, fill="black", font=font)
            
            # Draw dates
            dates = []
            if person.date_of_birth:
                dates.append(f"b. {person.date_of_birth}")
            if person.date_of_death:
                dates.append(f"d. {person.date_of_death}")
            
            if dates:
                date_text = " | ".join(dates)
                bbox = draw.textbbox((0, 0), date_text, font=small_font)
                text_width = bbox[2] - bbox[0]
                draw.text(
                    (x - text_width // 2, y + node_height/2 + 5),
                    date_text,
                    fill="gray",
                    font=small_font
                )
    
    # Save image
    ext = options.format if options.format in ["png", "jpg", "jpeg"] else "png"
    filename = f"family_tree_{timestamp}.{ext}"
    filepath = EXPORTS_DIR / filename
    
    if ext in ["jpg", "jpeg"]:
        img.save(str(filepath), "JPEG", quality=options.quality)
    else:
        img.save(str(filepath), "PNG")
    
    logger.info("Exported image: %s", filepath)
    return str(filepath)

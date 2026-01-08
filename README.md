# Family Tree Builder

A modern, web-based tool for creating, visualizing, and managing family trees.

## 🚀 Features
- **Interactive Visualization**: Build and explore family trees in your browser.
- **Auto-save**: Progress is automatically persisted to `data/autosave.json`.
- **Undo/Redo**: Robust state management to revert or redo changes.
- **Exports**: Export trees to high-quality formats for sharing (PDF, PNG).
- **Media Support**: Upload photos for family members.

## 🛠️ Setup & Installation

### 1. Create a Virtual Environment
```bash
python3 -m venv venv
source venv/bin/activate
```

### 2. Install Dependencies
```bash
pip install -r requirements.txt
```

### 3. Run the Server
```bash
uvicorn main:app --reload
```

Once running, access the app at: **[http://localhost:8000](http://localhost:8000)**

## 📂 Project Structure
- `api/`: API endpoints for persons, relationships, and tree operations.
- `static/`: Frontend application (HTML/JS/CSS).
- `data/`: JSON storage for tree data.
- `services/`: Business logic and export handlers.
- `models.py`: Data models and validation.
- `main.py`: Application entry point and state management.

## 📄 License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

# Family Tree Builder

A modern, web-based tool for creating, visualizing, and managing family trees. (Note: This is created via LLM via "vibecoding", mostly with Claude Opus 4.5 in Antigravity)

## 🚀 Features
- **Interactive Visualization**: Build and explore family trees in your browser.
- **JSON Export/Import**: Save your tree as a JSON file with embedded photos, load it anytime.
- **Undo/Redo**: Robust state management to revert or redo changes.
- **Exports**: Export trees to high-quality formats for sharing (PDF, PNG).
- **Media Support**: Upload photos for family members (embedded in exported JSON).

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

## ☁️ Cloud Deployment (Free)

### Deploy to Render.com
1. Push your code to GitHub
2. Sign up at [render.com](https://render.com)
3. Create a new "Web Service" and connect your GitHub repo
4. Render will auto-detect `render.yaml` and deploy

### Deploy with Docker
```bash
docker build -t family-tree .
docker run -p 8000:8000 family-tree
```

> **Note**: Cloud deployments are stateless. Use File → Export JSON to save your work, and File → Import JSON to restore it.

## 📂 Project Structure
- `api/`: API endpoints for persons, relationships, and tree operations.
- `static/`: Frontend application (HTML/JS/CSS).
- `services/`: Business logic and export handlers.
- `models.py`: Data models and validation.
- `main.py`: Application entry point and state management.

## 📄 License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.


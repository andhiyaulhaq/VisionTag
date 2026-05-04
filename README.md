# VisionTag 🎯

**VisionTag** is an elite, high-performance image annotation tool specifically designed for preparing datasets for YOLO training. Built with a "local-first" philosophy, it combines the speed of native desktop applications with the flexibility of modern web technologies.

![Version](https://img.shields.io/badge/version-0.1.0--alpha-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Tech](https://img.shields.io/badge/tech-Vanilla%20JS%20%7C%20Vite-orange)

---

## ✨ Key Features

- **🚀 High-Performance Canvas**: 60FPS zooming and panning, optimized for 4K+ images.
- **📁 Local File System Access**: Direct folder manipulation using the `File System Access API`—no uploads required.
- **🏷️ YOLO Optimized**: Seamlessly exports and imports `.txt` normalized coordinates and `classes.txt`.
- **🎨 Premium UI/UX**: A state-of-the-art "Dark Mode" interface designed to minimize eye strain and maximize productivity.
- **⚡ Hotkey Driven**: Fully controllable via keyboard for high-speed labeling workflows.
- **🛡️ Privacy First**: Your images never leave your machine. Everything happens locally in the browser.

---

## 🛠️ Technology Stack

- **Core**: Vanilla JavaScript (ES6+)
- **Build Tool**: [Vite](https://vitejs.dev/)
- **Styling**: Modern CSS3 (Variables, Flexbox, Grid)
- **Engine**: HTML5 Canvas (Hardware Accelerated)
- **API**: File System Access API

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher recommended)

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/your-repo/visiontag.git
   cd visiontag
   ```
2. Install dependencies:
   ```bash
   npm install
   ```

### Development
Start the local development server:
```bash
npm run dev
```
Open your browser and navigate to `http://localhost:5173`.

---

## 🎹 Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `W` | Enter Draw Mode |
| `V` | Enter Select/Move Mode |
| `D` | Next Image |
| `A` | Previous Image |
| `Del` | Delete Selected Bounding Box |
| `Space` | Hold to Pan |
| `Ctrl + Scroll` | Zoom In / Out |

---

## 🗺️ Roadmap

- [x] Phase 1: Foundation & Project Setup
- [ ] Phase 2: High-Performance Canvas Engine
- [ ] Phase 3: Interactive Labeling & Hotkeys
- [ ] Phase 4: YOLO Format Serialization
- [ ] Phase 5: GPU-Accelerated Semi-Labeling (WebGPU)

---

## 📄 License
Distributed under the MIT License. See `LICENSE` for more information.

---

Designed with ❤️ by the **Antigravity** Team.

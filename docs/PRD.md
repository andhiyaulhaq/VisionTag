# Product Requirements Document (PRD): VisionTag YOLO Annotator

## 1. Project Overview
**VisionTag** is a high-performance, aesthetically premium image annotation tool specifically designed for preparing datasets for YOLO (You Only Look Once) object detection models. Unlike existing tools that often feel clunky or dated, VisionTag prioritizes developer experience (DX), speed, and visual clarity.

### 1.1 Goal
To provide a seamless workflow for ML engineers and data annotators to draw, label, and export bounding box data in the standardized YOLO format (`.txt` files with normalized coordinates).

---

## 2. Target Audience
- **Machine Learning Engineers**: Who need to quickly refine or create small/medium datasets.
- **Data Labeling Teams**: Who require an efficient, hotkey-driven interface for high-volume work.
- **Computer Vision Researchers**: Who need a reliable tool for ground-truth verification.

---

## 3. Core Features

### 3.1 Project & Dataset Management
- **Directory Loading**: Ability to point the tool to a folder of images.
- **Auto-Discovery**: Automatically find and load existing annotations if they exist in the same or a paired directory.
- **Classes Management**: Define, color-code, and persist a `classes.txt` file.

### 3.2 Annotation Engine (The Canvas)
- **Bounding Box Creation**: Click-and-drag to create boxes.
- **Precision Editing**: Handle-based resizing and drag-and-drop movement.
- **Zoom & Pan**: Smooth navigation for high-resolution images (60FPS performance).
- **Crosshair Cursor**: Full-screen crosshair for precise alignment.

### 3.3 YOLO Format Integration
- **Real-time Serialization**: Annotations are converted to YOLO format (normalized `[class_id x_center y_center width height]`).
- **Import/Export**: Seamlessly read/write the `.txt` format used by YOLOv5, YOLOv8, and YOLOv11.

### 3.4 User Experience (UX) & Aesthetics
- **Premium Dark Mode**: A sleek, high-contrast interface to reduce eye strain during long labeling sessions.
- **Micro-animations**: Subtle feedback when saving, switching images, or selecting labels.
- **Responsive Layout**: Sidebar for class selection and thumbnail navigation.

### 3.5 Hotkey System (Speed-focused)
- `W`: Enter Draw Mode.
- `D / A`: Next / Previous Image.
- `Del / Backspace`: Delete selected box.
- `Ctrl + S`: Force Save (though auto-save is default).
- `1-9`: Quickly assign class ID to selected box.

---

## 4. Technical Requirements

### 4.1 Frontend Architecture
- **Framework**: React or Vite-based Vanilla JS.
- **Rendering**: HTML5 Canvas or SVG (Canvas preferred for performance with many boxes).
- **Styling**: Modern Vanilla CSS with CSS Variables for theme consistency.

### 4.2 Data Persistence
- **Local File System Access**: Utilizing the File System Access API (for web-based) or Electron/Native file handling for local apps.
- **State Management**: Robust local state to prevent data loss during crashes.

### 4.3 Performance Benchmarks
- **Large Image Support**: Handle 4K+ images without UI lag.
- **Low Memory Footprint**: Efficient garbage collection when cycling through hundreds of images.

---

## 5. UI/UX Design Goals
- **Minimalist Overlay**: Keep the UI out of the way of the image being annotated.
- **Visual Hierarchy**: Clearly distinguish the "Active" box from "Inactive" boxes.
- **Color Coding**: Automatically assign distinct, high-contrast colors to different classes.

---

## 6. Future Enhancements (V2)
- **Auto-Labeling**: Integration with a pre-trained YOLO model to suggest boxes.
- **Segmentation Support**: Ability to draw polygons for Instance Segmentation.
- **Cloud Sync**: Collaborative labeling for distributed teams.

---

## 7. Success Metrics
- **Annotation Speed**: Time taken per image (target: < 10 seconds for 3-5 objects).
- **Accuracy**: Reduced "mis-click" rate through better handle hit-boxes.
- **User Satisfaction**: Qualitative feedback on the "look and feel" of the tool.

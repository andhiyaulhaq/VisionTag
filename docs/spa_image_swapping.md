# SPA-Style Responsive Image Swapping

**Created at**: 2026-05-06 10:40:15 || **Last modified**: 2026-05-06 10:40:15


## Overview
This document outlines the technical feasibility and implementation strategy for transitioning the SharpTensor image navigation system to a high-performance SPA (Single Page Application) approach. The goal is to eliminate visual latency and the "Loading" flicker during dataset navigation.

## Feasibility Analysis
The current bottleneck stems from the "clean slate" load approach: every image swap triggers disk I/O (getFile), decoding (createImageBitmap), and annotation parsing. This creates a perceptible lag.

Implementing an **Elastic Neighbor Cache** is highly feasible:
1.  **Memory Efficiency**: Modern browsers can store 10–20 `ImageBitmap` objects (~5–10MB per 4K image) without significant overhead.
2.  **Background Warm-up**: By decoupling the "Visual Load" (Bitmap/Annotations) from the "AI Warm-up" (SAM Encoder), we can show images instantly while the AI processes in the background.
3.  **Model Persistence**: The ONNX models already remain in memory; we only need to cache the per-image inference results.

## Implementation Strategy

### 1. Intelligent Asset Cache
Implement a `Map<index, {bitmap, annotations}>` in `main.js` to store decoded assets for a neighborhood of images (e.g., current ± 5).

### 2. Smart Pre-loader
Add an async background task that proactively fetches and decodes adjacent images. This ensures that by the time a user clicks "Next" or a sidebar item, the data is already in memory.

### 3. AI Embedding Caching
Update the `ai.js` engine to store SAM `imageEmbeddings` for the most recently visited images. This makes switching back to a previous image in segmentation mode near-instant.

## Technical Benefits
- **Zero-Flicker Navigation**: The "Loading Dataset" overlay only appears during the initial folder load.
- **Improved UX**: Annotations appear at the same millisecond as the image, preventing "popping" effects.
- **Reduced Disk Stress**: Frequent navigation back and forth doesn't trigger repeated disk reads.

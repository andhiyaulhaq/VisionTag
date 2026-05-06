# Web Worker Migration for AI Inference

**Created at**: 2026-05-06 11:11:19 || **Last modified**: 2026-05-06 11:11:19

## Overview
This document describes the architectural transition of the SharpTensor AI pipeline from a single-threaded execution model to a multi-threaded **Web Worker** architecture. This migration is essential for maintaining a fluid, professional user interface during heavy AI processing tasks.

## The Problem: Main Thread Blocking
Currently, the MobileSAM Encoder inference takes approximately **8.7 seconds**. Because this math-heavy process runs on the main JavaScript thread:
- The UI "freezes" during the 8.7-second window.
- Mouse events (hover, clicks, cursor style changes) are ignored.
- The user experience feels "broken" or "unresponsive."

## The Solution: Dedicated AI Worker
By moving the AI Encoder to a background Web Worker, we decouple the heavy mathematical computation from the user interface rendering.

### Architecture Comparison

| Feature | Current Model (Main Thread) | New Model (Web Worker) |
| :--- | :--- | :--- |
| **UI Responsiveness** | Blocks for 8s+ | **60 FPS throughout** |
| **Mouse Interaction** | Frozen during inference | **Always active** |
| **CPU Utilization** | Single core saturation | **Multi-core distribution** |
| **Error Handling** | Crashes can freeze tab | **Worker crashes don't affect UI** |

### Data Flow & Implementation

1.  **Main Thread (`ai.js`)**:
    - Dispatches an `ImageBitmap` to the worker via `postMessage`.
    - Uses **Transferable Objects** to send the image data with zero-copy overhead.
    - Listens for the `message` event to receive the resulting `embeddings`.

2.  **AI Worker (`ai.worker.js`)**:
    - Loads the ONNX Runtime (`ort.min.js`) in a headless environment.
    - Maintains the persistent `sam_encoder.onnx` session.
    - Performs normalization and inference.
    - Sends back the `Float32Array` of embeddings.

3.  **UI Feedback**:
    - The `AI Badge` in the sidebar will transition to a **"⚙️ Processing..."** state with a pulse animation while the worker is busy.
    - Users can continue to label other images or adjust settings while the background "cooker" finishes its task.

## Implementation Steps
1.  Create `js/core/ai.worker.js`.
2.  Update `js/core/ai.js` to initialize the worker and handle the communication proxy.
3.  Modify `main.js` state listeners to handle the new asynchronous background encoding state.

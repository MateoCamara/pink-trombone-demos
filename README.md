# Pink Trombone Demos with LEXI Landmark Integration

This repository is a fork of the fantastic work by **Zack Qattan**, providing interactive web-based demos of the Pink Trombone synthesizer. This version extends the original functionality by integrating the **LEXI** module for acoustic and landmark analysis.

## The LEXI Module Addition

The primary addition in this fork is the `lexi` directory and its corresponding web module. It is designed to work in tandem with the `tts` (Text-to-Speech) and `pink-trombone` modules to create a complete analysis pipeline: from text/phoneme input to articulatory synthesis and, finally, to acoustic and landmark visualization.

## How It Works

The three modules (`tts`, `pink-trombone`, and `lexi`) are designed to be opened simultaneously in separate browser tabs and work together. The workflow is as follows:

1.  **Input:** In the **TTS** page, you can type an English word or a sequence of phonemes directly.
2.  **Synthesis & Animation:** When you click "Play", the input is processed and sent to the **Pink Trombone** page. This page synthesizes the audio while displaying a real-time animation of the vocal tract movements.
3.  **Analysis & Visualization:** As soon as the synthesis finishes, the generated audio and its parameters are passed to the **LEXI** page. This page will automatically update to display:
    *   The audio **waveform**.
    *   The corresponding **spectrogram**.
    *   The algorithmically generated **acoustic landmarks** overlaid on the spectrogram.
4.  **Data Export:** The LEXI page allows you to download the complete output data, including the `.wav` audio file and a `.json` file containing the precise timing and type of each landmark.

## Getting Started

To run this demo, you need to use a local web server. This is essential because the different pages communicate with each other, which is typically blocked by browser security policies when opening files directly from your local filesystem. The `live-server` NPM package is a simple and effective way to do this.

**Step-by-step instructions:**

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/MateoCamara/pink-trombone-demos.git
    cd pink-trombone-demos
    ```

2.  **Install `live-server`:** If you don't have it, you can install it globally via npm (Node.js is required).
    ```bash
    npm install -g live-server
    ```

3.  **Start the server:** From inside the `pink-trombone-demos` directory, run the command:
    ```bash
    live-server
    ```
    This will start a local server and should automatically open a browser window.

4.  **Open the three modules:** Open the following pages in three separate browser tabs. Your port may vary from `8080`, but `live-server` will tell you which one it's using.
    *   **TTS Input:** `http://127.0.0.1:8080/tts/`
    *   **Pink Trombone Animator:** `http://127.0.0.1:8080/pink-trombone/`
    *   **LEXI Analysis:** `http://127.0.0.1:8080/lexi/`

Now you are ready to use the demo! Simply type into the TTS page and watch the other two pages react.

## Downloadable Outputs

For each synthesized word, the LEXI module provides two downloadable files:
-   **`audio.wav`**: A standard WAV file of the synthesized speech.
-   **`landmarks.json`**: A JSON file containing an array of landmark objects, each with its `type`, `time`, and associated `name`.

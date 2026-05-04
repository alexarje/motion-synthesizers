# Motion Synthesizers

Five browser-based synthesizer demos controlled through webcam motion — educational, interactive, and requiring no installation.

## Demos

| Demo | Synthesis Type | What you control |
|------|---------------|-----------------|
| [🌈 Additive](demos/additive.html) | **Additive** — sum of sine harmonics | X: harmonic profile · Y: pitch · motion: volume |
| [🌊 Subtractive](demos/subtractive.html) | **Subtractive** — filter a sawtooth wave | X: filter cutoff · Y: resonance · motion: volume |
| [📡 FM](demos/fm.html) | **FM** — frequency modulation | X: mod. index · Y: C:M ratio · motion: pitch/volume |
| [📻 AM](demos/am.html) | **AM** — amplitude modulation | X: mod. frequency · Y: depth · motion: carrier pitch |
| [🎸 Physical](demos/physical.html) | **Physical modelling** — Karplus-Strong string | X: brightness · Y: pitch · motion: pluck trigger |

## How to Run

Open `index.html` in any modern browser (Chrome, Firefox, Edge, Safari 15+).
No server is required — all files are static HTML/CSS/JS.

```bash
# Optional: serve locally to avoid CORS restrictions
npx serve .
# or
python3 -m http.server 8080
```

Then visit `http://localhost:8080`.

## How Motion Control Works

Each demo:

1. Requests webcam access (camera only — no audio recording).
2. Computes the **frame difference** between consecutive video frames.
3. Extracts three values from the motion field:
   - **X** – horizontal centroid of movement (mirrored, so right hand = right side)
   - **Y** – vertical centroid of movement
   - **Magnitude** – overall motion energy
4. Maps these values to synthesis parameters in real time.

If camera access is denied, a **mouse/touch fallback** is activated automatically.

## Technical Stack

- **Web Audio API** — all synthesis and audio processing
- **MediaDevices API** — webcam access
- **Canvas 2D API** — motion overlay and audio visualisation
- Pure vanilla HTML / CSS / JavaScript — zero dependencies, zero build step

## Synthesis Techniques

### Additive Synthesis
Any periodic sound can be decomposed into (and reconstructed from) a sum of sine waves
(*Fourier's theorem*). This demo builds a tone from up to 16 harmonics. The harmonic
amplitude envelope selects timbres from a pure sine through triangle, square, sawtooth,
and bell-like profiles.

### Subtractive Synthesis
A harmonically-rich sawtooth oscillator is fed through a resonant low-pass filter.
Moving left/right sweeps the cutoff frequency; moving up/down adjusts the resonance (Q),
creating the classic synthesiser sweep sound.

### FM Synthesis
One oscillator (the modulator) varies the frequency of another (the carrier). Even small
changes to the *modulation index* β dramatically reshape the spectrum, adding sidebands
at fc ± n·fm. This demo shows the sidebands on a live spectrum display.

### AM Synthesis
The amplitude of a carrier is varied by a second oscillator. At sub-audio rates this
produces tremolo; at audio rates sidebands appear at fc ± fm — ring modulation.
The transition between these regimes is audible and visible in the spectrum.

### Physical Modelling — Karplus-Strong
A short burst of filtered noise is injected into a recirculating delay line. The delay
time sets the pitch; each pass through a low-pass filter damps high frequencies, mimicking
the natural decay of a plucked string. Motion energy above a threshold triggers new plucks.

## Browser Requirements

- A browser supporting Web Audio API and `navigator.mediaDevices.getUserMedia`
- HTTPS or localhost (required by browsers for camera access)
- No microphone required — camera is read-only for video frames

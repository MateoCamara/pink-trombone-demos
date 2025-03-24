const canvas = document.getElementById('waveform');
const spectrogramCanvas = document.getElementById('spectrogram');
const ctx = canvas.getContext('2d');
const spectrogramCtx = spectrogramCanvas.getContext('2d');
let audioContext;

const { onMessage } = setupConnection("lexi", handleMessage);

async function handleMessage(message) {
    if (message.type === "waveform") {
        renderWaveform(message.data);
    }
}

async function renderWaveform(arrayBuffer) {
    audioContext = audioContext || new AudioContext();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    canvas.width = canvas.offsetWidth;  // Asegurar mismo anchi que el contenedor
    spectrogramCanvas.width = canvas.width; // Mismo ancho que el waveform

    drawTimeDomain(audioBuffer);
    drawSpectrogram(audioBuffer);
}

function drawTimeDomain(audioBuffer) {
    const data = audioBuffer.getChannelData(0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath();

    const step = Math.ceil(data.length / canvas.width);
    let peak = 0.5;

    for (let x = 0; x < canvas.width; x++) {
        const start = Math.floor(x * step);
        const end = Math.floor((x + 1) * step);
        let max = 0;

        for (let i = start; i < end; i++) {
            if (data[i] > max) max = data[i];
        }

        const y = (1 - max) * canvas.height / 2;

        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);

        peak = Math.max(peak, max);
    }

    ctx.strokeStyle = '#FF6B6B';
    ctx.lineWidth = 1.5;
    ctx.stroke();
}


// Implementación FFT Cooley-Tukey (Radix-2)
class FFT {
    constructor(size) {
        this.size = size;
        this.cosTable = new Float32Array(size);
        this.sinTable = new Float32Array(size);
        for (let i = 0; i < size; i++) {
            this.cosTable[i] = Math.cos(-2 * Math.PI * i / size);
            this.sinTable[i] = Math.sin(-2 * Math.PI * i / size);
        }
    }

    transform(real, imag) {
        const n = this.size;
        let bits = Math.log2(n);

        // Bit-reversal permutation
        for (let i = 0; i < n; i++) {
            let j = this.reverseBits(i, bits);
            if (j > i) {
                [real[i], real[j]] = [real[j], real[i]];
                [imag[i], imag[j]] = [imag[j], imag[i]];
            }
        }

        // Radix-2 Cooley-Tukey
        for (let size = 2; size <= n; size *= 2) {
            let half = size / 2;
            let tableStep = n / size;
            for (let i = 0; i < n; i += size) {
                for (let j = i, k = 0; j < i + half; j++, k += tableStep) {
                    let l = j + half;
                    let tpre = real[l] * this.cosTable[k] - imag[l] * this.sinTable[k];
                    let tpim = real[l] * this.sinTable[k] + imag[l] * this.cosTable[k];
                    real[l] = real[j] - tpre;
                    imag[l] = imag[j] - tpim;
                    real[j] += tpre;
                    imag[j] += tpim;
                }
            }
        }
    }

    reverseBits(num, bits) {
        let reversed = 0;
        for (let i = 0; i < bits; i++) {
            reversed = (reversed << 1) | (num & 1);
            num >>= 1;
        }
        return reversed;
    }
}

function drawSpectrogram(audioBuffer) {
    const data = audioBuffer.getChannelData(0);
    const sampleRate = audioContext.sampleRate;
    const fftSize = 512;

    // 1. Asegurar que el número de frames = ancho del canvas
    const desiredWidth = spectrogramCanvas.width;
    const maxHopSize = Math.floor((data.length - fftSize) / (desiredWidth - 1));
    const hopSize = Math.max(1, maxHopSize); // hopSize mínimo = 1
    const totalFrames = Math.ceil((data.length - fftSize) / hopSize) + 1;

    const window = new Float32Array(fftSize);
    const imageHeight = fftSize / 2;

    // 2. Configurar canvas (mismo ancho que la forma de onda)
    spectrogramCanvas.width = desiredWidth;
    spectrogramCanvas.height = imageHeight;
    spectrogramCtx.clearRect(0, 0, spectrogramCanvas.width, spectrogramCanvas.height);

    // Ventana de Hann (igual que antes)
    for (let i = 0; i < fftSize; i++) {
        window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (fftSize - 1)));
    }

    const fft = new FFT(fftSize);
    const imageData = spectrogramCtx.createImageData(desiredWidth, imageHeight);

    // 3. Procesar frames adaptativos
    for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
        const start = frameIndex * hopSize;
        const end = start + fftSize;
        if (end > data.length) break;

        const frame = data.slice(start, end);
        const windowedFrame = frame.map((s, i) => s * window[i]);

        // Calcular FFT
        const real = [...windowedFrame], imag = new Array(fftSize).fill(0);
        fft.transform(real, imag);

        // Mapear a columnas del canvas
        const xPos = Math.floor((frameIndex / totalFrames) * desiredWidth);

        for (let bin = 0; bin < imageHeight; bin++) {
            const magnitude = Math.sqrt(real[bin] ** 2 + imag[bin] ** 2);
            const dB = 20 * Math.log10(magnitude + 1e-6);
            const normalized = (Math.min(Math.max(dB, -100), 0) + 100) / 100;
            const color = getColor(normalized);

            // Invertir eje Y (bajas frecuencias abajo)
            const yPos = imageHeight - 1 - bin;
            const idx = (yPos * desiredWidth + xPos) * 4;

            if (idx + 3 < imageData.data.length) {
                imageData.data.set(color, idx);
            }
        }
    }

    spectrogramCtx.putImageData(imageData, 0, 0);
}

// Función de color simplificada
function getColor(normalizedValue) {
    const hue = (1 - normalizedValue) * 240;
    return HSLtoRGB(hue, 100, 50);
}

function HSLtoRGB(h, s, l) {
    h /= 360;
    s /= 100;
    l /= 100;
    let r, g, b;

    if (s === 0) {
        r = g = b = l;
    } else {
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1/6) return p + (q - p) * 6 * t;
            if (t < 1/2) return q;
            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        };

        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
    }

    return [
        Math.round(r * 255),
        Math.round(g * 255),
        Math.round(b * 255),
        255
    ];
}
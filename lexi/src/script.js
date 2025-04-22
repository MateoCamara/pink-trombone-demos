const canvas = document.getElementById('waveform');
const spectrogramCanvas = document.getElementById('spectrogram');
const ctx = canvas.getContext('2d');
const spectrogramCtx = spectrogramCanvas.getContext('2d');
let audioContext;
let phonemeData = null; // Variable para almacenar los fonemas
let currentAudioBlob = null;
let audioBuffer = null; // Guardamos el buffer de audio decodificado

const { onMessage } = setupConnection("lexi", handleMessage);

const LANDMARK_MAP = {
    'V': ['i', 'ɛ', 'ɪ', 'æ', 'ʊ', 'u', 'ɔ', 'ɑ', 'ʌ', 'ɚ', 'o'],
    'G': ['w', 'y', 'l', 'ɹ', 'h'],
    'N': ['m', 'n', 'ŋ'],
    'F': ['v', 'ð', 'z', 'ʒ', 'f', 'θ', 's', 'ʃ'],
    'S': ['b', 'd', 'g', 'p', 't', 'k'],
    'A': ['ʧ', 'ʤ']
};

async function handleMessage(message) {
    console.log(message)
    if (message.type === "waveform") {
        // Guardar el ArrayBuffer original del mensaje
        const originalArrayBuffer = message.data.slice(0);
        currentAudioBlob = originalArrayBuffer;
        
        // Procesar para visualización
        renderWaveform(message.data);
    } else if (message.type === "message") {
        phonemeData = message.utterance;
    }
}

async function renderWaveform(arrayBuffer) {
    audioContext = audioContext || new AudioContext();
    audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));

    canvas.width = canvas.offsetWidth;  // Asegurar mismo anchi que el contenedor
    spectrogramCanvas.width = canvas.width; // Mismo ancho que el waveform

    drawTimeDomain(audioBuffer);
    drawSpectrogram(audioBuffer);

    if (phonemeData) {
        drawPhonemes(phonemeData, audioBuffer.duration, canvas.width);
        drawLandmarks(phonemeData, audioBuffer.duration, canvas.width);
    }
}

function drawTimeDomain(audioBuffer) {
    const data = audioBuffer.getChannelData(0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath();

    // 1. Encontrar el pico máximo absoluto en todo el audio
    let globalPeak = 0;
    for (let i = 0; i < data.length; i++) {
        globalPeak = Math.max(globalPeak, Math.abs(data[i]));
    }
    if (globalPeak === 0) globalPeak = 1; // Evitar división por cero

    // 2. Ajustar parámetros de escalado
    const segmentWidth = data.length / canvas.width;
    const verticalScale = (canvas.height * 0.95) / (2 * globalPeak); // 5% de margen

    for (let x = 0; x < canvas.width; x++) {
        const start = Math.floor(x * segmentWidth);
        const end = Math.floor((x + 1) * segmentWidth);
        let max = -Infinity;
        let min = Infinity;

        for (let i = start; i < end && i < data.length; i++) {
            const val = data[i];
            max = Math.max(max, val);
            min = Math.min(min, val);
        }

        // 3. Escalado vertical completo
        const yCenter = canvas.height / 2;
        const yMax = yCenter - (max * verticalScale);
        const yMin = yCenter - (min * verticalScale);

        ctx.moveTo(x, yMax);
        ctx.lineTo(x, yMin);
    }

    ctx.strokeStyle = '#FF6B6B';
    ctx.lineWidth = 1.5;
    ctx.stroke();
}

function drawPhonemes(phonemeData, audioDuration, canvasWidth) {
    const container = document.getElementById('phonemes');
    container.innerHTML = '';

    if (!phonemeData?.keyframes) return;

    // Ordenar por tiempo por si acaso
    const sortedKeyframes = [...phonemeData.keyframes].sort((a, b) => a.time - b.time);

    // Agrupar fonemas cercanos para evitar solapamiento
    let lastPosition = -Infinity;

    sortedKeyframes.forEach(keyframe => {
        const time = keyframe.time;
        const position = Math.round((time / audioDuration) * canvasWidth);

        const label = document.createElement('div');
        label.className = 'phoneme-label';

        // Clasificar fonemas principales
        const isMain = !keyframe.isSubPhoneme && !/[\]}]/.test(keyframe.name);
        if (isMain) label.classList.add('main');

        // Limpiar nombre
        const cleanName = keyframe.name
            .replace(/[\[\]{}()0-9]/g, '') // Elimina todos los símbolos y números
            .trim();

        // Posicionamiento inteligente
        label.style.left = `${position}px`;
        label.textContent = cleanName;

        // Evitar solapamiento (alternar posición vertical)
        if (Math.abs(position - lastPosition) < 50) { // 50px mínimo entre etiquetas
            label.style.top = '-20px';
            label.style.bottom = 'auto';
        }

        // Truncar textos largos
        if (cleanName.length > 4) {
            label.textContent = cleanName.substring(0, 4) + '…';
            label.title = cleanName;
        }

        container.appendChild(label);
        lastPosition = position;
    });
}

function cleanPhoneme(phoneme) {
    return phoneme.toLowerCase().replace(/[^a-zɪæʊuɔɑʌɚɹŋðʒθɛʃʧʤ]/g, '');
}

function parsePhonemeName(name) {
    let leadingBrace = name.startsWith('{');
    let remaining = leadingBrace ? name.slice(1) : name;

    let subphoneme = null;
    const subMatch = remaining.match(/\((\d+)\)/);
    if (subMatch) {
        subphoneme = parseInt(subMatch[1], 10);
        remaining = remaining.replace(/\(\d+\)/, '');
    }

    const baseMatch = remaining.match(/^[a-zɛɪæʊuɔɑʌɚɹŋðʒθʃʧʤ]+/i);
    let base = baseMatch ? baseMatch[0].toLowerCase() : '';
    remaining = remaining.slice(base.length);

    const trailingEnd = remaining.includes('}');
    const trailingClosure = remaining.includes(']');

    return { base, subphoneme, leadingBrace, trailingEnd, trailingClosure };
}

function getLandmarkType(basePhoneme) {
    const cleaned = cleanPhoneme(basePhoneme);
    const exactMatch = Object.entries(LANDMARK_MAP).find(([_, phs]) =>
        phs.includes(cleaned)
    );
    if (exactMatch) return exactMatch[0];
    return null;
}

function drawLandmarks(phonemeData, audioDuration, canvasWidth) {
    const container = document.getElementById('landmarks');
    container.innerHTML = '';

    const groups = [];
    let currentGroup = null;

    phonemeData.keyframes.forEach(kf => {
        if (kf.name === '.') return;

        const parsed = parsePhonemeName(kf.name);
        const baseType = getLandmarkType(parsed.base);
        if (!baseType) return;

        let groupKey;
        if (['S', 'F', 'N'].includes(baseType)) {
            groupKey = `${baseType}-${parsed.base}`;
        } else if (baseType === 'G') {
            groupKey = `G-${parsed.base}`;
        } else {
            groupKey = `single-${kf.time}`;
        }

        if (!currentGroup || currentGroup.key !== groupKey) {
            currentGroup = {
                key: groupKey,
                type: baseType,
                elements: [],
                parsed: []
            };
            groups.push(currentGroup);
        }

        currentGroup.elements.push(kf);
        currentGroup.parsed.push(parsed);
        if (parsed.leadingBrace) currentGroup.hasLeadingBrace = true;
    });

    groups.forEach(group => {
        const type = group.type;
        const elements = group.elements;
        const parsed = group.parsed;

        if (type === 'V') {
            elements.forEach(kf => createLandmark(kf.time, 'V', kf.name));
        } else if (type === 'G') {
            const start = elements[0].time;
            const end = elements[elements.length - 1].time;
            const mid = (start + end) / 2;
            createLandmark(mid, 'G', elements[0].name);
        } else if (['S', 'F', 'N'].includes(type)) {
            // Encontrar closure
            // let closureIdx = parsed.findIndex(p => p.leadingBrace);
            // if (closureIdx === -1) closureIdx = 0;
            const closureIdx = 0;
            const closureTime = elements[closureIdx].time;
            createLandmark(closureTime, `${type}c`, elements[closureIdx].name);

            if (type === 'S') {
                // Buscar el primer subphonema 1
                const splitIndex = parsed.findIndex(p => p.subphoneme === 1);

                if (splitIndex > 0) {
                    // Calcular punto medio entre último 0 y primer 1
                    const last0 = elements[splitIndex - 1].time;
                    const first1 = elements[splitIndex].time;
                    const releaseTime = (last0 + first1) / 2;

                    createLandmark(releaseTime, `${type}r`, 'transition');
                } else {
                    // Fallback: usar último elemento con } o final
                    const releaseElement = elements.findLast(e =>
                        parsePhonemeName(e.name).trailingEnd
                    ) || elements[elements.length - 1];

                    createLandmark(releaseElement.time, `${type}r`, releaseElement.name);
                }
            } else {
                // Lógica original para F y N
                const releaseElement = elements.findLast(e =>
                    parsePhonemeName(e.name).trailingEnd
                ) || elements[elements.length - 1];

                createLandmark(releaseElement.time, `${type}r`, releaseElement.name);
            }
        }
    });

    function createLandmark(time, type, name) {
        const position = (time / audioDuration) * canvasWidth;
        const landmark = document.createElement('div');
        landmark.className = `landmark ${type}`;
        landmark.style.left = `${position}px`;
        landmark.title = name;

        const bar = document.createElement('div');
        bar.className = 'landmark-bar';
        landmark.appendChild(bar);

        const label = document.createElement('div');
        label.className = 'landmark-label';
        label.textContent = type;
        landmark.appendChild(label);

        container.appendChild(landmark);
    }
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

function downloadAudio() {
    if (!currentAudioBlob) {
        alert('No hay audio para descargar');
        return;
    }

    // Usar el ArrayBuffer original guardado
    const blob = new Blob([currentAudioBlob], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = `audio_${new Date().toISOString().slice(0, 19)}.wav`;
    document.body.appendChild(a);
    a.click();

    // Limpieza
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 100);
}
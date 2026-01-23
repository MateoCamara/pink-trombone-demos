// FFT implementation using Cooley-Tukey Radix-2 algorithm

/**
 * Fast Fourier Transform implementation
 * Uses pre-computed trig tables for efficiency
 */
export class FFT {
    /**
     * Create FFT instance
     * @param {number} size - FFT size (must be power of 2)
     */
    constructor(size) {
        this.size = size;
        this.cosTable = new Float32Array(size);
        this.sinTable = new Float32Array(size);

        // Pre-compute trig tables
        for (let i = 0; i < size; i++) {
            this.cosTable[i] = Math.cos(-2 * Math.PI * i / size);
            this.sinTable[i] = Math.sin(-2 * Math.PI * i / size);
        }
    }

    /**
     * Perform in-place FFT transform
     * @param {number[]} real - Real part array (modified in place)
     * @param {number[]} imag - Imaginary part array (modified in place)
     */
    transform(real, imag) {
        const n = this.size;
        const bits = Math.log2(n);

        // Bit-reversal permutation
        for (let i = 0; i < n; i++) {
            const j = this.reverseBits(i, bits);
            if (j > i) {
                [real[i], real[j]] = [real[j], real[i]];
                [imag[i], imag[j]] = [imag[j], imag[i]];
            }
        }

        // Radix-2 Cooley-Tukey butterfly
        for (let size = 2; size <= n; size *= 2) {
            const half = size / 2;
            const tableStep = n / size;
            for (let i = 0; i < n; i += size) {
                for (let j = i, k = 0; j < i + half; j++, k += tableStep) {
                    const l = j + half;
                    const tpre = real[l] * this.cosTable[k] - imag[l] * this.sinTable[k];
                    const tpim = real[l] * this.sinTable[k] + imag[l] * this.cosTable[k];
                    real[l] = real[j] - tpre;
                    imag[l] = imag[j] - tpim;
                    real[j] += tpre;
                    imag[j] += tpim;
                }
            }
        }
    }

    /**
     * Reverse bits of a number
     * @param {number} num - Number to reverse
     * @param {number} bits - Number of bits
     * @returns {number} Reversed number
     */
    reverseBits(num, bits) {
        let reversed = 0;
        for (let i = 0; i < bits; i++) {
            reversed = (reversed << 1) | (num & 1);
            num >>= 1;
        }
        return reversed;
    }
}

/**
 * Create a Hann window for FFT
 * @param {number} size - Window size
 * @returns {Float32Array} Hann window coefficients
 */
export function createHannWindow(size) {
    const window = new Float32Array(size);
    for (let i = 0; i < size; i++) {
        window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
    }
    return window;
}

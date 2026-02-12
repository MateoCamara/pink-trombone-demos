if (location.href.startsWith("http://")) {
  //location = location.href.replace("http://", "https://");
}

const searchParams = new URLSearchParams(location.search);
const useEssentia = searchParams.get("essentia") !== null;
/** @type {GainNode} */
let gainNode;
/** @type {HTMLAudioElement} */
let audio;

function setupWebsocketConnection(webpageName, onMessage, onConnect) {
  // Create WebSocket connection.
  let socket;

  const createSocket = () => {
    socket = new WebSocket("ws://localhost/");

    socket.addEventListener("open", () => {
      console.log("connection opened");
      send({
        type: "connection",
        webpage: webpageName,
      });
      if (onConnect) {
        onConnect(send);
      }
    });
    socket.addEventListener("message", (event) => {
      //console.log("Message from server ", event.data);
      const message = JSON.parse(event.data);
      onMessage(message);
    });
    socket.addEventListener("close", (event) => {
      console.log("connection closed");
      createSocket();
    });
  };
  createSocket();

  const send = (object) => {
    object.from = webpageName;
    socket.send(JSON.stringify(object));
  };

  return send;
}
function setupBroadcastChannel(webpageName, onMessage, onConnect) {
  let broadcastChannel, send;
  const createBroadcastChannel = () => {
    broadcastChannel = new BroadcastChannel("pink-trombone");
    broadcastChannel.addEventListener("message", (event) => {
      //console.log("Message from peer ", event.data);
      const message = event.data;
      if (message.to && message.to.includes(webpageName)) {
        onMessage(message);
      }
    });
    send = (object) => {
      object.from = webpageName;
      broadcastChannel.postMessage(object);
    };
    if (onConnect) {
      onConnect(send);
    }
  };
  createBroadcastChannel();

  return send;
}
const useWebSockets = false;
/**
 * Resumes the audiocontext when it's suspended after a user clicks
 * @param {string} webpageName the name of the webpage this is called from to identify itself
 * @param {function} onMessage is called when the webpage receives websocket messages from the server
 * @returns {object} a send function to send websocket messages to the server
 */
function setupConnection(webpageName, onMessage, onConnect) {
  let send;

  if (useWebSockets) {
    send = setupWebsocketConnection(...arguments);
  } else {
    send = setupBroadcastChannel(...arguments);
  }

  return { send };
}

/**
 * Resumes the audiocontext when it's suspended after a user clicks
 * @param {AudioContext} audioContext
 */
function autoResumeAudioContext(audioContext) {
  window.audioContext = audioContext;
  const resumeAudioContext = () => {
    console.log(`new audio context state "${audioContext.state}"`);
    if (audioContext.state != "running" && audioContext.state != "closed") {
      document.body.addEventListener("click", () => audioContext?.resume(), {
        once: true,
      });
    }
  };
  audioContext.addEventListener("statechange", (e) => {
    resumeAudioContext();
  });
  audioContext.dispatchEvent(new Event("statechange"));
  //resumeAudioContext();
}

/**
 * Returns throttle function that gets called at most once every interval.
 *
 * @param {function} functionToThrottle
 * @param {number} minimumInterval - Minimal interval between calls (milliseconds).
 * @param {object} optionalContext - If given, bind function to throttle to this context.
 * @returns {function} Throttled function.
 */
function throttle(functionToThrottle, minimumInterval, optionalContext) {
  var lastTime;
  if (optionalContext) {
    functionToThrottle = module.exports.bind(functionToThrottle, optionalContext);
  }
  return function () {
    var time = Date.now();
    var sinceLastTime = typeof lastTime === "undefined" ? minimumInterval : time - lastTime;
    if (typeof lastTime === "undefined" || sinceLastTime >= minimumInterval) {
      lastTime = time;
      functionToThrottle.apply(null, arguments);
    }
  };
}

// https://www.dyslexia-reading-well.com/44-phonemes-in-english.html
const phonemes = {
  // CONSONANTS
  b: {
    voiced: true,
    graphemes: ["b", "bb"],
    example: "bug",
    constrictions: [
      {
        front: {
          index: 41.10761642456055,
          diameter: 0.088,
        },
        // b(0), b(0)] use defaults (no p(0) in p.json)
      },
      {
        front: {
          index: 41.10761642456055,
          diameter: 0.9,
        },
        duration: 0.01,  // p(1) lasts 10ms (from p.json p(1) duration_ms)
        holdTime: 0.041, // p(1)] lasts 41ms (from p.json p(1)] duration_ms)
      },
    ],
  },
  d: {
    voiced: true,
    graphemes: ["d", "dd", "ed"],
    example: "dad",
    constrictions: [
      {
        front: {
          index: 35.8536376953125,
          diameter: 0.088,
        },
        duration: 0.05,  // t(0) lasts 50ms (from t.json t(0) duration_ms)
        holdTime: 0.01,  // t(0)] lasts 10ms (from t.json t(0)] duration_ms)
      },
      {
        front: {
          index: 35.8536376953125,
          diameter: 0.7306244969367981,
        },
        duration: 0.01,  // t(1) lasts 10ms (from t.json t(1) duration_ms)
        holdTime: 0.1,   // t(1)] lasts 100ms (from t.json t(1)] duration_ms)
      },
    ],
  },
  f: {
    voiced: false,
    graphemes: ["f", "ff", "ph", "gh", "lf", "ft"],
    example: "fat",
    tenseness: 0.049,
    loudness: 0.23,
    holdTime: 0.001, // from f.json f] duration_ms: 1
    constrictions: {
      front: {
        index: 39.57,
        diameter: 0.509,
      },
      duration: 0.026, // from f.json f duration_ms: 26
    },
  },
  g: {
    voiced: true,
    graphemes: ["g", "gg", "gh", "gu", "gue"],
    example: "gun",
    constrictions: [
      {
        back: {
          index: 22.009140014648438,
          diameter: 0.17730380594730377,
        },
        tongue: {
          index: 14.824607849121094,
          diameter: 2.7940967082977295,
        },
      },
      {
        back: {
          index: 22.009140014648438,
          diameter: 0.7,
        },
        tongue: {
          index: 14.824607849121094,
          diameter: 2.7940967082977295,
        },
      },
    ],
  },
  h: {
    voiced: false,
    graphemes: ["h", "wh"],
    example: "hop",
    constrictions: {
      /*
      back: {
        index: 10.536121368408203,
        diameter: 0.4411369264125824,
      },
      tongue: {
        index: 12.820167541503906,
        diameter: 2.3550286293029785,
      },
      */
    },
  },
  dʒ: {
    voiced: true,
    graphemes: ["j", "ge", "g", "dge", "di", "gg"],
    example: "jam",
    preserveTongue: true,
    constrictions: {
      front: {
        index: 31.48894500732422,
        diameter: 0.5175557136535645,
      },
      tongue: {
        index: 42.200,
        diameter: 2.8312392234802246,
      },
    },
  },
  k: {
    voiced: false,
    graphemes: ["k", "c", "ch", "cc", "lk", "qu", "q(u)", "ck", "x"],
    example: "kit",
    alternative: "g",
    constrictions: [
      {
        back: { index: 22.009140014648438, diameter: 0.17730380594730377 },
        tongue: { index: 14.824607849121094, diameter: 2.7940967082977295 },
        duration: 0.005,
        holdTime: 0.01,
      },
      {
        back: { index: 22.009140014648438, diameter: 0.7 },
        tongue: { index: 14.824607849121094, diameter: 2.7940967082977295 },
        duration: 0.005,
        holdTime: 0.01,
      },
    ],
  },
  l: {
    voiced: true,
    graphemes: ["l", "ll"],
    example: "live",
    constrictions: {
      tongue: {
        index: 12.359664916992188,
        diameter: 2.251485586166382,
      },
      front: {
        index: 37.93798828125,
        diameter: 0.6,
      },
    },
  },
  m: {
    voiced: true,
    graphemes: ["m", "mm", "mb", "mn", "lm"],
    example: "man",
    tenseness: 0.691,
    loudness: 0.912,
    holdTime: 0.015, // from m.json m] duration_ms: 15
    constrictions: {
      front: {
        index: 41.09,
        diameter: -1.142,
      },
      tongue: {
        index: 12.21,
        diameter: 2.879,
      },
    },
  },
  n: {
    voiced: true,
    graphemes: ["n", "nn", "kn", "gn", "pn", "mn"],
    example: "net",
    tenseness: 0.691,
    loudness: 0.912,
    holdTime: 0.106, // from n.json n] duration_ms: 106
    constrictions: {
      front: {
        index: 35.88,
        diameter: -1.215,
      },
      tongue: {
        index: 3.0,
        diameter: 1.8,
      },
      duration: 0.053, // from n.json n duration_ms: 53
    },
  },
  p: {
    voiced: false,
    graphemes: ["p", "pp"],
    example: "pin",
    alternative: "b",
  },
  r: {
    //voiced: true,
    graphemes: ["r", "rr", "wr", "rh"],
    example: "run",
    tenseness: 0.691,
    loudness: 0.912,
    constrictions: {
      front: {
        index: 28.31,
        diameter: 0.847,
      },
      tongue: {
        index: 16.8,
        diameter: 1.6,
      },
    },
  },
  s: {
    voiced: false,
    graphemes: ["s", "ss", "c", "sc", "ps", "st", "ce", "se"],
    example: "sit",
    tenseness: 0.049,
    loudness: 0.04,
    holdTime: 0.001, // from s.json s] duration_ms: 1
    constrictions: {
      front: {
        index: 35.67,
        diameter: 0.58,
      },
      tongue: {
        index: 26.1,
        diameter: 3.578,
      },
      duration: 0.01, // from s.json s duration_ms: 10
    },
  },
  t: {
    voiced: false,
    graphemes: ["t", "tt", "th", "ed"],
    example: "tip",
    alternative: "d",
  },
  v: {
    voiced: true,
    graphemes: ["v", "f", "ph", "ve"],
    example: "vine",
    alternative: "f",
    holdTime: 0.075, // from v.json v] duration_ms: 75
  },
  w: {
    voiced: true,
    graphemes: ["w", "wh", "u", "o"],
    example: "wit",
    constrictions: {
      front: {
        index: 41.214935302734375,
        diameter: 0.8578535318374634,
      },
      tongue: {
        index: 12.515311241149902,
        diameter: 1.740299105644226,
      },
    },
  },
  z: {
    voiced: true,
    graphemes: ["z", "zz", "s", "ss", "x", "ze", "se"],
    example: "buzz",
    tenseness: 0.5,
    loudness: 0.66,
    holdTime: 0.001, // from z.json z] duration_ms: 1
    constrictions: {
      front: {
        index: 35.67,
        diameter: 0.4,
      },
      tongue: {
        index: 37.8,
        diameter: 3.578,
      },
      duration: 0.016, // from z.json z duration_ms: 16
    },
  },
  ʒ: {
    voiced: true,
    graphemes: ["s", "si", "z"],
    example: "treasure",
    constrictions: {
      tongue: {
        index: 38.1162223815918,
        diameter: 4.172404766082764,
      },
      front: {
        index: 31.5826358795166,
        diameter: 0.5940179824829102,
      },
    },
  },
  tʃ: {
    voiced: false,
    graphemes: ["ch", "tch", "tu", "te"],
    example: "chip",
    tenseness: 0.02,
    loudness: 0.02,
    holdTime: 0.01, // from ʧ.json ʧ] duration_ms: 10
    constrictions: {
      tongue: {
        index: 21.06,
        diameter: 2.722,
      },
      front: {
        index: 31.48,
        diameter: 0.4,
      },
      duration: 0.01, // from ʧ.json ʧ duration_ms: 10
    },
  },
  ʃ: {
    voiced: false,
    graphemes: ["sh", "ce", "s", "ci", "si", "ch", "sci", "ti"],
    example: "sham",
    alternative: "ʒ",
  },
  θ: {
    voiced: false,
    graphemes: ["th"],
    example: "thong",
    constrictions: {
      tongue: {
        index: 27.66069793701172,
        diameter: 2.6893649101257324,
      },
      front: {
        index: 38.21797561645508,
        diameter: 0.49921420216560364,
      },
    },
  },
  ð: {
    voiced: true,
    graphemes: ["th"],
    example: "leather",
    alternative: "θ",
  },
  ŋ: {
    voiced: true,
    graphemes: ["ng", "n", "ngue"],
    example: "ring",
    tenseness: 0.691,
    loudness: 0.912,
    nasalStop: true,
    holdTime: 0.01,
    offsetBetweenSubPhonemes: 0.01,
    constrictions: [
      {
        // Phase 0: nasal-oral overlap — nose opens velum, back stays OPEN
        tongue: {
          index: 22.66060447692871,
          diameter: 1.5032392740249634,
        },
        back: {
          index: 22.110883712768555,
          diameter: 1.5,
        },
        nose: {
          index: 22.110883712768555,
          diameter: -5,
        },
        duration: 0.15,
      },
      {
        // Phase 1: velar closure (back closes, nose keeps velum open)
        tongue: {
          index: 22.66060447692871,
          diameter: 1.5032392740249634,
        },
        back: {
          index: 22.110883712768555,
          diameter: -1.3278001546859741,
        },
        nose: {
          index: 22.110883712768555,
          diameter: -5,
        },
      },
      {
        // Phase 2: guttural stop release
        tongue: {
          index: 22.66060447692871,
          diameter: 1.5032392740249634,
        },
        back: {
          index: 22.110883712768555,
          diameter: 0.6745198965072632,
        },
      },
    ],
  },
  j: {
    //voiced: true,
    graphemes: ["y", "i", "j"],
    example: "you",
    constrictions: {
      tongue: {
        index: 29.349863052368164,
        diameter: 2.376814365386963,
      },
    },
  },

  // VOWELS
  æ: {
    graphemes: ["a", "ai", "au"],
    example: "cat",
    constrictions: {
      tongue: {
        index: 14.0070161819458,
        diameter: 2.887047290802002,
      },
    },
  },
  eɪ: {
    graphemes: ["a", "ai", "eigh", "aigh", "ay", "er", "et", "ei", "au", "a_e", "ea", "ey"],
    example: "bay",
    constrictions: [
      {
        tongue: {
          index: 26.89008140563965,
          diameter: 3.052640914916992,
        },
      },
      {
        tongue: {
          index: 31.231204986572266,
          diameter: 2.109241247177124,
        },
      },
    ],
  },
  ɛ: {
    graphemes: ["e", "ea", "u", "ie", "ai", "a", "eo", "ei", "ae"],
    example: "end",
    constrictions: {
      tongue: {
        index: 23.29936981201172,
        diameter: 3.968519687652588,
      },
    },
  },
  i: {
    graphemes: ["e", "ee", "ea", "y", "ey", "oe", "ie", "i", "ei", "eo", "ay"],
    example: "be",
    constrictions: {
      tongue: {
        index: 33.49000549316406,
        diameter: 2.0898075103759766,
      },
    },
  },
  ɪ: {
    graphemes: ["i", "e", "o", "u", "ui", "y", "ie"],
    example: "it",
    constrictions: {
      tongue: {
        index: 27.176782608032227,
        diameter: 2.5782177448272705,
      },
    },
  },
  aɪ: {
    graphemes: ["i", "y", "igh", "ie", "uy", "ye", "ai", "is", "eigh", "i_e"],
    example: "sky",
    constrictions: [
      {
        tongue: {
          index: 11.638107299804688,
          diameter: 2.3857390880584717,
        },
      },
      {
        tongue: {
          index: 27.904165267944336,
          diameter: 1.9339886903762817,
        },
      },
    ],
  },
  ɒ: {
    graphemes: ["a", "ho", "au", "aw", "ough"],
    example: "swan",
    constrictions: {
      tongue: {
        index: 1.551837682723999,
        diameter: 1.551837682723999,
      },
    },
  },
  oʊ: {
    graphemes: ["o", "oa", "o_e", "oe", "ow", "ough", "eau", "oo", "ew"],
    example: "open",
    constrictions: [
      {
        tongue: {
          index: 10.080545425415039,
          diameter: 2.3536839485168457,
        },
        front: {
          index: 39.3746337890625,
          diameter: 2.0207254886627197,
        },
      },
      {
        tongue: {
          index: 10.080545425415039,
          diameter: 2.3536839485168457,
        },
        front: {
          index: 39.3746337890625,
          diameter: 0.8177579045295715,
        },
      },
    ],
  },
  ʊ: {
    graphemes: ["o", "oo", "u", "ou"],
    example: "look",
    constrictions: {
      tongue: {
        index: 19.63079833984375,
        diameter: 2.4873642921447754,
      },
      front: {
        index: 40.496360778808594,
        diameter: 1.107533574104309,
      },
    },
  },
  ʌ: {
    graphemes: ["u", "o", "oo", "ou"],
    example: "lug",
    constrictions: {
      tongue: {
        index: 17.742313385009766,
        diameter: 2.5167031288146973,
      },
    },
  },
  u: {
    graphemes: ["o", "oo", "ew", "ue", "u_e", "oe", "ough", "ui", "oew", "ou"],
    example: "who",
    constrictions: {
      tongue: {
        index: 20.89373207092285,
        diameter: 2.8037023544311523,
      },
      front: {
        index: 39.59186553955078,
        diameter: 0.7746905088424683,
      },
    },
  },
  ɔɪ: {
    graphemes: ["oi", "oy", "uoy"],
    example: "boy",
    constrictions: [
      {
        tongue: {
          index: 15.181169509887695,
          diameter: 2.1677639484405518,
        },
      },
      {
        tongue: {
          index: 34.00770568847656,
          diameter: 1.9233624935150146,
        },
      },
    ],
  },
  aʊ: {
    graphemes: ["ow", "ou", "ough"],
    example: "now",
    constrictions: [
      {
        tongue: {
          index: 13.432427406311035,
          diameter: 2.858365058898926,
        },
        front: {
          index: 41.25259780883789,
          diameter: 2.1377410888671875,
        },
      },
      {
        tongue: {
          index: 8.994352340698242,
          diameter: 1.6210113763809204,
        },
        front: {
          index: 41.25259780883789,
          diameter: 1.009834885597229,
        },
      },
    ],
  },
  ə: {
    graphemes: ["a", "er", "i", "ar", "our", "ur"],
    example: "about",
    constrictions: [
      {
        tongue: {
          index: 20.785303115844727,
          diameter: 2.817857027053833,
        },
      },
    ],
  },
  "👄": {
    example: "ulcer (c)",
    constrictions: {
      tongue: {
        index: 17.572158813476562,
        diameter: 1.8030052185058594,
      },
    },
  },
  "👅": {
    name: "under (u)",
    constrictions: {
      tongue: {
        index: 23.101163864135742,
        diameter: 1.9783293008804321,
      },
    },
  },
  eəʳ: {
    graphemes: ["air", "are", "ear", "ere", "eir", "ayer"],
    example: "chair",
    constrictions: [
      {
        tongue: {
          index: 25.950639724731445,
          diameter: 2.7277371883392334,
        },
        front: {
          index: 30.626760482788086,
          diameter: 2.7641139030456543,
        },
      },
      {
        tongue: {
          index: 18.080486297607422,
          diameter: 2.4796719551086426,
        },
        front: {
          index: 30.626760482788086,
          diameter: 0.8193863034248352,
        },
      },
    ],
  },
  "ɑ:": {
    graphemes: ["a"],
    example: "arm",
    constrictions: [
      {
        tongue: {
          index: 10.557442665100098,
          diameter: 2.313770055770874,
        },
        front: {
          index: 29.416595458984375,
          diameter: 2.8466663360595703,
        },
      },
      {
        tongue: {
          index: 10.557442665100098,
          diameter: 2.313770055770874,
        },
        front: {
          index: 30.795530319213867,
          diameter: 0.9675944447517395,
        },
      },
    ],
  },
  "ɜ:ʳ": {
    graphemes: ["ir", "er", "ur", "ear", "or", "our", "yr"],
    example: "bird",
    constrictions: {
      tongue: {
        index: 10.411890983581543,
        diameter: 2.438276529312134,
      },
      front: {
        index: 31.35202980041504,
        diameter: 1.0647456645965576,
      },
    },
  },
  ɔ: {
    graphemes: ["aw", "a", "or", "oor", "ore", "oar", "our", "augh", "ar", "ough", "au"],
    example: "paw",
    constrictions: {
      tongue: {
        index: 8.689467430114746,
        diameter: 1.7290281057357788,
      },
    },
  },
  ɪəʳ: {
    graphemes: ["ear", "eer", "ere", "ier"],
    example: "ear",
    constrictions: [
      {
        tongue: {
          index: 35.939178466796875,
          diameter: 1.3483505249023438,
        },
        front: {
          index: 31.535709381103516,
          diameter: 2.8012807369232178,
        },
      },
      {
        tongue: {
          index: 12.261784553527832,
          diameter: 2.4074597358703613,
        },
        front: {
          index: 32.213191986083984,
          diameter: 0.8435457944869995,
        },
      },
    ],
  },
  ʊəʳ: {
    graphemes: ["ure", "our"],
    example: "poor",
    constrictions: [
      {
        tongue: {
          index: 10.540653228759766,
          diameter: 2.058115243911743,
        },
        front: {
          index: 41.00702667236328,
          diameter: 0.8688546419143677,
        },
      },
      {
        tongue: {
          index: 14.251797676086426,
          diameter: 2.8314104080200195,
        },
        front: {
          index: 30.037519454956055,
          diameter: 0.913703441619873,
        },
      },
    ],
  },
};

for (const phoneme in phonemes) {
  const phonemeInfo = phonemes[phoneme];
  if ("alternative" in phonemeInfo) {
    const alternative = phonemes[phonemeInfo.alternative];
    alternative.alternative = phoneme;
    if (!phonemeInfo.constrictions) {
      phonemeInfo.constrictions = alternative.constrictions;
    }
  }
  phonemeInfo.type = "voiced" in phonemeInfo ? "consonant" : "vowel";

  if (!Array.isArray(phonemeInfo.constrictions)) {
    phonemeInfo.constrictions = [phonemeInfo.constrictions];
  }
}

const getInterpolation = (from, to, value) => {
  return (value - from) / (to - from);
};
const clamp = (value, min = 0, max = 1) => {
  return Math.max(min, Math.min(max, value));
};

// https://github.com/mrdoob/three.js/blob/master/src/math/MathUtils.js#L47
// https://www.gamedev.net/tutorials/programming/general-and-gameplay-programming/inverse-lerp-a-super-useful-yet-often-overlooked-function-r5230/
function inverseLerp(x, y, value) {
  if (x !== y) {
    return (value - x) / (y - x);
  } else {
    return 0;
  }
}

// https://github.com/mrdoob/three.js/blob/master/src/math/MathUtils.js#L62
// https://en.wikipedia.org/wiki/Linear_interpolation
function lerp(x, y, t) {
  return (1 - t) * x + t * y;
}

// https://github.com/aframevr/aframe/blob/f5f2790eca841bf633bdaa0110b0b59d36d7e854/src/utils/index.js#L140
/**
 * Returns debounce function that gets called only once after a set of repeated calls.
 *
 * @param {function} functionToDebounce
 * @param {number} wait - Time to wait for repeated function calls (milliseconds).
 * @param {boolean} immediate - Calls the function immediately regardless of if it should be waiting.
 * @returns {function} Debounced function.
 */
function debounce(func, wait, immediate) {
  var timeout;
  return function () {
    var context = this;
    var args = arguments;
    var later = function () {
      timeout = null;
      if (!immediate) func.apply(context, args);
    };
    var callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    if (callNow) func.apply(context, args);
  };
}

const alternateIPAs = {
  e: "ɛ",
  o: "ɒ",
  ɚ: "r",
  a: "ɒ",
  ɑ: "ɒ",
  ɹ: "r",
  //i: "ɪ",
  //u: "w",
  //ɔ: "ɒ",
  ʤ: "dʒ",
  ʧ: "tʃ",
};

for (const alternatePhoneme in alternateIPAs) {
  const phoneme = alternateIPAs[alternatePhoneme];
  phonemes[alternatePhoneme] = phonemes[phoneme];
  if (!phonemes[phoneme].aliases) {
    phonemes[phoneme].aliases = new Set();
  }
  phonemes[phoneme].aliases.add(phoneme);
  phonemes[phoneme].aliases.add(alternatePhoneme);
}

const utterances = [
  {
    name: "pleasure",
    keyframes: [
      {
        time: 0,
        name: "p",
        frequency: 156.8715057373047,
        "tongue.index": 12.899999618530273,
        "tongue.diameter": 2.430000066757202,
        "frontConstriction.index": 40.881263732910156,
        "frontConstriction.diameter": -0.422436386346817,
        tenseness: 0.5045413374900818,
        loudness: 0.8427993655204773,
        intensity: 0,
      },
      {
        time: 0.08958333333333333,
        name: "l",
        frequency: 190.45954805788224,
        "tongue.index": 16.921409606933594,
        "tongue.diameter": 1.9775906801223755,
        "frontConstriction.index": 34.73271560668945,
        "frontConstriction.diameter": 0.774807870388031,
        tenseness: 0.7361269593238831,
        loudness: 0.9262712597846985,
        intensity: 1,
      },
      {
        time: 0.2,
        name: "e",
        frequency: 140.82355356753655,
        "tongue.index": 25.9163875579834,
        "tongue.diameter": 2.715711832046509,
        "frontConstriction.index": 37.73653030395508,
        "frontConstriction.diameter": 2.874277114868164,
        tenseness: 0.7361269593238831,
        loudness: 0.9262712597846985,
        intensity: 1,
      },
      {
        time: 0.35208333333333325,
        name: "s",
        frequency: 102.00469207763672,
        "tongue.index": 23.960628509521484,
        "tongue.diameter": 1.543920636177063,
        "frontConstriction.index": 31.57721519470215,
        "frontConstriction.diameter": 0.3962106704711914,
        tenseness: 0.8181954026222229,
        loudness: 0.9509599804878235,
        intensity: 1,
      },
      {
        time: 0.4833333333333334,
        name: "ure",
        frequency: 82.13327455905124,
        "tongue.index": 12.490761756896973,
        "tongue.diameter": 1.8611775636672974,
        "frontConstriction.index": 28.101966857910156,
        "frontConstriction.diameter": 0.9815574884414673,
        tenseness: 0.6612620949745178,
        loudness: 0.9017650485038757,
        intensity: 0.7,
      },
      {
        time: 0.6812499999999999,
        name: ".",
        frequency: 81.25236574691407,
        "tongue.index": 12.490761756896973,
        "tongue.diameter": 1.8611775636672974,
        "frontConstriction.index": 28.101966857910156,
        "frontConstriction.diameter": 0.9815574884414673,
        tenseness: 0.6612620949745178,
        loudness: 0.9017650485038757,
        intensity: 0,
      },
    ],
  },
];

function deconstructVoiceness(voiceness) {
  const tenseness = 1 - Math.cos(voiceness * Math.PI * 0.5);
  const loudness = Math.pow(tenseness, 0.25);
  return { tenseness, loudness };
}

const phonemeSubstitutions = {
  accents: {},
  dialects: {
    boston: {
      ɑɹ: "a",
      ɑˈɹ: "a",
      ɑˈ: "wɑ",
    },
    southern: {
      aj: "æh",
      ɛ: "ej",
      ʌ: "👄",
      ə: "👅",
      e: "ɪ",
      ɪŋ: "ɪn",
    },
  },
  impediments: {
    lisp: {
      s: "θ",
      z: "ð",
      ʃ: "θ",
      ʒ: "ð",
    },
  },
  misc: {
    baby: {
      l: "w",
      ɹ: "w",
      t: "d",
      θ: "d",
      ʒ: "d",
      ð: "d",
    },
    slurring: {
      b: "m",
      p: "m",
      t: "n",
      s: "z",
      k: "g",
      θ: "ð",
      f: "v",
      ɪŋ: "ɪn",
      aj: "ʌ",
    },
  },
};

let holdTimes = {
  ˈ: 0.05,
  ˌ: 0.05,
  ".": 0.05,
};
let consonantHoldTime = 0.05;
let timeBetweenSubResults = 0.1; // seconds
let spaceTime = 0;
let releaseTime = 0.1;
let timeBetweenPhonemes = 0.1;
let timeBetweenSubPhonemes = 0.01;
let defaultVoiceness = 0.8;
let defaultVoiceless = 0.2;
const generateKeyframes = (pronunciation) => {
  const keyframes = [];
  Array.from(pronunciation).forEach((phoneme, index) => {
    if (nonPhonemeIPAs.includes(phoneme)) {
      return;
    }

    let offsetTime = 0.1;

    let holdTime = 0;
    let nextPhoneme = pronunciation[index + 1];
    if (nextPhoneme == "ˈ" || nextPhoneme == "ˌ") {
      holdTime = holdTimes[nextPhoneme];
    }

    const phonemeInfo = phonemes[phoneme];
    if (!phonemeInfo) return;
    const { type, voiced, constrictions } = phonemeInfo;
    if (type == "consonant") {
      // Use phoneme-specific holdTime if defined, otherwise default
      holdTime = "holdTime" in phonemeInfo ? phonemeInfo.holdTime : consonantHoldTime;
    }

    // Save phoneme index before inner loop (to avoid shadowing)
    const phonemeIndex = index;

    const _keyframes = [];
    constrictions.forEach((constriction, constrictionIndex) => {
      let name = phoneme;
      if (constrictions.length > 1) {
        name += `(${constrictionIndex})`;
      }

      // Use custom offsetTime if defined, otherwise default
      let onsetTime = timeBetweenPhonemes;
      if ("offsetTime" in phonemeInfo) {
        onsetTime = phonemeInfo.offsetTime;
      }

      // Calculate default timeDelta
      let defaultTimeDelta = constrictionIndex == constrictions.length - 1 ? timeBetweenPhonemes : (constrictionIndex == 0 ? onsetTime : timeBetweenSubPhonemes);

      const keyframe = {
        intensity: 1,
        name,
        // Use per-constriction duration if defined, otherwise default
        timeDelta: "duration" in constriction ? constriction.duration : defaultTimeDelta,
        "frontConstriction.diameter": 5,
        "backConstriction.diameter": 5,
        "noseConstriction.diameter": 5,
      };

      let voiceness = defaultVoiceness;
      if (type == "consonant") {
        voiceness = voiced ? defaultVoiceness : defaultVoiceless;
      }
      Object.assign(keyframe, deconstructVoiceness(voiceness));

      // Apply custom tenseness/loudness if defined in phoneme
      if ("tenseness" in phonemeInfo) {
        keyframe.tenseness = phonemeInfo.tenseness;
      }
      if ("loudness" in phonemeInfo) {
        keyframe.loudness = phonemeInfo.loudness;
      }

      for (const key in constriction) {
        for (const subKey in constriction[key]) {
          let string = key;
          if (key != "tongue") {
            string += "Constriction";
          }
          string += `.${subKey}`;
          keyframe[string] = constriction[key][subKey];
        }
      }
      _keyframes.push(keyframe);

      const holdKeyframe = Object.assign({}, keyframe);
      holdKeyframe.isHold = true;
      // Use per-constriction holdTime if defined, otherwise use phoneme holdTime
      holdKeyframe.timeDelta = "holdTime" in constriction ? constriction.holdTime : holdTime;
      holdKeyframe.name = `${holdKeyframe.name}]`;
      // Apply holdTenseness if defined
      if ("holdTenseness" in phonemeInfo) {
        holdKeyframe.tenseness = phonemeInfo.holdTenseness;
      }
      _keyframes.push(holdKeyframe);

      // For stop consonants (not word-initial), set closure phase to silent
      // Exception: word-initial stops (phonemeIndex == 0) and nasalStop phonemes (ŋ) keep intensity
      if (constrictionIndex == 0 && type == "consonant" && constrictions.length > 1 && phonemeIndex > 0 && !phonemeInfo.nasalStop) {
        _keyframes[_keyframes.length - 2].intensity = 0;  // X(0)
        _keyframes[_keyframes.length - 1].intensity = 0;  // X(0)]
      }
      // Force intensity=1 for nasalStop phonemes (ŋ) — nasal needs airflow
      if (constrictionIndex == 0 && phonemeInfo.nasalStop) {
        _keyframes[_keyframes.length - 2].intensity = 1;
        _keyframes[_keyframes.length - 1].intensity = 1;
      }
    });
    keyframes.push(..._keyframes);
  });
  return keyframes;
};

const RenderKeyframes = (keyframes, time = 0, frequency = 140, speed = 1) => {
  const _keyframes = [];
  keyframes.forEach((keyframe) => {
    const _keyframe = Object.assign({}, keyframe);
    if (_keyframe.timeDelta > 0) {
      time += _keyframe.timeDelta / speed;
      _keyframe.time = time;
      if ("semitones" in keyframe) {
        const { semitones } = keyframe;
        frequency *= 2 ** (semitones / 12);
      }
      _keyframe.frequency = frequency;
      delete _keyframe.timeDelta;
      _keyframes.push(_keyframe);
    }
  });
  _keyframes.push({
    name: ".",
    time: time + releaseTime / speed,
    frequency,
    intensity: 0,
  });
  return _keyframes;
};

const nonPhonemeIPAs = ["ˈ", "ˌ", "."];

const getPhonemesAlternativesFromWords = (wordsString, shouldTrimPronunciation = false) => {
  const wordsStrings = wordsString.split(" ");
  const wordsPhonemesAlternatives = [];
  const validWordStrings = [];

  wordsStrings.forEach((wordString) => {
    if (wordString.length > 0) {
      let ipas = TextToIPA._IPADict[wordString];
      if (ipas) {
        validWordStrings.push(wordString);
        ipas = ipas.slice();
        if (shouldTrimPronunciation) {
          ipas = ipas.map((ipa) => trimPronunciation(ipa));
        }
        wordsPhonemesAlternatives.push(ipas);
      }
    }
  });

  return { wordsPhonemesAlternatives, validWordStrings };
};

const splitPhonemesIntoSyllables = (_phonemes) => {
  const syllables = [];

  let currentSyllable;

  _phonemes = trimDuplicateAdjacentCharacters(_phonemes);

  _phonemes.split("").forEach((phoneme) => {
    if (phoneme in phonemes) {
      const { type } = phonemes[phoneme];
      const isSemiVowel = semiVowels.includes(phoneme);
      if (currentSyllable && currentSyllable.type == type && !isSemiVowel && !currentSyllable.isSemiVowel) {
        currentSyllable.phonemes += phoneme;
      } else {
        currentSyllable = { type, phonemes: phoneme, isSemiVowel };
        syllables.push(currentSyllable);
      }
    }
  });
  return syllables;
};

let semiVowels = ["w", "ɚ", "r", "ɹ", "j"];
//semiVowels.length = 0;

const trimDuplicateAdjacentCharacters = (string) =>
  string
    .replace(" ", "")
    .split("")
    .filter((char, i) => string[i - 1] != char)
    .join("");

const consonantGroups = [
  ["b", "p", "m", "n"],
  ["d", "t", "s", "z", "ð", "θ"],
  ["dʒ", "h", "tʃ", "ʃ", "ʒ", "ʤ", "ʧ"],
  ["f", "v", "w"],
  ["g", "k", "ŋ"],
  ["r", "ɚ", "ɹ"],
  ["l"],
];

const areConsonantsInSameGroup = (a, b) => {
  let consonantsAreInSameGroup = false;
  consonantGroups.some((consonantGroup) => {
    if (consonantGroup.includes(a)) {
      consonantsAreInSameGroup = consonantGroup.includes(b);
      return true;
    }
  });
  return consonantsAreInSameGroup;
};

const tractLengthRange = { min: 15, max: 88 };
const isTractLengthInRange = (tractLength) =>
  tractLength >= tractLengthRange.min && tractLength <= tractLengthRange.max;

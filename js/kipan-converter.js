/**
 * kipan-converter.js
 * 客源翠企盤（HakSpring-Kipan）輸入法並列格式轉換器
 *
 * 透過輕量 WebAssembly（`wasm/two_line_wasm.wasm`，編譯自 HakSpring-Kipan
 * Rust `engine/two-line` 核心）執行雙行轉換，確保網頁版與 macOS／Android
 * 共用同一套音韻、英文單字保留與雙向標點對齊規則。
 */

(function (global) {
  'use strict';

  const encoder = new TextEncoder();
  const decoder = new TextDecoder('utf-8');

  let wasmExports = null;
  let wasmInitPromise = null;

  function writeUtf8(str) {
    const bytes = encoder.encode(str || '');
    const ptr = wasmExports.alloc(bytes.length);
    if (bytes.length > 0) {
      new Uint8Array(wasmExports.memory.buffer, ptr, bytes.length).set(bytes);
    }
    return { ptr, len: bytes.length };
  }

  function readAndFreePacked(packed) {
    const big = typeof packed === 'bigint' ? packed : BigInt(packed);
    const ptr = Number(big >> 32n);
    const len = Number(big & 0xffffffffn);
    try {
      if (len === 0) return '';
      const slice = new Uint8Array(wasmExports.memory.buffer, ptr, len);
      return decoder.decode(slice);
    } finally {
      if (ptr !== 0 && len > 0) {
        wasmExports.dealloc(ptr, len);
      }
    }
  }

  /**
   * 載入並初始化 Rust `two_line_wasm.wasm`。
   * @param {string|ArrayBuffer|Uint8Array} [source='wasm/two_line_wasm.wasm']
   */
  async function initWasm(source) {
    if (wasmExports) return wasmExports;
    if (wasmInitPromise && !source) return wasmInitPromise;

    const loader = (async () => {
      let instance;
      if (source instanceof ArrayBuffer || ArrayBuffer.isView(source)) {
        const result = await WebAssembly.instantiate(source, {});
        instance = result.instance;
      } else {
        const url = source || 'wasm/two_line_wasm.wasm';
        if (typeof fetch === 'function') {
          const resp = await fetch(url);
          if (!resp.ok) {
            throw new Error(`Failed to fetch WASM (${resp.status}): ${url}`);
          }
          if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
              const result = await WebAssembly.instantiateStreaming(resp.clone(), {});
              instance = result.instance;
            } catch (_e) {
              const buf = await resp.arrayBuffer();
              const result = await WebAssembly.instantiate(buf, {});
              instance = result.instance;
            }
          } else {
            const buf = await resp.arrayBuffer();
            const result = await WebAssembly.instantiate(buf, {});
            instance = result.instance;
          }
        } else {
          throw new Error('No fetch() available; pass WASM bytes to initWasm(bytes)');
        }
      }
      wasmExports = instance.exports;
      return wasmExports;
    })();

    if (!source) {
      wasmInitPromise = loader;
    }
    return loader;
  }

  function isWasmReady() {
    return wasmExports !== null;
  }

  function ensureWasm() {
    if (!wasmExports) {
      throw new Error('KipanConverter WASM is not initialized. Call await KipanConverter.initWasm() first.');
    }
  }

  function convertPunctToRomance(p) {
    if (!p) return '';
    ensureWasm();
    const { ptr, len } = writeUtf8(p);
    try {
      return readAndFreePacked(wasmExports.convert_punct_to_romance_utf8(ptr, len));
    } finally {
      if (len > 0) wasmExports.dealloc(ptr, len);
    }
  }

  function convertPunctToHan(p) {
    if (!p) return '';
    ensureWasm();
    const { ptr, len } = writeUtf8(p);
    try {
      return readAndFreePacked(wasmExports.convert_punct_to_han_utf8(ptr, len));
    } finally {
      if (len > 0) wasmExports.dealloc(ptr, len);
    }
  }

  function convertKipanText(text, options = {}) {
    if (!text || typeof text !== 'string') {
      return {
        topText: '',
        bottomText: '',
        combinedText: '',
        topLines: [],
        bottomLines: [],
        pairs: [],
        detectedOrder: 'han-top',
      };
    }
    ensureWasm();
    const autoSpaceRomance = options.autoSpaceRomance ? 1 : 0;
    const forceOrder = options.forceOrder || 'auto';

    const t = writeUtf8(text);
    const o = writeUtf8(forceOrder);
    try {
      const jsonStr = readAndFreePacked(
        wasmExports.convert_kipan_text_json(t.ptr, t.len, autoSpaceRomance, o.ptr, o.len),
      );
      const raw = JSON.parse(jsonStr);
      return {
        topText: raw.top_text,
        bottomText: raw.bottom_text,
        combinedText: raw.combined_text,
        topLines: raw.top_lines,
        bottomLines: raw.bottom_lines,
        pairs: raw.pairs,
        detectedOrder: raw.detected_order,
      };
    } finally {
      if (t.len > 0) wasmExports.dealloc(t.ptr, t.len);
      if (o.len > 0) wasmExports.dealloc(o.ptr, o.len);
    }
  }

  const exported = {
    initWasm,
    isWasmReady,
    convertPunctToRomance,
    convertPunctToHan,
    convertKipanText,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  }
  if (typeof window !== 'undefined') {
    global.KipanConverter = exported;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);

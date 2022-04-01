const importObject = {
    memory: new WebAssembly.Memory({initial: 256, maximum: 256}),
    wasi_snapshot_preview1: {
      path_readlink() { },
      fd_fdstat_get() { },
      fd_close() { },
      fd_write() { },
      fd_read() { },
      fd_tell() { },
      fd_filestat_get() { },
      path_open() { },
      proc_exit() { },
      fd_prestat_get() { },
      fd_prestat_dir_name() { },
      environ_sizes_get() { },
      environ_get() { },
    }
};

fetch('/lyff.wasm').then(response =>
  response.arrayBuffer()
).then(bytes => WebAssembly.instantiate(bytes, importObject)).then(results => {
  instance = results.instance;
  exports = instance.exports;

  exports._board_init();  // setup lyff board

  setInterval(() => {
    exports._board_step();
    draw();
  }, 100);
}).catch(console.error);


function getBoardBuffer() {
  return new Uint8Array(exports.memory.buffer, exports._board_ref());
}

function draw() {
  const buffer = getBoardBuffer();

  const dim = 100;  // nb. fixed size
  canvas.width = canvas.height = dim + 2;
  canvas.style.width = canvas.style.height = `${dim*5}px`;
  const data = new ImageData(canvas.width, canvas.height);

  for (let x = 1; x <= dim; ++x) {
    for (let y = 1; y <= dim; ++y) {
      const pos = (y * (dim + 2)) + x;
       const i = (pos / 8) << 0;
       const off = 1 << (pos % 8);
       const alive = (buffer[i] & off);
       if (!alive) { continue; }

       const doff = (y * canvas.width + x) * 4;
       data.data[doff+0] = 255;
       data.data[doff+3] = 255;
    }
  }

  canvas.getContext('2d').putImageData(data, 0, 0)
}

const memory = new WebAssembly.Memory({initial: 256, maximum: 256});
const env = {'memory': memory};
const importObject = {env};


fetch('../out/main.wasm').then(response =>
  response.arrayBuffer()
).then(bytes => WebAssembly.instantiate(bytes, importObject)).then(results => {
  instance = results.instance;
  exports = instance.exports;
  
  exports._board_init();  // setup lyff board
  //debugger;
  draw();
 
  canvas.onclick = (ev) => {
    exports._board_step();
    draw();
  };
 
}).catch(console.error);


function getBoardBuffer() {
  return new Uint8Array(memory.buffer, exports._board_ref());
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

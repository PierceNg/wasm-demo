# Conway Life Demo

This is a reworked demonstration of WebAssembly with Free Pascal by Pierce
Ng (@PierceNg), based on the original by Dmitry Boyarintsev (@skalogryz).

## Running

### Linux

Tested on Ubuntu 20.04. You need FPC for Linux to compile the web server,
and FPC for WebAssembly to compile ```lyff.pas```. To set up FPC for
WebAssembly, see [README at root directory](/README.md).

Build it:

```
% ./linbuild.sh
Free Pascal Compiler version 3.2.2 [2022/01/13] for x86_64
Copyright (c) 1993-2021 by Florian Klaempfl and others
Target OS: Linux for x86-64
Compiling webserver.lpr
Linking webserver
22 lines compiled, 0.3 sec
Free Pascal Compiler version 3.3.1 [2022/03/27] for wasm32
Copyright (c) 1993-2022 by Florian Klaempfl and others
Target OS: The WebAssembly System Interface (WASI)
Compiling lyff.pas
Linking lyff.wasm
176 lines compiled, 0.1 sec
```

Run it:

```
% ./linrun.sh
Visit localhost:8000 with your web server.
```

